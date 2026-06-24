import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CannibalizationCacheDocument =
  HydratedDocument<CannibalizationCache>;

/**
 * Per-client cache of the GSC keyword cannibalization analysis. We persist
 * the full computed payload (items + counts + severity buckets) keyed by
 * (clientId, dateRange) so the tab loads instantly from Mongo most of the
 * time and only re-hits Google when the user clicks "Refresh" or the cache
 * has aged past 24 hours.
 *
 * The 28-day window is the analytical default but stored explicitly here
 * so a future "compare 90 days vs 28 days" feature can coexist without
 * trampling the cache.
 */
@Schema({ timestamps: true, collection: 'cannibalization_keyword_cache' })
export class CannibalizationCache {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  /** Days of the window — used as part of the cache key. */
  @Prop({ required: true })
  days!: number;

  /** Inclusive start of the GSC searchanalytics window (UTC YYYY-MM-DD). */
  @Prop({ required: true })
  startDate!: string;

  @Prop({ required: true })
  endDate!: string;

  /** Raw computed payload — same shape sent to the frontend. */
  @Prop({ type: Object, required: true })
  payload!: Record<string, unknown>;

  /** When the GSC pull completed. Drives the 24h TTL. */
  @Prop({ type: Date, required: true })
  refreshedAt!: Date;
}

export const CannibalizationCacheSchema = SchemaFactory.createForClass(
  CannibalizationCache,
);
CannibalizationCacheSchema.index({ clientId: 1, days: 1 }, { unique: true });
