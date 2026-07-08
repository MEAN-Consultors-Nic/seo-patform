import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { QuestionnaireKind } from '@seo/shared';

export type QuestionnaireDocument = HydratedDocument<Questionnaire>;

/**
 * Token-gated client-facing intake form (Sales Slice 4.5). Once
 * invited, the client visits /q/:token to fill it out. Submissions
 * land in the internal Intake Hub for review.
 */
@Schema({ timestamps: true, collection: 'questionnaires' })
export class Questionnaire {
  @Prop({
    required: true,
    type: String,
    enum: ['seo', 'ppc', 'website', 'combo'],
    index: true,
  })
  kind!: QuestionnaireKind;

  @Prop({ required: true, type: String }) businessName!: string;
  @Prop({ type: String }) invitedEmail?: string;

  @Prop({ type: Types.ObjectId, ref: 'Lead', index: true })
  leadId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Client', index: true })
  clientId?: Types.ObjectId;

  @Prop({ type: String, unique: true, sparse: true, index: true })
  shareToken?: string;

  @Prop({
    required: true,
    type: String,
    enum: ['pending', 'submitted'],
    default: 'pending',
    index: true,
  })
  status!: 'pending' | 'submitted';

  /** Free-form structured answers keyed by question id. */
  @Prop({ type: Object }) answers?: Record<string, unknown>;

  @Prop({ type: Date }) submittedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedByUserId?: Types.ObjectId;
}

export const QuestionnaireSchema = SchemaFactory.createForClass(Questionnaire);
