import { Injectable, Logger } from '@nestjs/common';
import { request, Dispatcher } from 'undici';

/**
 * Raw HTTP result of fetching one page. `finalUrl` is the URL after
 * following any redirects; `redirectChain` is the list of URLs the
 * browser would have hit along the way (empty when there were none).
 * `html` is only set for 2xx text/html responses; non-HTML pages
 * (PDFs, images, JSON) get `body: null` and the caller records the
 * status without parsing.
 */
export interface FetchResult {
  finalUrl: string;
  statusCode: number;
  redirectChain: string[];
  contentType?: string;
  contentLength?: number;
  responseTimeMs: number;
  html: string | null;
  error?: string;
}

/**
 * HTTP client for the crawler. Uses undici (Node's native HTTP/2-capable
 * client) with the following guardrails:
 *   - request timeout: 10s
 *   - max redirects: 5 (redirect loops → error)
 *   - max response size: 5MB (prevents a rogue PDF/download OOM'ing the dyno)
 *   - only decodes text/html; other content types return html=null
 *   - accepts gzip + br via Undici's built-in decompression
 */
@Injectable()
export class PageFetcherService {
  private readonly logger = new Logger(PageFetcherService.name);
  private static readonly TIMEOUT_MS = 10_000;
  private static readonly MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
  private static readonly MAX_REDIRECTS = 5;
  /**
   * User-Agent following Google's own convention: real browser UA
   * string with a compatible-crawler suffix that clearly identifies us.
   * This gets us past most Cloudflare / WordPress security plugin
   * bot-gates that returned empty pages to the plain 'MediaSpearheadCrawler'
   * UA. The '+URL' suffix is the standard way to give webmasters a way
   * to identify or block our crawler if they want to.
   */
  private static readonly DEFAULT_UA =
    'Mozilla/5.0 (compatible; MediaSpearheadCrawler/1.0; +https://seo-tracker.mediaspearhead.com/bot)';

  async fetch(url: string, userAgent?: string): Promise<FetchResult> {
    const start = Date.now();
    const redirectChain: string[] = [];
    let currentUrl = url;

    try {
      for (let hop = 0; hop <= PageFetcherService.MAX_REDIRECTS; hop++) {
        const res: Dispatcher.ResponseData = await request(currentUrl, {
          method: 'GET',
          headers: {
            'user-agent': userAgent || PageFetcherService.DEFAULT_UA,
            accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            'accept-encoding': 'gzip, br, deflate',
          },
          headersTimeout: PageFetcherService.TIMEOUT_MS,
          bodyTimeout: PageFetcherService.TIMEOUT_MS,
          maxRedirections: 0, // handle manually so we can capture the chain
        });

        const statusCode = res.statusCode;
        const location = this.headerString(res.headers, 'location');
        if (
          [301, 302, 303, 307, 308].includes(statusCode) &&
          location &&
          hop < PageFetcherService.MAX_REDIRECTS
        ) {
          try {
            const next = new URL(location, currentUrl).toString();
            if (redirectChain.includes(next)) {
              // Redirect loop — abort with the current chain intact.
              res.body.destroy();
              return {
                finalUrl: currentUrl,
                statusCode,
                redirectChain,
                responseTimeMs: Date.now() - start,
                html: null,
                error: 'Redirect loop detected',
              };
            }
            redirectChain.push(next);
            currentUrl = next;
            res.body.destroy();
            continue;
          } catch {
            res.body.destroy();
            return {
              finalUrl: currentUrl,
              statusCode,
              redirectChain,
              responseTimeMs: Date.now() - start,
              html: null,
              error: 'Invalid Location header',
            };
          }
        }

        const contentType = this.headerString(res.headers, 'content-type');
        const contentLength = this.headerNumber(
          res.headers,
          'content-length',
        );

        // Only decode HTML. Non-HTML pages (PDFs, JSON, images) get the
        // status recorded but the body is discarded to save memory.
        const isHtml = !!contentType && /text\/html/i.test(contentType);
        let html: string | null = null;
        if (isHtml && statusCode >= 200 && statusCode < 400) {
          html = await this.readBodyCapped(res);
        } else {
          res.body.destroy();
        }

        return {
          finalUrl: currentUrl,
          statusCode,
          redirectChain,
          contentType,
          contentLength,
          responseTimeMs: Date.now() - start,
          html,
        };
      }

      return {
        finalUrl: currentUrl,
        statusCode: 0,
        redirectChain,
        responseTimeMs: Date.now() - start,
        html: null,
        error: 'Too many redirects',
      };
    } catch (err) {
      return {
        finalUrl: currentUrl,
        statusCode: 0,
        redirectChain,
        responseTimeMs: Date.now() - start,
        html: null,
        error: (err as Error).message,
      };
    }
  }

  private headerString(
    headers: Dispatcher.ResponseData['headers'],
    name: string,
  ): string | undefined {
    const v = headers[name];
    if (Array.isArray(v)) return v[0];
    return typeof v === 'string' ? v : undefined;
  }

  private headerNumber(
    headers: Dispatcher.ResponseData['headers'],
    name: string,
  ): number | undefined {
    const raw = this.headerString(headers, name);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  /**
   * Streams up to MAX_RESPONSE_BYTES from the response body. Bails
   * early once the cap is hit — everything past that is discarded so
   * a 100MB HTML file (or a mislabeled binary) can't OOM the dyno.
   */
  private async readBodyCapped(
    res: Dispatcher.ResponseData,
  ): Promise<string> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as Uint8Array);
        bytes += buf.length;
        if (bytes > PageFetcherService.MAX_RESPONSE_BYTES) {
          // Consume the rest to release the connection cleanly.
          break;
        }
        chunks.push(buf);
      }
    } finally {
      res.body.destroy();
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
