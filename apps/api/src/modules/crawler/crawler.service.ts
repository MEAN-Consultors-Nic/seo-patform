import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrawlJob, CrawlJobDocument } from './crawl-job.schema';
import { CrawlPage, CrawlPageDocument } from './crawl-page.schema';

/**
 * Read-side façade the controller talks to. Delegates job lifecycle
 * (start/cancel) to CrawlOrchestratorService and post-crawl
 * aggregations to CrawlAnalyzerService. This one just owns the
 * boring reads: status polling, page listing, CSV export, history.
 */
@Injectable()
export class CrawlerService {
  constructor(
    @InjectModel(CrawlJob.name)
    private readonly jobs: Model<CrawlJobDocument>,
    @InjectModel(CrawlPage.name)
    private readonly pages: Model<CrawlPageDocument>,
  ) {}

  async getStatus(jobId: string) {
    const job = await this.jobs.findById(jobId).lean().exec();
    if (!job) throw new NotFoundException('Crawl job not found.');
    return job;
  }

  async listForClient(clientId: string) {
    return this.jobs
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ startedAt: -1, createdAt: -1 })
      .limit(20)
      .lean()
      .exec();
  }

  async listPages(jobId: string) {
    const jobOid = new Types.ObjectId(jobId);
    return this.pages
      .find({ jobId: jobOid })
      .sort({ depth: 1, url: 1 })
      .lean()
      .exec();
  }

  /**
   * Streams the pages collection as CSV. One row per URL with the
   * SEO signals + link counts. Skips shell docs that were never
   * fetched (they have no signals worth exporting) — those are only
   * useful for orphan detection, not analysis.
   */
  async exportCsv(jobId: string): Promise<string> {
    const rows = await this.pages
      .find({ jobId: new Types.ObjectId(jobId), statusCode: { $exists: true } })
      .sort({ depth: 1, url: 1 })
      .lean()
      .exec();
    const header = [
      'url',
      'statusCode',
      'depth',
      'title',
      'metaDescription',
      'h1Count',
      'firstH1',
      'canonical',
      'robotsMeta',
      'contentType',
      'responseTimeMs',
      'incomingLinks',
      'outgoingLinks',
      'redirectChain',
      'fetchError',
    ];
    const lines: string[] = [header.map(this.csvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.url,
          r.statusCode ?? '',
          r.depth ?? '',
          r.title ?? '',
          r.metaDescription ?? '',
          (r.h1s || []).length,
          (r.h1s || [])[0] ?? '',
          r.canonical ?? '',
          r.robotsMeta ?? '',
          r.contentType ?? '',
          r.responseTimeMs ?? '',
          (r.incomingLinks || []).length,
          (r.outgoingLinks || []).length,
          (r.redirectChain || []).join(' → '),
          r.fetchError ?? '',
        ]
          .map(this.csvCell)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  private csvCell(v: unknown): string {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
}
