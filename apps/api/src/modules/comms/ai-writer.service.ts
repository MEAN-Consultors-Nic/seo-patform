import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface SeoEmailDraftInput {
  clientName: string;
  clientDomain?: string;
  periodLabel: string;
  kpis: {
    clicks?: { current?: number; previous?: number };
    impressions?: { current?: number; previous?: number };
    avgPosition?: { current?: number; previous?: number };
    top10?: { current?: number; previous?: number };
  };
  /** Only the items the strategist ticked will be referenced in the body. */
  actionsCompleted: string[];
  /** Optional context: notes / findings the operator wants included. */
  notes?: string;
  /** Sign-off / signature line. Defaults to a generic Media Spearhead greeting. */
  signOff?: string;
}

export interface SeoEmailDraftResult {
  subject: string;
  htmlBody: string;
  /** Model + tokens used, echoed back for diagnostics. */
  usage?: { model: string; inputTokens?: number; outputTokens?: number };
}

/**
 * AI-assisted email drafter for monthly SEO reports. Given a KPI
 * snapshot + the checked-off optimization actions, prompts Claude to
 * produce a client-facing HTML email that ONLY references what was
 * actually done — no fabrication.
 *
 * Requires ANTHROPIC_API_KEY. Returns a clear 503 when the key is
 * missing so the frontend can hide the AI button without needing to
 * probe for the key itself.
 */
@Injectable()
export class AiWriterService {
  private readonly logger = new Logger(AiWriterService.name);

  isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async draftSeoEmail(input: SeoEmailDraftInput): Promise<SeoEmailDraftResult> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'ANTHROPIC_API_KEY is not set on this environment.',
      );
    }
    if (!input.clientName?.trim()) {
      throw new BadRequestException('clientName is required.');
    }

    const prompt = this.buildPrompt(input);

    let res: Response;
    try {
      res = await fetch(CLAUDE_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
          max_tokens: 1500,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });
    } catch (e) {
      this.logger.error(`Anthropic fetch failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException(
        'Could not reach the AI writer service.',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`Anthropic returned ${res.status}: ${text}`);
      throw new ServiceUnavailableException(
        `AI writer error (HTTP ${res.status}). Try again in a moment.`,
      );
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      model?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const rawText =
      data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';

    // Claude returns "SUBJECT: ..." on the first line and HTML body
    // after. Parse both out. Falls back to a generic subject if the
    // model deviates from the format.
    const { subject, body } = this.parseSubjectAndBody(rawText, input);

    return {
      subject,
      htmlBody: body,
      usage: {
        model: data.model || DEFAULT_MODEL,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
    };
  }

  private buildPrompt(input: SeoEmailDraftInput): string {
    const kpiLines: string[] = [];
    const push = (label: string, cur?: number, prev?: number, unit = '') => {
      if (typeof cur !== 'number') return;
      const delta =
        typeof prev === 'number' && prev !== 0
          ? ` (${cur >= prev ? '+' : ''}${(((cur - prev) / prev) * 100).toFixed(1)}% vs ${prev}${unit})`
          : '';
      kpiLines.push(`- ${label}: ${cur}${unit}${delta}`);
    };
    push('Clicks', input.kpis.clicks?.current, input.kpis.clicks?.previous);
    push('Impressions', input.kpis.impressions?.current, input.kpis.impressions?.previous);
    push(
      'Avg position',
      input.kpis.avgPosition?.current,
      input.kpis.avgPosition?.previous,
    );
    push('Top-10 keywords', input.kpis.top10?.current, input.kpis.top10?.previous);

    const actionsBlock =
      input.actionsCompleted.length > 0
        ? input.actionsCompleted.map((a) => `- ${a}`).join('\n')
        : '(none listed by the strategist)';

    const signOff = input.signOff?.trim() || 'Media Spearhead — SEO team';
    const domainLine = input.clientDomain
      ? ` (${input.clientDomain})`
      : '';

    return [
      `You are the SEO team writing a client-facing monthly progress email to ${input.clientName}${domainLine}.`,
      ``,
      `Report period: ${input.periodLabel}.`,
      ``,
      `KPIs for the period:`,
      kpiLines.length ? kpiLines.join('\n') : '(no KPIs provided)',
      ``,
      `Optimization work actually completed this period — ONLY reference items from this list. Do not fabricate additional work:`,
      actionsBlock,
      ``,
      input.notes ? `Strategist notes to weave in:\n${input.notes}\n` : '',
      `Constraints:`,
      `- Output the subject line on the FIRST line, prefixed exactly with "SUBJECT: " (uppercase, colon, space).`,
      `- After the subject line, output the email BODY as valid HTML (no <html>/<head>/<body> wrapper — start directly with the greeting).`,
      `- Keep the body under ~250 words. Warm, plain-English tone. Use short paragraphs and one or two <ul> lists as needed.`,
      `- Do NOT invent metrics, actions, or dates that aren't in the input above.`,
      `- End with a soft next-step or offer to jump on a call, then sign off with: ${signOff}`,
      ``,
      `Return only the subject line and the HTML body — no preamble, no code fences.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseSubjectAndBody(
    raw: string,
    input: SeoEmailDraftInput,
  ): { subject: string; body: string } {
    const match = raw.match(/^\s*SUBJECT:\s*(.+?)\n([\s\S]*)$/);
    if (match) {
      return { subject: match[1].trim(), body: match[2].trim() };
    }
    // Fallback: whole output is the body, synthesize a subject.
    return {
      subject: `${input.clientName} — SEO update · ${input.periodLabel}`,
      body: raw.trim(),
    };
  }
}
