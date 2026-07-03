import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CrawlPageDocument = HydratedDocument<CrawlPage>;

/**
 * One document per URL discovered by a crawl. Links use sha1 hashes of
 * the normalized URL as edge references so incoming/outgoing arrays
 * stay compact and querying is index-friendly. The raw URL is stored
 * on the destination page — resolving an edge is a single lookup by
 * (jobId, urlHash).
 *
 * We never persist the raw HTML — only the extracted signals — so a
 * 500-page crawl stays well under the standard dyno's memory budget.
 */
@Schema({ timestamps: true, collection: 'crawl_pages' })
export class CrawlPage {
  @Prop({ type: Types.ObjectId, ref: 'CrawlJob', required: true, index: true })
  jobId!: Types.ObjectId;

  @Prop({ required: true })
  url!: string;

  /** sha1(normalizedUrl) — primary lookup key for edge dereferencing. */
  @Prop({ required: true })
  urlHash!: string;

  /** HTTP status of the final response after redirects. */
  @Prop({ type: Number })
  statusCode?: number;

  @Prop()
  title?: string;

  @Prop()
  metaDescription?: string;

  @Prop({ type: [String], default: [] })
  h1s!: string[];

  @Prop()
  canonical?: string;

  /** Content of the <meta name="robots"> tag, if any. Lowercased. */
  @Prop()
  robotsMeta?: string;

  @Prop()
  contentType?: string;

  @Prop()
  contentLength?: number;

  @Prop({ type: Number })
  responseTimeMs?: number;

  /** Distance from the root URL, in redirect-collapsed clicks. */
  @Prop({ required: true, default: 0 })
  depth!: number;

  @Prop({ type: Date, default: () => new Date() })
  discoveredAt!: Date;

  /**
   * urlHashes of pages that link TO this URL. Populated during BFS as
   * links get resolved. The size of this array drives orphan detection
   * (size === 0 → orphan, excluding the root URL).
   */
  @Prop({ type: [String], default: [] })
  incomingLinks!: string[];

  /** urlHashes of pages this URL links TO. */
  @Prop({ type: [String], default: [] })
  outgoingLinks!: string[];

  /**
   * Redirect chain leading to this page's final URL. Empty when the
   * page was 200 on the first request. Capped at 5 to prevent memory
   * blowup on redirect loops.
   */
  @Prop({ type: [String], default: [] })
  redirectChain!: string[];

  /** Free-text error surfaced when the fetch failed (timeout, DNS, etc.). */
  @Prop()
  fetchError?: string;
}

export const CrawlPageSchema = SchemaFactory.createForClass(CrawlPage);
CrawlPageSchema.index({ jobId: 1, urlHash: 1 }, { unique: true });
CrawlPageSchema.index({ jobId: 1, statusCode: 1 });
CrawlPageSchema.index({ jobId: 1, depth: 1 });
// Sparse index on presence of ANY incomingLinks entry powers the orphan
// query: `find({ jobId, incomingLinks: { $size: 0 } })` uses this index.
CrawlPageSchema.index({ jobId: 1, 'incomingLinks.0': 1 }, { sparse: true });
