import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import PQueue from 'p-queue';
import robotsParser from 'robots-parser';
import { CrawlJob, CrawlJobDocument } from './crawl-job.schema';
import { CrawlPage, CrawlPageDocument } from './crawl-page.schema';
import { PageFetcherService } from './page-fetcher.service';
import { HtmlAnalyzerService } from './html-analyzer.service';
import { UrlNormalizerService } from './url-normalizer.service';

interface QueueEntry {
  url: string;
  urlHash: string;
  depth: number;
  parentHash: string | null;
}

/**
 * BFS crawler that reads settings off the job doc, fetches pages
 * through p-queue (concurrency + rate limit), extracts signals via
 * HtmlAnalyzerService, and writes one CrawlPage per URL. Incoming
 * links are stitched via $addToSet as soon as a parent references
 * a child — even before the child has been fetched — so orphan
 * detection at the end doesn't need a separate pass.
 *
 * Jobs run in-process on the same dyno as the API request. The
 * initial request only starts the crawl and returns immediately;
 * the work continues via the p-queue instance until it drains or
 * the job is cancelled. On SIGTERM the queue is paused, the job
 * is marked 'interrupted', and Heroku's 30s grace window lets us
 * finish any in-flight fetches cleanly.
 */
@Injectable()
export class CrawlOrchestratorService implements OnModuleDestroy {
  private readonly logger = new Logger(CrawlOrchestratorService.name);
  private static readonly STATUS_UPDATE_EVERY = 5;

  /** Live job runners keyed by jobId so we can cancel from outside. */
  private readonly running = new Map<
    string,
    { queue: PQueue; cancel: boolean }
  >();

  constructor(
    @InjectModel(CrawlJob.name)
    private readonly jobs: Model<CrawlJobDocument>,
    @InjectModel(CrawlPage.name)
    private readonly pages: Model<CrawlPageDocument>,
    private readonly fetcher: PageFetcherService,
    private readonly analyzer: HtmlAnalyzerService,
    private readonly urls: UrlNormalizerService,
  ) {}

  /**
   * Kicks off a new crawl. Returns the job document immediately;
   * the actual work runs in background. Frontend polls /status
   * until job.status flips to completed / interrupted / failed.
   */
  async startCrawl(params: {
    clientId: string;
    rootUrl: string;
    maxDepth: number;
    maxPages: number;
    rateLimit: number;
    respectRobots: boolean;
    ignoreUtm: boolean;
    userAgent?: string;
  }): Promise<CrawlJobDocument> {
    const job = await this.jobs.create({
      clientId: new Types.ObjectId(params.clientId),
      rootUrl: params.rootUrl,
      status: 'queued',
      settings: {
        maxDepth: params.maxDepth,
        maxPages: params.maxPages,
        rateLimit: params.rateLimit,
        respectRobots: params.respectRobots,
        ignoreUtm: params.ignoreUtm,
        userAgent: params.userAgent,
      },
    });
    // Fire-and-forget the actual crawl. Errors inside runCrawl update
    // the job doc — no need to bubble them up to the HTTP response.
    void this.runCrawl(job._id.toString()).catch((err) => {
      this.logger.error(`Crawl ${job._id} failed: ${err.message}`);
    });
    return job;
  }

  async cancelCrawl(jobId: string): Promise<void> {
    const runner = this.running.get(jobId);
    if (runner) {
      runner.cancel = true;
      runner.queue.clear();
      runner.queue.pause();
    }
    await this.jobs
      .updateOne(
        { _id: new Types.ObjectId(jobId), status: { $in: ['queued', 'running'] } },
        { $set: { status: 'interrupted', completedAt: new Date() } },
      )
      .exec();
  }

  async onModuleDestroy(): Promise<void> {
    // Heroku SIGTERM: mark all in-flight jobs as interrupted before
    // the dyno restarts. Best-effort — Heroku gives 30s.
    for (const [jobId, runner] of this.running) {
      runner.cancel = true;
      runner.queue.clear();
      runner.queue.pause();
      await this.jobs
        .updateOne(
          { _id: new Types.ObjectId(jobId), status: 'running' },
          {
            $set: {
              status: 'interrupted',
              completedAt: new Date(),
              errorMessage: 'Server restarted mid-crawl',
            },
          },
        )
        .exec()
        .catch(() => null);
    }
  }

