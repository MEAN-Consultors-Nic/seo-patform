import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { LeadService, LeadSource, LeadStage } from '@seo/shared';

@Schema({ _id: false })
class ActivityEntry {
  @Prop({ required: true, type: Date, default: () => new Date() }) at!: Date;
  @Prop({ required: true, type: String }) kind!:
    | 'note'
    | 'email'
    | 'call'
    | 'stage-change';
  @Prop({ type: Types.ObjectId, ref: 'User' })
  authorUserId?: Types.ObjectId;
  @Prop({ type: String }) authorName?: string;
  @Prop({ type: String }) text?: string;
  @Prop({ type: String }) fromStage?: LeadStage;
  @Prop({ type: String }) toStage?: LeadStage;
}
const ActivitySchemaDef = SchemaFactory.createForClass(ActivityEntry);

export type LeadDocument = HydratedDocument<Lead>;

/**
 * Sales pipeline entry. A Lead moves through the stages
 * new -> proposal_sent -> closed_won/lost as the sale progresses.
 * When a lead reaches closed_won, the intake flow may spawn a Client
 * document and link the two via clientId.
 */
@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  @Prop({ required: true, type: String, index: true }) businessName!: string;
  @Prop({ type: String }) contactName?: string;
  @Prop({ type: String, lowercase: true, trim: true }) email?: string;
  @Prop({ type: String }) phone?: string;
  @Prop({ type: String }) website?: string;

  @Prop({ type: String }) source?: LeadSource;
  @Prop({ type: [String], default: [] }) services?: LeadService[];

  @Prop({ type: Number, min: 0 }) monthlyDealValue?: number;
  @Prop({ type: Number, min: 0 }) oneTimeDealValue?: number;

  @Prop({
    required: true,
    type: String,
    enum: ['new', 'no_show', 'proposal_sent', 'closed_won', 'closed_lost'],
    default: 'new',
    index: true,
  })
  stage!: LeadStage;

  /** Assigned strategist / manager who owns the lead. */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerId?: Types.ObjectId;

  @Prop({ type: String }) notes?: string;

  @Prop({ type: [ActivitySchemaDef], default: [] })
  activity!: ActivityEntry[];

  @Prop({ type: Date }) closedAt?: Date;
  @Prop({ type: String }) closedReason?: string;

  /** Backfill when closed_won leads spawn a Client. */
  @Prop({ type: Types.ObjectId, ref: 'Client' })
  clientId?: Types.ObjectId;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
