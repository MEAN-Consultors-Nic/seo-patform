import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { KeywordIntent, KeywordPriority, KeywordStatus } from '@seo/shared';

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

  // --- Keyword-list / research fields -------------------------------------

  /**
   * Lists this keyword belongs to. Multikey index so "keywords in list
   * X" is a single indexed lookup.
   */
  @Prop({ type: [Types.ObjectId], ref: 'KeywordList', default: [], index: true })
  listIds?: Types.ObjectId[];

  /**
   * False for research keywords, which stay out of the position cron,
   * the GSC sync and the tracking table.
   *
   * Reads use `{ tracked: { $ne: false } }` rather than
   * `{ tracked: true }` on purpose: every keyword written before lists
   * existed has no value here, and must keep behaving as tracked. That
   * makes the whole feature a no-op for existing data — no backfill.
   */
  @Prop({ type: Boolean, default: true })
  tracked?: boolean;

  @Prop()
  cpc?: number;

  @Prop({ type: String, enum: ['high', 'medium', 'low'] })
  priority?: KeywordPriority;

  @Prop({ type: String, enum: ['idea', 'assigned', 'published'] })
  status?: KeywordStatus;

  @Prop()
  notes?: string;

  // --- Tracking -----------------------------------------------------------

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

  // Provenance — manual entries vs auto-imported from Google Search Console
  @Prop({ type: String, enum: ['manual', 'gsc'], default: 'manual' })
  source?: 'manual' | 'gsc';

  @Prop({ type: Date })
  gscPulledAt?: Date;

  @Prop()
  gscClicks?: number;

  @Prop()
  gscImpressions?: number;

  @Prop()
  gscCtr?: number;

  @Prop()
  gscPosition?: number;
}

export const KeywordSchema = SchemaFactory.createForClass(Keyword);
KeywordSchema.index({ clientId: 1, text: 1 }, { unique: true });
// Drives the list view and the tracking table's tracked/untracked split.
KeywordSchema.index({ clientId: 1, listIds: 1 });
KeywordSchema.index({ clientId: 1, tracked: 1 });
