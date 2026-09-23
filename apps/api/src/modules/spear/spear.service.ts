import { Injectable, Logger } from '@nestjs/common';

/**
 * Connectivity probe for the Spear API (mediaspearhead.com/internal-tools).
 *
 * This exists to answer one question that cannot be answered from a
 * developer's laptop: can *this server* reach Spear? The relevant
 * obstacle is not the API — it is SiteGround's WAF in front of it, which
 * challenges requests whose User-Agent looks like a script and scores
 * datacenter addresses more harshly than residential ones. Spear's own
 * reference records two integrations that were stopped dead by exactly
 * that, and notes a clean datacenter address being challenged partway
 * through a test run.
 *
 * So a probe that passes locally proves nothing about Heroku. This runs
 * from wherever the API is deployed and reports what actually came back.
 *
 * Two rules the WAF imposes, both honoured here:
 *   - send the full header set with a named User-Agent; a script
 *     claiming to be Chrome is scored worse than one that says what it
 *     is, because the TLS fingerprint gives it away either way
 *   - never retry a challenge. A 202 + sgcaptcha will not succeed on a
 *     second attempt and the retry itself is scored. One attempt, then
 *     report.
 */

export type SpearVerdict =
  | 'reachable'
  | 'waf_challenge'
  | 'auth_rejected'
  | 'server_error'
  | 'unreachable'
  | 'not_configured';

export interface SpearConnectionResult {
  ok: boolean;
  verdict: SpearVerdict;
  endpoint: string;
  httpStatus: number | null;
  contentType: string | null;
  latencyMs: number;
  /** One sentence, safe to show a user. */
  message: string;
  /** What to do about it, when there is something to do. */
  detail?: string;
  /** Small excerpt proving real data came back — never the whole payload. */
  sample?: Record<string, unknown>;
  checkedAt: string;
}

/** The two endpoints safe to probe: both read-only, neither writes. */
const PROBES = {
  catalog: {
    path: 'catalog.php',
    method: 'GET' as const,
    body: undefined as string | undefined,
    label: 'catalog.php — the proposal vocabulary',
  },
  describe: {
    path: 'ads-ops.php',
    method: 'POST' as const,
    // `describe` is documented as running before the database is touched,
    // so it answers even when Spear's DB is down. That makes it the
    // cleanest signal of "the door itself is open".
    body: JSON.stringify({ action: 'describe' }),
    label: 'ads-ops.php {action:"describe"} — the live vocabularies',
  },
};

export type SpearProbe = keyof typeof PROBES;

const BASE = 'https://mediaspearhead.com/internal-tools/api/';
const TIMEOUT_MS = 20_000;

@Injectable()
export class SpearService {
  private readonly logger = new Logger(SpearService.name);

  isConfigured(): boolean {
    return (process.env.COMPANY_API_KEY || '').trim().length >= 24;
  }

