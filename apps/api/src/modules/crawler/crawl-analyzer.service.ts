import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrawlJob, CrawlJobDocument } from './crawl-job.schema';
import { CrawlPage, CrawlPageDocument } from './crawl-page.schema';

export interface CrawlIssuesReport {
  duplicateTitles: Array<{
    title: string;
    count: number;
    urls: string[];
  }>;
  duplicateMetaDescriptions: Array<{
    metaDescription: string;
    count: number;
    urls: string[];
  }>;
  missingTitles: Array<{ url: string; statusCode?: number }>;
  missingMetaDescriptions: Array<{ url: string; statusCode?: number }>;
  missingH1: Array<{ url: string; statusCode?: number }>;
  multipleH1: Array<{ url: string; count: number }>;
  brokenLinks: Array<{
    url: string;
    statusCode?: number;
    fetchError?: string;
    incomingLinks: number;
  }>;
  redirects: Array<{
    url: string;
    finalUrl: string;
    redirectChain: string[];
  }>;
  orphans: Array<{ url: string; depth: number }>;
  canonicalMismatches: Array<{
    url: string;
    canonical: string;
  }>;
  noindex: Array<{ url: string; robotsMeta: string }>;
}

/**
 * Post-crawl analysis. Runs once the BFS queue drains and stamps
 * aggregate counts back onto the job doc so status polling can
 * show the full report without a second round-trip.
 *
 * Kept as its own service (separate from the orchestrator) so it
 * can be re-run on demand — the /analysis endpoint calls it fresh
 * even for completed crawls in case the user modifies the pages
 * collection through another path.
 */
@Injectable()
export class CrawlAnalyzerService {
  constructor(
    @InjectModel(CrawlJob.name)
    private readonly jobs: Model<CrawlJobDocument>,
    @InjectModel(CrawlPage.name)
    private readonly pages: Model<CrawlPageDocument>,
  ) {}

  async analyze(jobId: string): Promise<CrawlIssuesReport> {
    const jobOid = new Types.ObjectId(jobId);

    // Duplicate titles + metas via aggregation. Groups with count>1
    // where the title/meta is non-empty. Orders by frequency so the
    // worst offenders surface first in the UI.
    const dupTitlesAgg = await this.pages
      .aggregate([
        { $match: { jobId: jobOid, title: { $exists: true, $nin: [null, ''] } } },
        {
          $group: {
            _id: '$title',
            urls: { $push: '$url' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ])
      .exec();
    const duplicateTitles = dupTitlesAgg.map((r) => ({
      title: r._id,
      count: r.count,
      urls: r.urls,
    }));

    const dupMetasAgg = await this.pages
      .aggregate([
        {
          $match: {
            jobId: jobOid,
            metaDescription: { $exists: true, $nin: [null, ''] },
          },
        },
        {
          $group: {
            _id: '$metaDescription',
            urls: { $push: '$url' },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ])
      .exec();
    const duplicateMetaDescriptions = dupMetasAgg.map((r) => ({
      metaDescription: r._id,
      count: r.count,
      urls: r.urls,
    }));

    // Load the pages we need for the row-level reports. Only pages
    // that were actually fetched (statusCode set) can be judged for
    // missing title/H1/etc; shell-only placeholders (never fetched)
    // are excluded from those checks.
    const fetched = await this.pages
      .find({ jobId: jobOid, statusCode: { $exists: true } })
      .select(
        'url statusCode title metaDescription h1s canonical robotsMeta redirectChain fetchError incomingLinks depth',
      )
      .lean()
      .exec();

    const missingTitles: CrawlIssuesReport['missingTitles'] = [];
    const missingMetaDescriptions: CrawlIssuesReport['missingMetaDescriptions'] =
      [];
    const missingH1: CrawlIssuesReport['missingH1'] = [];
    const multipleH1: CrawlIssuesReport['multipleH1'] = [];
    const brokenLinks: CrawlIssuesReport['brokenLinks'] = [];
    const redirects: CrawlIssuesReport['redirects'] = [];
    const canonicalMismatches: CrawlIssuesReport['canonicalMismatches'] = [];
    const noindex: CrawlIssuesReport['noindex'] = [];

    for (const p of fetched) {
      const is2xx =
        typeof p.statusCode === 'number' &&
        p.statusCode >= 200 &&
        p.statusCode < 300;
      if (is2xx) {
        if (!p.title || !p.title.trim()) {
          missingTitles.push({ url: p.url, statusCode: p.statusCode });
        }
        if (!p.metaDescription || !p.metaDescription.trim()) {
          missingMetaDescriptions.push({
            url: p.url,
            statusCode: p.statusCode,
          });
        }
        const h1count = (p.h1s || []).length;
        if (h1count === 0) {
          missingH1.push({ url: p.url, statusCode: p.statusCode });
        } else if (h1count > 1) {
          multipleH1.push({ url: p.url, count: h1count });
        }
        // Canonical mismatch = the page's declared canonical isn't
        // the same URL Google would see (approximated: not equal to
        // the page's own url or any redirect-chain entry).
        if (
          p.canonical &&
          p.canonical !== p.url &&
          !(p.redirectChain || []).includes(p.canonical)
        ) {
          canonicalMismatches.push({ url: p.url, canonical: p.canonical });
        }
        if (
          p.robotsMeta &&
          /\bnoindex\b/i.test(p.robotsMeta)
        ) {
          noindex.push({ url: p.url, robotsMeta: p.robotsMeta });
        }
      }
      if (
        (typeof p.statusCode === 'number' && p.statusCode >= 400) ||
        (p.statusCode === 0 && p.fetchError)
      ) {
        brokenLinks.push({
          url: p.url,
          statusCode: p.statusCode,
          fetchError: p.fetchError,
          incomingLinks: (p.incomingLinks || []).length,
        });
      }
      if ((p.redirectChain || []).length > 0) {
        redirects.push({
          url: p.url,
          finalUrl:
            p.redirectChain[p.redirectChain.length - 1] || p.url,
          redirectChain: p.redirectChain,
        });
      }
    }

    // Orphans: pages that were fetched successfully AND have zero
    // incoming links. Excludes the root URL (depth 0) since by
    // definition it's the entry point and has no in-crawl parent.
    const orphanRows = await this.pages
      .find({
        jobId: jobOid,
        statusCode: { $gte: 200, $lt: 300 },
        depth: { $gt: 0 },
        $or: [
          { incomingLinks: { $size: 0 } },
          { incomingLinks: { $exists: false } },
        ],
      })
      .select('url depth')
      .lean()
      .exec();
    const orphans = orphanRows.map((p) => ({ url: p.url, depth: p.depth }));

    // Stamp the aggregate counts onto the job doc.
    await this.jobs
      .updateOne(
        { _id: jobOid },
        {
          $set: {
            'stats.brokenLinks': brokenLinks.length,
            'stats.redirects': redirects.length,
            'stats.orphans': orphans.length,
            'stats.dupTitles': duplicateTitles.length,
            'stats.dupMetas': duplicateMetaDescriptions.length,
            'stats.missingH1': missingH1.length,
          },
        },
      )
      .exec();

    return {
      duplicateTitles,
      duplicateMetaDescriptions,
      missingTitles,
      missingMetaDescriptions,
      missingH1,
      multipleH1,
      brokenLinks,
      redirects,
      orphans,
      canonicalMismatches,
      noindex,
    };
  }
}
