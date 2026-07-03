import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { PageFetcherService } from './page-fetcher.service';

/**
 * Discovers URLs from a site's sitemap.xml as a fallback / supplement
 * to HTML link discovery. Modern JS-only SPAs (Next.js, Wix, Webflow,
 * Squarespace) render an empty app-shell that cheerio can't extract
 * links from, but they almost always ship a sitemap because it's
 * standard SEO practice. This service tries the two common locations
 * plus anything referenced from robots.txt, dedupes, and returns the
 * flat list of URLs to seed the crawler with.
 *
 * XML parsing uses cheerio in xmlMode. Nested <sitemapindex> files
 * are followed one level deep — enough for the ~99% case without
 * risking infinite recursion.
 */
@Injectable()
export class SitemapLoaderService {
  private readonly logger = new Logger(SitemapLoaderService.name);
  private static readonly MAX_SITEMAPS_TO_FOLLOW = 20;
  private static readonly MAX_URLS_FROM_SITEMAPS = 2000;

  constructor(private readonly fetcher: PageFetcherService) {}

  /**
   * Returns a de-duplicated list of URLs discovered across all of the
   * site's sitemaps. Empty list means either the site has no sitemap
   * or all fetches failed — the caller should fall back to HTML link
   * discovery in that case.
   */
  async discover(
    rootUrl: string,
    userAgent?: string,
  ): Promise<string[]> {
    const candidateSitemaps: string[] = [];

    // 1) Check robots.txt for Sitemap: directives.
    try {
      const robotsUrl = new URL('/robots.txt', rootUrl).toString();
      const robotsRes = await this.fetcher.fetch(robotsUrl, userAgent);
      if (
        robotsRes.html ||
        (robotsRes.statusCode >= 200 && robotsRes.statusCode < 300)
      ) {
        // fetcher only returns .html for text/html content-type; robots.txt
        // usually comes back as text/plain so html is null. Fall back to
        // the raw body path by re-fetching without the html filter.
        const raw = await this.fetchRaw(robotsUrl, userAgent);
        if (raw) {
          const matches = raw.match(/^\s*sitemap:\s*(\S+)/gim);
          if (matches) {
            for (const line of matches) {
              const url = line.replace(/^\s*sitemap:\s*/i, '').trim();
              if (url) candidateSitemaps.push(url);
            }
          }
        }
      }
    } catch {
      // Robots.txt is optional — no worries if it 404s.
    }

    // 2) Fall back to the conventional locations if robots.txt didn't
    //    point us anywhere.
    if (candidateSitemaps.length === 0) {
      try {
        candidateSitemaps.push(new URL('/sitemap.xml', rootUrl).toString());
        candidateSitemaps.push(
          new URL('/sitemap_index.xml', rootUrl).toString(),
        );
      } catch {
        return [];
      }
    }

    const urls = new Set<string>();
    const visited = new Set<string>();
    const queue = [...candidateSitemaps];
    let visitedCount = 0;

    while (
      queue.length > 0 &&
      visitedCount < SitemapLoaderService.MAX_SITEMAPS_TO_FOLLOW
    ) {
      const sitemapUrl = queue.shift()!;
      if (visited.has(sitemapUrl)) continue;
      visited.add(sitemapUrl);
      visitedCount++;

      const raw = await this.fetchRaw(sitemapUrl, userAgent);
      if (!raw) continue;
      const parsed = this.parseSitemap(raw);
      // Sitemap index → follow each child sitemap (bounded).
      for (const child of parsed.childSitemaps) {
        if (!visited.has(child)) queue.push(child);
      }
      for (const url of parsed.urls) {
        urls.add(url);
        if (urls.size >= SitemapLoaderService.MAX_URLS_FROM_SITEMAPS) break;
      }
      if (urls.size >= SitemapLoaderService.MAX_URLS_FROM_SITEMAPS) break;
    }

    return Array.from(urls);
  }

  /**
   * Fetch raw body regardless of content-type (sitemap servers vary:
   * text/xml, application/xml, application/rss+xml, sometimes text/plain
   * for gzipped .xml.gz — for now we skip .gz which pretty much all
   * modern sites don't need). PageFetcherService only decodes text/html
   * bodies, so we go through undici directly here.
   */
  private async fetchRaw(
    url: string,
    userAgent?: string,
  ): Promise<string | null> {
    try {
      const { request } = await import('undici');
      const res = await request(url, {
        method: 'GET',
        headers: {
          'user-agent':
            userAgent ||
            'Mozilla/5.0 (compatible; MediaSpearheadCrawler/1.0; +https://seo-tracker.mediaspearhead.com/bot)',
          accept: 'application/xml, text/xml, text/plain, */*',
          'accept-encoding': 'gzip, br, deflate',
        },
        headersTimeout: 10_000,
        bodyTimeout: 10_000,
        maxRedirections: 5,
      });
      if (res.statusCode < 200 || res.statusCode >= 400) {
        res.body.destroy();
        return null;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      const MAX = 10 * 1024 * 1024; // 10MB — sitemaps are usually well under.
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as Uint8Array);
        bytes += buf.length;
        if (bytes > MAX) break;
        chunks.push(buf);
      }
      return Buffer.concat(chunks).toString('utf8');
    } catch (err) {
      this.logger.warn(
        `Sitemap fetch failed for ${url}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Extracts URLs from a sitemap XML body. Handles both regular
   * <urlset> sitemaps and <sitemapindex> files with references to
   * child sitemaps. Uses cheerio in xmlMode so it never mis-parses
   * self-closing tags or entity references.
   */
  private parseSitemap(xml: string): {
    urls: string[];
    childSitemaps: string[];
  } {
    try {
      const $ = cheerio.load(xml, { xmlMode: true });
      const urls: string[] = [];
      const childSitemaps: string[] = [];
      $('urlset url loc').each((_, el) => {
        const t = $(el).text().trim();
        if (t) urls.push(t);
      });
      $('sitemapindex sitemap loc').each((_, el) => {
        const t = $(el).text().trim();
        if (t) childSitemaps.push(t);
      });
      // Fallback for sitemaps without the outer wrapper tags — just
      // scoop every <loc> value.
      if (urls.length === 0 && childSitemaps.length === 0) {
        $('loc').each((_, el) => {
          const t = $(el).text().trim();
          if (!t) return;
          // Heuristic: sitemap index children usually end in .xml or
          // .xml.gz — everything else is treated as a page URL.
          if (/\.xml(\.gz)?$/i.test(t)) childSitemaps.push(t);
          else urls.push(t);
        });
      }
      return { urls, childSitemaps };
    } catch {
      return { urls: [], childSitemaps: [] };
    }
  }
}
