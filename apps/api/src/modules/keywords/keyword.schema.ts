import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { KeywordIntent } from '@seo/shared';

export type KeywordDocument = HydratedDocument<Keyword>;

@Schema({ timestamps: true, collection: 'keywords' })
export class Keyword {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true })
  text!: string;

  @Prop()
  targetUrl?: string;

  @Prop()
  volume?: number;

  @Prop()
  difficulty?: number;

  @Prop({
    type: String,
    enum: ['informational', 'transactional', 'commercial', 'navigational'],
  })
  intent?: KeywordIntent;

  @Prop()
  group?: string;

  @Prop()
  currentPosition?: number;

  @Prop()
  previousPosition?: number;

  @Prop()
  currentRankingUrl?: string;

  @Prop()
  previousRankingUrl?: string;

  @Prop()
  urlChangedAt?: Date;

  @Prop()
  bestPosition?: number;

  @Prop()
  bestPositionAt?: Date;

  @Prop()
  lastCheckedAt?: Date;
}

export const KeywordSchema = SchemaFactory.createForClass(Keyword);
KeywordSchema.index({ clientId: 1, text: 1 }, { unique: true });