  private async runCrawl(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId).lean().exec();
    if (!job) return;
    const jobOid = new Types.ObjectId(jobId);

    // Optional robots.txt fetch. Failure to fetch = permissive (crawl
    // everything). Only used when respectRobots is on.
    let robots: ReturnType<typeof robotsParser> | null = null;
    if (job.settings.respectRobots) {
      robots = await this.loadRobots(job.rootUrl, job.settings.userAgent);
    }

    const queue = new PQueue({
      concurrency: 5,
      intervalCap: job.settings.rateLimit,
      interval: 1000,
      carryoverConcurrencyCount: true,
    });
    const runner = { queue, cancel: false };
    this.running.set(jobId, runner);

    await this.jobs
      .updateOne(
        { _id: jobOid },
        { $set: { status: 'running', startedAt: new Date() } },
      )
      .exec();

    // Local dedupe of URLs we've already enqueued.
    const enqueued = new Set<string>();
    let pagesCrawledCounter = 0;

    const enqueue = (entry: QueueEntry): boolean => {
      if (runner.cancel) return false;
      if (enqueued.has(entry.urlHash)) return false;
      if (entry.depth > job.settings.maxDepth) return false;
      if (pagesCrawledCounter + queue.size + queue.pending >= job.settings.maxPages) {
        return false;
      }
      if (
        robots &&
        !robots.isAllowed(
          entry.url,
          job.settings.userAgent || 'MediaSpearheadCrawler',
        )
      ) {
        return false;
      }
      enqueued.add(entry.urlHash);
      void queue.add(async () => {
        if (runner.cancel) return;
        await this.processPage(jobOid, entry, enqueue, job.rootUrl, job.settings);
        pagesCrawledCounter++;
        if (
          pagesCrawledCounter % CrawlOrchestratorService.STATUS_UPDATE_EVERY ===
          0
        ) {
          await this.jobs
            .updateOne(
              { _id: jobOid },
              {
                $set: {
                  currentUrl: entry.url,
                  'stats.pagesCrawled': pagesCrawledCounter,
                  'stats.pagesQueued':
                    enqueued.size - pagesCrawledCounter,
                },
              },
            )
            .exec()
            .catch(() => null);
        }
      });
      return true;
    };

    // Seed the queue with the root URL.
    const rootNorm = this.urls.normalize(job.rootUrl, {
      ignoreUtm: job.settings.ignoreUtm,
    });
    if (!rootNorm) {
      await this.jobs
        .updateOne(
          { _id: jobOid },
          {
            $set: {
              status: 'failed',
              errorMessage: 'Invalid root URL.',
              completedAt: new Date(),
            },
          },
        )
        .exec();
      this.running.delete(jobId);
      return;
    }
    enqueue({
      url: rootNorm,
      urlHash: this.urls.hash(rootNorm),
      depth: 0,
      parentHash: null,
    });

    await queue.onIdle();

    // Final stats snapshot before analyzer runs.
    await this.jobs
      .updateOne(
        { _id: jobOid },
        {
          $set: {
            currentUrl: undefined,
            'stats.pagesCrawled': pagesCrawledCounter,
            'stats.pagesQueued': 0,
          },
        },
      )
      .exec()
      .catch(() => null);

    // Mark final status. If the runner was cancelled the cancelCrawl
    // path already set 'interrupted'; only flip queued/running to
    // completed here so we don't overwrite an interruption.
    await this.jobs
      .updateOne(
        { _id: jobOid, status: { $in: ['queued', 'running'] } },
        { $set: { status: 'completed', completedAt: new Date() } },
      )
      .exec();

