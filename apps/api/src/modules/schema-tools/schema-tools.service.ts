import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { GraphBuilderService } from './graph-builder.service';
import { SchemaExtractorService } from './schema-extractor.service';
import { CrawlPage, CrawlResult } from './types';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 75;

@Injectable()
export class SchemaToolsService {
  private readonly logger = new Logger(SchemaToolsService.name);

  constructor(
    private readonly crawler: CrawlerService,
    private readonly extractor: SchemaExtractorService,
    private readonly graphBuilder: GraphBuilderService,
  ) {}

  async crawl(rawUrl: string, maxPagesInput?: number): Promise<CrawlResult> {
    const startUrl = this.normalize(rawUrl);
    const limit = Math.min(
      Math.max(1, Number(maxPagesInput) || DEFAULT_LIMIT),
      MAX_LIMIT,
    );

    const startedAt = Date.now();
    const errors: string[] = [];
    const pages: CrawlPage[] = [];

    const fetched = await this.crawler.crawl(startUrl, limit, errors);
    for (const f of fetched) {
      const pageErrors: string[] = [];
      if (f.error) pageErrors.push(f.error);
      let schemas: ReturnType<SchemaExtractorService['extract']> = [];
      if (f.html) {
        try {
          schemas = this.extractor.extract(f.html, f.url);
        } catch (err) {
          pageErrors.push(`extractor: ${(err as Error).message}`);
        }
      }
      pages.push({
        url: f.url,
        status: f.status,
        contentType: f.contentType,
        schemas,
        errors: pageErrors.length ? pageErrors : undefined,
      });
    }

    const graph = this.graphBuilder.build(pages);
    const typeCounts = this.tallyTypes(graph.nodes);

    return {
      domain: new URL(startUrl).hostname,
      startUrl,
      pagesCrawled: pages.length,
      pagesWithSchema: pages.filter((p) => p.schemas.length > 0).length,
      schemasFound: pages.reduce((acc, p) => acc + p.schemas.length, 0),
      typeCounts,
      pages,
      graph,
      errors,
      durationMs: Date.now() - startedAt,
      limit,
    };
  }

  private normalize(input: string): string {
    if (!input) throw new BadRequestException('url is required');
    let s = input.trim();
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
      const u = new URL(s);
      return u.toString();
    } catch {
      throw new BadRequestException('Invalid URL');
    }
  }

  private tallyTypes(
    nodes: { types: string[] }[],
  ): Array<{ type: string; count: number }> {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      for (const t of n.types) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }
}
