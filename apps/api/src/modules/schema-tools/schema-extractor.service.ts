import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { SchemaItem } from './types';

@Injectable()
export class SchemaExtractorService {
  /**
   * Extract structured data from an HTML document. Returns both JSON-LD
   * blocks (parsed) and Microdata trees (converted to a JSON-LD-ish shape).
   */
  extract(html: string, pageUrl: string): SchemaItem[] {
    const $ = cheerio.load(html);
    const out: SchemaItem[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
      const text = $(el).contents().text().trim();
      if (!text) return;
      try {
        // JSON-LD sites sometimes use HTML entities or trailing commas; try a
        // light cleanup before parsing.
        const cleaned = text
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/,\s*([}\]])/g, '$1');
        const parsed = JSON.parse(cleaned);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          // Some sites wrap multiple items under a single "@graph" array.
          if (item && typeof item === 'object' && Array.isArray(item['@graph'])) {
            for (const g of item['@graph']) {
              out.push({ source: 'json-ld', raw: g });
            }
          } else {
            out.push({ source: 'json-ld', raw: item });
          }
        }
      } catch {
        // skip invalid JSON-LD blocks silently — they're a real-world fact
      }
    });

    // Microdata: walk top-level [itemscope] elements without an itemscope
    // ancestor and convert to JSON-LD.
    $('[itemscope]').each((_, el) => {
      const $el = $(el);
      // Skip nested itemscopes — they'll be picked up via their parent.
      if ($el.parents('[itemscope]').length > 0) return;
      const node = this.microdataToJsonLd($, $el, pageUrl);
      if (node) out.push({ source: 'microdata', raw: node });
    });

    return out;
  }

  private microdataToJsonLd(
    $: cheerio.CheerioAPI,
    $el: cheerio.Cheerio<any>,
    pageUrl: string,
  ): Record<string, unknown> | null {
    const itemtype = $el.attr('itemtype');
    const itemid = $el.attr('itemid');
    const node: Record<string, unknown> = {};
    if (itemtype) {
      // Schema.org Microdata uses full URLs (http://schema.org/Person).
      // Strip the namespace to just the type name.
      const type = itemtype
        .split(/\s+/)
        .map((u) => u.replace(/^https?:\/\/schema\.org\//, ''))
        .filter(Boolean);
      node['@type'] = type.length === 1 ? type[0] : type;
    }
    if (itemid) node['@id'] = this.absoluteUrl(itemid, pageUrl);

    $el.find('[itemprop]').each((_, child) => {
      const $child = $(child);
      // Only direct properties — those whose nearest [itemscope] ancestor is $el.
      const closestScope = $child.closest('[itemscope]');
      if (closestScope.get(0) !== $el.get(0)) return;

      const propNames = ($child.attr('itemprop') || '').split(/\s+/).filter(Boolean);
      let value: unknown;
      if ($child.attr('itemscope') !== undefined) {
        value = this.microdataToJsonLd($, $child, pageUrl);
      } else {
        value = this.readMicrodataValue($child, pageUrl);
      }

      for (const name of propNames) {
        if (name in node) {
          const existing = node[name];
          node[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
        } else {
          node[name] = value;
        }
      }
    });

    return Object.keys(node).length > 0 ? node : null;
  }

  private readMicrodataValue(
    $el: cheerio.Cheerio<any>,
    pageUrl: string,
  ): string {
    const tag = $el.get(0)?.type === 'tag' ? ($el.get(0) as { name: string }).name : '';
    const attrPick = (name: string) => $el.attr(name);

    let raw: string | undefined;
    if (['meta'].includes(tag)) raw = attrPick('content');
    else if (['a', 'link', 'area'].includes(tag)) raw = attrPick('href');
    else if (['img', 'audio', 'embed', 'iframe', 'source', 'track', 'video'].includes(tag))
      raw = attrPick('src');
    else if (['object'].includes(tag)) raw = attrPick('data');
    else if (['time'].includes(tag)) raw = attrPick('datetime');
    else if (['data', 'meter'].includes(tag)) raw = attrPick('value');

    const text = (raw ?? $el.text() ?? '').trim();
    // Make URL-like values absolute when possible.
    if (/^https?:\/\//i.test(text)) return text;
    if (text.startsWith('/')) return this.absoluteUrl(text, pageUrl);
    return text;
  }

  private absoluteUrl(maybeRelative: string, base: string): string {
    try {
      return new URL(maybeRelative, base).toString();
    } catch {
      return maybeRelative;
    }
  }
}
