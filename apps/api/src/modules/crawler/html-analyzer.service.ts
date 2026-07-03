import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface AnalyzedHtml {
  title?: string;
  metaDescription?: string;
  h1s: string[];
  canonical?: string;
  robotsMeta?: string;
  /** Absolute URLs of every internal-ish link on the page (resolution + same-origin filter happen upstream). */
  links: string[];
}

/**
 * Extracts SEO-relevant signals from a fetched HTML string. Uses cheerio
 * (htmlparser2 under the hood) which is the standard for Node-side
 * HTML analysis. The cheerio instance is discarded after each parse
 * so garbage collection can reclaim memory before the next page fetch.
 */
@Injectable()
export class HtmlAnalyzerService {
  analyze(html: string): AnalyzedHtml {
    const $ = cheerio.load(html, { xmlMode: false });

    const title = this.text($('title').first());
    const metaDescription = this.attr(
      $('meta[name="description"]').first(),
      'content',
    );
    const canonical = this.attr($('link[rel="canonical"]').first(), 'href');
    const robotsMeta = this.attr(
      $('meta[name="robots"]').first(),
      'content',
    )?.toLowerCase();

    const h1s: string[] = [];
    $('h1').each((_, el) => {
      const t = $(el).text().trim();
      if (t) h1s.push(t.slice(0, 500)); // cap absurdly long H1s
    });

    // Collect every href from <a> tags. Upstream normalizer + same-origin
    // filter decides which ones actually enter the queue.
    const seen = new Set<string>();
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (seen.has(href)) return;
      seen.add(href);
      links.push(href);
    });

    return {
      title: title || undefined,
      metaDescription: metaDescription || undefined,
      h1s,
      canonical: canonical || undefined,
      robotsMeta: robotsMeta || undefined,
      links,
    };
  }

  private text(el: cheerio.Cheerio<import('domhandler').Element>): string {
    return el.text()?.trim() || '';
  }

  private attr(
    el: cheerio.Cheerio<import('domhandler').Element>,
    name: string,
  ): string | undefined {
    const v = el.attr(name);
    return v ? v.trim() : undefined;
  }
}