    this.running.delete(jobId);
  }

  /**
   * Fetches one URL, persists the CrawlPage, and enqueues its
   * discovered internal links. Same-origin filter uses the crawl's
   * rootUrl; canonical + redirect chain are stored as-is.
   */
  private async processPage(
    jobOid: Types.ObjectId,
    entry: QueueEntry,
    enqueue: (e: QueueEntry) => boolean,
    rootUrl: string,
    settings: CrawlJobDocument['settings'],
  ): Promise<void> {
    const fetched = await this.fetcher.fetch(entry.url, settings.userAgent);
    let title: string | undefined;
    let metaDescription: string | undefined;
    let h1s: string[] = [];
    let canonical: string | undefined;
    let robotsMeta: string | undefined;
    const outgoingHashes: string[] = [];

    if (fetched.html) {
      const parsed = this.analyzer.analyze(fetched.html);
      title = parsed.title;
      metaDescription = parsed.metaDescription;
      h1s = parsed.h1s;
      canonical = parsed.canonical;
      robotsMeta = parsed.robotsMeta;
      // Resolve, normalize, dedupe, filter to same-origin, then enqueue
      // for BFS and record edges.
      const seenOnPage = new Set<string>();
      for (const rawHref of parsed.links) {
        const abs = this.urls.resolveHref(rawHref, fetched.finalUrl);
        if (!abs) continue;
        if (!this.urls.isSameOrigin(abs, rootUrl)) continue;
        const norm = this.urls.normalize(abs, {
          ignoreUtm: settings.ignoreUtm,
        });
        if (!norm) continue;
        const hash = this.urls.hash(norm);
        if (hash === entry.urlHash) continue; // self-link
        if (seenOnPage.has(hash)) continue;
        seenOnPage.add(hash);
        outgoingHashes.push(hash);
        enqueue({
          url: norm,
          urlHash: hash,
          depth: entry.depth + 1,
          parentHash: entry.urlHash,
        });
      }
    }

    // Upsert the page doc. Multiple parents can reach the same URL
    // during BFS so we use $addToSet on incomingLinks + $setOnInsert
    // on the fields that don't change once discovered.
    await this.pages
      .updateOne(
        { jobId: jobOid, urlHash: entry.urlHash },
        {
          $setOnInsert: {
            jobId: jobOid,
            url: entry.url,
            urlHash: entry.urlHash,
            depth: entry.depth,
            discoveredAt: new Date(),
          },
          $set: {
            statusCode: fetched.statusCode,
            title,
            metaDescription,
            h1s,
            canonical,
            robotsMeta,
            contentType: fetched.contentType,
            contentLength: fetched.contentLength,
            responseTimeMs: fetched.responseTimeMs,
            redirectChain: fetched.redirectChain,
            outgoingLinks: outgoingHashes,
            fetchError: fetched.error,
          },
        },
        { upsert: true },
      )
      .exec();

    // Add this URL to the incomingLinks of every target it links out to.
    if (outgoingHashes.length > 0) {
      await this.pages
        .updateMany(
          { jobId: jobOid, urlHash: { $in: outgoingHashes } },
          { $addToSet: { incomingLinks: entry.urlHash } },
        )
        .exec();
      // Also pre-create shell docs for targets not yet fetched so the
      // $addToSet above lands somewhere. Only pre-create the ones that
      // don't already have a doc.
      const existing = await this.pages
        .find({ jobId: jobOid, urlHash: { $in: outgoingHashes } })
        .select('urlHash')
        .lean()
        .exec();
      const existingSet = new Set(existing.map((p) => p.urlHash));
      const missing = outgoingHashes.filter((h) => !existingSet.has(h));
      if (missing.length > 0) {
        // Bulk insert placeholder docs so the child's incomingLinks
        // accrues even before it's fetched. Ignored if it races with
        // the child's own upsert (unique index on jobId + urlHash).
        const ops = missing.map((h, idx) => ({
          insertOne: {
            document: {
              jobId: jobOid,
              url: '', // will be overwritten when actually fetched
              urlHash: h,
              depth: entry.depth + 1,
              incomingLinks: [entry.urlHash],
              outgoingLinks: [],
              redirectChain: [],
              h1s: [],
              discoveredAt: new Date(Date.now() + idx),
            },
          },
        }));
        await this.pages.bulkWrite(ops, { ordered: false }).catch(() => null);
      }
    }
  }

  private async loadRobots(
    rootUrl: string,
    ua?: string,
  ): Promise<ReturnType<typeof robotsParser> | null> {
    try {
      const robotsUrl = new URL('/robots.txt', rootUrl).toString();
      const res = await this.fetcher.fetch(robotsUrl, ua);
      if (res.statusCode >= 200 && res.statusCode < 300 && res.html) {
        return robotsParser(robotsUrl, res.html);
      }
      return null;
    } catch {
      return null;
    }
  }
}
