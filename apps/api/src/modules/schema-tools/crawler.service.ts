import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

const USER_AGENT = 'MediaSpearheadSchemaBot/1.0 (+seo-platform)';
const FETCH_TIMEOUT_MS = 10_000;
const POLITENESS_DELAY_MS = 300;
const SKIP_EXT = /\.(pdf|jpg|jpeg|png|gif|svg|webp|ico|js|css|woff2?|ttf|otf|mp4|webm|mp3|wav|zip|gz|tar|xml|rss|json)$/i;

export interface FetchedPage {
  url: string;
  status: number;
  contentType?: string;
  html?: string;
  links: string[];
  error?: string;
}

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger(CrawlerService.name);

  /**
   * BFS crawl starting from startUrl, restricted to the same hostname.
   * Returns up to `limit` HTML pages. Respects a simple robots.txt
   * disallow list and applies a politeness delay between requests.
   */
  async crawl(startUrl: string, limit: number, errors: string[]): Promise<FetchedPage[]> {
    const start = new URL(startUrl);
    const origin = start.origin;
    const hostname = start.hostname;

    const disallow = await this.fetchRobotsDisallow(origin, errors);

    const visited = new Set<string>();
    const queue: string[] = [this.canonicalize(start.toString())];
    const pages: FetchedPage[] = [];

    while (queue.length > 0 && pages.length < limit) {
      const url = queue.shift()!;
      if (visited.has(url)) continue;
      visited.add(url);

      if (this.isDisallowed(url, disallow)) continue;
      if (SKIP_EXT.test(new URL(url).pathname)) continue;

      const page = await this.fetchPage(url);
      pages.push(page);

      if (page.html) {
        for (const link of page.links) {
          try {
            const u = new URL(link, url);
            if (u.hostname !== hostname) continue;
            const c = this.canonicalize(u.toString());
            if (!visited.has(c) && !queue.includes(c)) queue.push(c);
          } catch {
            // ignore unparseable
          }
        }
      }

      // Politeness
      await new Promise((r) => setTimeout(r, POLITENESS_DELAY_MS));
    }

    return pages;
  }

  private async fetchPage(url: string): Promise<FetchedPage> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'follow',
      });
      const contentType = res.headers.get('content-type') || undefined;
      if (!contentType || !/text\/html|application\/xhtml/i.test(contentType)) {
        return { url, status: res.status, contentType, links: [] };
      }
      const html = await res.text();
      const links = this.extractLinks(html, url);
      return { url, status: res.status, contentType, html, links };
    } catch (err) {
      return {
        url,
        status: 0,
        links: [],
        error: (err as Error).message,
      };
    }
  }

  private extractLinks(html: string, baseUrl: string): string[] {
    try {
      const $ = cheerio.load(html);
      const links = new Set<string>();
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
          return;
        try {
          const abs = new URL(href, baseUrl).toString().split('#')[0];
          links.add(abs);
        } catch {
          // skip
        }
      });
      return [...links];
    } catch {
      return [];
    }
  }

  private canonicalize(url: string): string {
    try {
      const u = new URL(url);
      u.hash = '';
      // Strip trailing slash except on root
      if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.replace(/\/+$/, '');
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  private async fetchRobotsDisallow(origin: string, errors: string[]): Promise<string[]> {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const text = await res.text();
      // Naive: collect Disallow rules under the wildcard or our UA group.
      const lines = text.split(/\r?\n/);
      let inOurGroup = false;
      const disallow: string[] = [];
      for (const rawLine of lines) {
        const line = rawLine.replace(/#.*$/, '').trim();
        if (!line) continue;
        const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
        if (!m) continue;
        const directive = m[1].toLowerCase();
        const value = m[2].trim();
        if (directive === 'user-agent') {
          inOurGroup = value === '*' || value.toLowerCase().includes('mediaspearhead');
        } else if (directive === 'disallow' && inOurGroup && value) {
          disallow.push(value);
        }
      }
      return disallow;
    } catch (err) {
      errors.push(`robots.txt: ${(err as Error).message}`);
      return [];
    }
  }

  private isDisallowed(url: string, disallow: string[]): boolean {
    if (disallow.length === 0) return false;
    try {
      const path = new URL(url).pathname;
      return disallow.some((rule) => {
        // Simple prefix match — good enough for an MVP.
        if (!rule) return false;
        if (rule.endsWith('$')) {
          return path === rule.slice(0, -1);
        }
        return path.startsWith(rule);
      });
    } catch {
      return false;
    }
  }
}