  /**
   * Fires one request and classifies what came back. Never throws — the
   * whole point is to report the failure, so every path returns a
   * result the UI can render.
   */
  async testConnection(
    probe: SpearProbe = 'catalog',
  ): Promise<SpearConnectionResult> {
    const spec = PROBES[probe] ?? PROBES.catalog;
    const endpoint = `${BASE}${spec.path}`;
    const checkedAt = new Date().toISOString();
    const key = (process.env.COMPANY_API_KEY || '').trim();

    const base = {
      endpoint: spec.label,
      httpStatus: null as number | null,
      contentType: null as string | null,
      latencyMs: 0,
      checkedAt,
    };

    if (key.length < 24) {
      return {
        ...base,
        ok: false,
        verdict: 'not_configured',
        message: 'No Spear API key is configured on this server.',
        detail:
          'Set COMPANY_API_KEY as a config var on the API host. A key shorter than 24 characters is dropped at load, so a half-pasted key looks the same as no key at all.',
      };
    }

    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: spec.method,
        signal: ctrl.signal,
        headers: {
          'X-Spear-Api-Key': key,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          // Named per the reference: one User-Agent per caller, so a log
          // line on their side says which of our integrations it was.
          'User-Agent':
            'spear-seo-platform/1.0 (+https://mediaspearhead.com)',
        },
        body: spec.body,
      });
      clearTimeout(timer);

      const latencyMs = Date.now() - started;
      const contentType = res.headers.get('content-type');
      const raw = await res.text();

      const common = {
        endpoint: spec.label,
        httpStatus: res.status,
        contentType,
        latencyMs,
        checkedAt,
      };

      // The documented trap: the WAF answers 202 with an HTML body
      // containing sgcaptcha — not a 401, not JSON. Checked before
      // anything else because it masquerades as success.
      if (raw.includes('sgcaptcha') || (res.status === 202 && !this.looksJson(contentType))) {
        return {
          ...common,
          ok: false,
          verdict: 'waf_challenge',
          message:
            "SiteGround's WAF challenged this server instead of letting the request through.",
          detail:
            'The request never reached PHP, so the key is not the problem. This address needs allow-listing on their side (SiteGround ticket), or the calls need to originate from an address that is already trusted. Do not retry in a loop — repeat attempts are scored and make it worse.',
        };
      }

      if (!this.looksJson(contentType)) {
        return {
          ...common,
          ok: false,
          verdict: 'unreachable',
          message: `Spear answered ${res.status} with ${contentType || 'an unknown content type'} instead of JSON.`,
          detail: this.excerpt(raw),
        };
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {
          ...common,
          ok: false,
          verdict: 'unreachable',
          message: 'Spear answered with a body that is not valid JSON.',
          detail: this.excerpt(raw),
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ...common,
          ok: false,
          verdict: 'auth_rejected',
          message:
            res.status === 401
              ? 'Spear rejected the API key.'
              : 'The key was accepted but this role is not allowed here.',
          detail: String(parsed.error ?? '').slice(0, 300) || undefined,
        };
      }

      if (!res.ok || parsed.ok !== true) {
        return {
          ...common,
          ok: false,
          verdict: 'server_error',
          message: `Spear answered ${res.status}: ${String(parsed.error ?? 'no error message')}`.slice(0, 300),
          detail: parsed.code ? `code: ${String(parsed.code)}` : undefined,
        };
      }

      return {
        ...common,
        ok: true,
        verdict: 'reachable',
        message: `Spear answered in ${latencyMs} ms and the key was accepted.`,
        sample: this.sampleOf(probe, parsed),
      };
    } catch (err) {
      clearTimeout(timer);
      const e = err as { name?: string; message?: string };
      const aborted = e.name === 'AbortError';
      return {
        ...base,
        ok: false,
        latencyMs: Date.now() - started,
        verdict: 'unreachable',
        message: aborted
          ? `No answer within ${TIMEOUT_MS / 1000} s.`
          : `Could not reach Spear: ${e.message || 'network error'}`,
        detail: aborted
          ? 'Either the host is blocking this address silently, or the endpoint is slow enough to need a longer timeout.'
          : undefined,
      };
    }
  }

  private looksJson(contentType: string | null): boolean {
    return !!contentType && contentType.toLowerCase().includes('json');
  }

  private excerpt(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  /**
   * A handful of fields that prove real data came back, rather than the
   * whole payload — catalog alone is tens of kilobytes.
   */
  private sampleOf(
    probe: SpearProbe,
    parsed: Record<string, unknown>,
  ): Record<string, unknown> {
    const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    if (probe === 'describe') {
      return {
        version: parsed.version ?? null,
        actions: parsed.actions ?? [],
        readKinds: len(parsed.reads),
        windows: parsed.windows ?? [],
      };
    }
    return {
      owners: parsed.owners ?? [],
      stages: parsed.stages ?? [],
      services: Array.isArray(parsed.services)
        ? (parsed.services as Array<{ slug?: string }>).map((s) => s.slug)
        : [],
      industries: len(parsed.industries),
      monthlyFees: len(parsed.monthly_fees),
    };
  }
}
