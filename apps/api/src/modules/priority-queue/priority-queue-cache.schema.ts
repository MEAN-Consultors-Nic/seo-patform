import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriorityQueueMomentumCacheDocument =
  HydratedDocument<PriorityQueueMomentumCache>;

/**
 * Per-client cache of the GSC momentum signal used by the priority
 * queue. GSC searchanalytics queries are slow (1-3s each), so for a
 * portfolio of 10-20 clients we'd never want to recompute on every
 * dashboard load. Cached 24h — GSC data lags 2 days anyway, so a daily
 * refresh is the natural cadence.
 */
@Schema({ timestamps: true, collection: 'priority_queue_momentum_cache' })
export class PriorityQueueMomentumCache {
  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    unique: true,
    index: true,
  })
  clientId!: Types.ObjectId;

  @Prop({ required: true })
  clicksThisWeek!: number;

  @Prop({ required: true })
  clicksLastWeek!: number;

  @Prop({ required: true })
  impressionsThisWeek!: number;

  @Prop({ required: true })
  impressionsLastWeek!: number;

  @Prop({ required: true })
  positionThisWeek!: number;

  @Prop({ required: true })
  positionLastWeek!: number;

  @Prop({ type: Date, required: true })
  refreshedAt!: Date;
}

export const PriorityQueueMomentumCacheSchema = SchemaFactory.createForClass(
  PriorityQueueMomentumCache,
);
