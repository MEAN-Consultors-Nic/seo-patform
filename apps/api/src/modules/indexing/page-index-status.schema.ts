import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PageIndexStatusDocument = HydratedDocument<PageIndexStatus>;

/**
 * Snapshot of one URL's indexing state as reported by the Google Search
 * Console URL Inspection API. Re-pulls upsert by (clientId, url) so each
 * page has one current row plus a captured firstIndexedAt the first time
 * we ever observe the URL flip to a PASS verdict.
 *
 * The fields mirror Google's `urlInspectionResult.indexStatusResult`
 * shape so the table can show exactly what GSC shows in its UI without
 * extra translation.
 */
@Schema({ timestamps: true, collection: 'page-index-statuses' })
export class PageIndexStatus {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true })
  url!: string;

  /**
   * PASS = indexed, NEUTRAL = inspection ran but verdict undecided,
   * FAIL = not indexed, VERDICT_UNSPECIFIED = unknown / error.
   */
  @Prop({
    required: true,
    type: String,
    enum: ['PASS', 'NEUTRAL', 'FAIL', 'VERDICT_UNSPECIFIED'],
  })
  verdict!: 'PASS' | 'NEUTRAL' | 'FAIL' | 'VERDICT_UNSPECIFIED';

  /**
   * Human-readable "why" string — exactly what GSC shows in the
   * "Why pages aren't indexed" table: "Excluded by 'noindex' tag",
   * "Blocked by robots.txt", "Discovered - currently not indexed",
   * "Crawled - currently not indexed", "Submitted and indexed", etc.
   */
  @Prop()
  coverageState?: string;

  @Prop()
  robotsTxtState?: string;

  @Prop()
  indexingState?: string;

  @Prop()
  pageFetchState?: string;

  @Prop({ type: Date })
  lastCrawlTime?: Date;

  /** Canonical Google selected for this URL. */
  @Prop()
  googleCanonical?: string;

  /** Canonical the page declares for itself. Mismatch flags duplicate content. */
  @Prop()
  userCanonical?: string;

  /** Whether Google selected a different canonical (sugar derived on save). */
  @Prop()
  canonicalMismatch?: boolean;

  /** Sitemap URL the page was discovered through, if any. */
  @Prop({ type: [String], default: [] })
  sitemaps?: string[];

  @Prop({ type: [String], default: [] })
  referringUrls?: string[];

  /** Verdict observed on the previous pull. Used to detect newly-indexed URLs. */
  @Prop()
  previousVerdict?: string;

  /**
   * First time WE observed a PASS verdict for this URL. Captured the
   * first pull where the verdict transitions to PASS; never overwritten
   * after that so it always reflects "time to first index" since the
   * page entered our tracking.
   */
  @Prop({ type: Date })
  firstIndexedAt?: Date;

  /** Most recent successful URL Inspection call for this row. */
  @Prop({ type: Date, required: true })
  lastCheckedAt!: Date;
}

export const PageIndexStatusSchema = SchemaFactory.createForClass(PageIndexStatus);
PageIndexStatusSchema.index({ clientId: 1, url: 1 }, { unique: true });
PageIndexStatusSchema.index({ clientId: 1, verdict: 1 });
