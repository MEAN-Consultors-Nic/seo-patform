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

  @Prop()
  notes?: string;

  @Prop({ required: true, default: () => new Date() })
  recordedAt!: Date;
}

export const KeywordRankingSchema = SchemaFactory.createForClass(KeywordRanking);
KeywordRankingSchema.index({ keywordId: 1, recordedAt: -1 });
