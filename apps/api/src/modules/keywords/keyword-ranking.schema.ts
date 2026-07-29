import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RankingDevice } from '@seo/shared';

export type KeywordRankingDocument = HydratedDocument<KeywordRanking>;

@Schema({ timestamps: true, collection: 'keyword_rankings' })
export class KeywordRanking {
  @Prop({ type: Types.ObjectId, ref: 'Keyword', required: true, index: true })
  keywordId!: Types.ObjectId;

  @Prop({ required: true })
  position!: number;

  @Prop()
  rankingUrl?: string;

  @Prop({ type: String, enum: ['desktop', 'mobile'], default: 'desktop' })
  device?: RankingDevice;

  @Prop()
  location?: string;

  /**
   * ISO 3166-1 alpha-3 lowercase (e.g. 'usa'). Set when the snapshot
   * was filtered to a specific country via GSC's country dimension.
   * Unset on legacy rows — those represent worldwide averages.
   */
  @Prop({ index: true })
  country?: string;

  @Prop()
  notes?: string;

  @Prop({ required: true, default: () => new Date() })
  recordedAt!: Date;
}

export const KeywordRankingSchema = SchemaFactory.createForClass(KeywordRanking);
KeywordRankingSchema.index({ keywordId: 1, recordedAt: -1 });
// Compound index for the "movers / history in country X" hot path —
// the aggregations in KeywordsService.positionHistory + positionMovers
// filter on (keywordId, country, recordedAt) together.
KeywordRankingSchema.index({ keywordId: 1, country: 1, recordedAt: -1 });
