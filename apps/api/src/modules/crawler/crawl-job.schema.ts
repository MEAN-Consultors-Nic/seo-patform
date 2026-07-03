import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CrawlJobDocument = HydratedDocument<CrawlJob>;

export type CrawlJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'failed';

/**
 * Aggregate stats stamped onto the job doc as the crawl progresses so
 * the frontend can poll status without a per-request page-collection
 * scan. Recomputed at the end of each batch and again at final analysis.
 */
@Schema({ _id: false })
class CrawlStatsSubSchema {
  @Prop({ default: 0 }) pagesCrawled!: number;
  @Prop({ default: 0 }) pagesQueued!: number;
  @Prop({ default: 0 }) brokenLinks!: number;
  @Prop({ default: 0 }) redirects!: number;
  @Prop({ default: 0 }) orphans!: number;
  @Prop({ default: 0 }) dupTitles!: number;
  @Prop({ default: 0 }) dupMetas!: number;
  @Prop({ default: 0 }) missingH1!: number;
}

/**
 * Frozen settings for this crawl. Changing user-level defaults later
 * shouldn't retroactively change how a past crawl was scoped.
 */
@Schema({ _id: false })
class CrawlSettingsSubSchema {
  @Prop({ default: 3 }) maxDepth!: number;
  @Prop({ default: 500 }) maxPages!: number;
  /** Requests per second. p-queue enforces this at the fetch layer. */
  @Prop({ default: 3 }) rateLimit!: number;
  @Prop({ default: false }) respectRobots!: boolean;
  @Prop({ default: true }) ignoreUtm!: boolean;
  @Prop() userAgent?: string;
  /** Explicit sitemap URL provided by the user — bypasses auto-discovery. */
  @Prop() sitemapUrl?: string;
}

@Schema({ timestamps: true, collection: 'crawl_jobs' })
export class CrawlJob {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true })
  rootUrl!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['queued', 'running', 'completed', 'interrupted', 'failed'],
    default: 'queued',
  })
  status!: CrawlJobStatus;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  /**
   * URL currently being fetched (best-effort, updated periodically).
   * Surfaced to the UI so the user sees the crawler making progress
   * instead of watching a static progress bar.
   */
  @Prop()
  currentUrl?: string;

  @Prop({ type: CrawlSettingsSubSchema, default: () => ({}) })
  settings!: {
    maxDepth: number;
    maxPages: number;
    rateLimit: number;
    respectRobots: boolean;
    ignoreUtm: boolean;
    userAgent?: string;
    sitemapUrl?: string;
  };

  @Prop({ type: CrawlStatsSubSchema, default: () => ({}) })
  stats!: {
    pagesCrawled: number;
    pagesQueued: number;
    brokenLinks: number;
    redirects: number;
    orphans: number;
    dupTitles: number;
    dupMetas: number;
    missingH1: number;
  };

  @Prop()
  errorMessage?: string;
}

export const CrawlJobSchema = SchemaFactory.createForClass(CrawlJob);
CrawlJobSchema.index({ clientId: 1, startedAt: -1 });
