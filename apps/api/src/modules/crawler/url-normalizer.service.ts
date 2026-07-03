import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import normalizeUrl from 'normalize-url';

/**
 * URL helpers used by the crawler for dedupe + edge referencing.
 * Normalization strategy:
 *   - lowercase host
 *   - strip default ports (80, 443)
 *   - strip fragment
 *   - sort query params (deterministic ordering)
 *   - strip common tracking params (utm_*, gclid, fbclid, mc_eid, ...)
 *   - remove trailing slash EXCEPT when the path is bare ('/')
 *   - session-in-URL params (jsessionid, phpsessid) always stripped
 *
 * urlHash = sha1(normalizedUrl). Used as the primary edge key so
 * incoming/outgoing arrays stay compact.
 */
@Injectable()
export class UrlNormalizerService {
  private static readonly SESSION_PARAMS = [
    'jsessionid',
    'phpsessid',
    'aspsessionid',
    'sid',
  ];

  /**
   * Returns the normalized URL string or null if the input isn't a
   * valid absolute URL we should crawl.
   */
  normalize(url: string, options: { ignoreUtm?: boolean } = {}): string | null {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
      const stripParams: string[] = [...UrlNormalizerService.SESSION_PARAMS];
      const ignoreUtm = options.ignoreUtm !== false;
      if (ignoreUtm) {
        stripParams.push(
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'utm_term',
          'utm_content',
          'utm_id',
          'gclid',
          'fbclid',
          'mc_eid',
          'mc_cid',
          'msclkid',
          'igshid',
        );
      }
      return normalizeUrl(trimmed, {
        stripHash: true,
        stripWWW: false,
        removeQueryParameters: stripParams,
        sortQueryParameters: true,
        removeTrailingSlash: true,
        removeSingleSlash: false,
      });
    } catch {
      return null;
    }
  }

  hash(normalized: string): string {
    return createHash('sha1').update(normalized).digest('hex');
  }

  /**
   * Resolves a possibly-relative href against a base URL. Returns null
   * for hrefs the crawler should ignore: mailto:, tel:, javascript:,
   * anchor-only, protocol-relative to other domains.
   */
  resolveHref(href: string, base: string): string | null {
    if (!href) return null;
    const t = href.trim();
    if (!t) return null;
    if (t.startsWith('#')) return null;
    if (/^mailto:/i.test(t)) return null;
    if (/^tel:/i.test(t)) return null;
    if (/^javascript:/i.test(t)) return null;
    if (/^data:/i.test(t)) return null;
    try {
      const u = new URL(t, base);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  /**
   * True when target and base share the same host. Strips 'www.' from
   * both sides before comparing so mbglogistics.com and www.mbglogistics.com
   * are treated as the same origin. Case-insensitive. This is the
   * common case for sites that redirect between the two — without this
   * every internal link would be filtered out and the crawl would stop
   * after the root page.
   */
  isSameOrigin(target: string, base: string): boolean {
    try {
      const t = new URL(target);
      const b = new URL(base);
      const th = t.host.toLowerCase().replace(/^www\./, '');
      const bh = b.host.toLowerCase().replace(/^www\./, '');
      return th === bh;
    } catch {
      return false;
    }
  }
}
