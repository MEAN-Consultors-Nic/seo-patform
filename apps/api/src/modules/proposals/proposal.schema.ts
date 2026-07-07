import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProposalCadence, ProposalStatus } from '@seo/shared';

@Schema({ _id: false })
class ProposalItemSub {
  @Prop({ required: true, type: String }) name!: string;
  @Prop({ type: String }) description?: string;
  @Prop({
    required: true,
    type: String,
    enum: ['one-time', 'monthly', 'annual'],
    default: 'monthly',
  })
  cadence!: ProposalCadence;
  @Prop({ required: true, type: Number, min: 0, default: 1 })
  quantity!: number;
  @Prop({ required: true, type: Number, min: 0 }) unitPrice!: number;
  @Prop({ type: String }) paymentLinkUrl?: string;
}
const ProposalItemSchemaDef = SchemaFactory.createForClass(ProposalItemSub);

export type ProposalDocument = HydratedDocument<Proposal>;

/**
 * Sales proposal. Standalone entity — can be linked to a Lead or a
 * Client but neither is required. When the lead is closed_won the
 * intake flow can wire the proposal's outcome back to the pipeline.
 */
@Schema({ timestamps: true, collection: 'proposals' })
export class Proposal {
  @Prop({ required: true, type: String }) title!: string;
  @Prop({ type: Types.ObjectId, ref: 'Lead', index: true })
  leadId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Client', index: true })
  clientId?: Types.ObjectId;

  @Prop({ required: true, type: String, index: true }) businessName!: string;
  @Prop({ type: String }) contactName?: string;
  @Prop({ type: String }) email?: string;
  @Prop({ type: String }) phone?: string;
  @Prop({ type: String }) website?: string;

  @Prop({ type: [ProposalItemSchemaDef], default: [] })
  items!: ProposalItemSub[];

  @Prop({ type: String }) intro?: string;
  @Prop({ type: String }) terms?: string;
  @Prop({ type: String }) notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  senderUserId?: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: ['draft', 'sent', 'viewed', 'signed', 'declined', 'expired'],
    default: 'draft',
    index: true,
  })
  status!: ProposalStatus;

  /** Public share token for the client-viewable page. */
  @Prop({ type: String, unique: true, sparse: true, index: true })
  shareToken?: string;
  @Prop({ type: String }) sharePin?: string;

  @Prop({ type: Date }) sentAt?: Date;
  @Prop({ type: Date }) viewedAt?: Date;
  @Prop({ type: Date }) signedAt?: Date;
  @Prop({ type: Date }) declinedAt?: Date;
  @Prop({ type: Date }) expiresAt?: Date;
}

export const ProposalSchema = SchemaFactory.createForClass(Proposal);
