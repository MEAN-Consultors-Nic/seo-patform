import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CannibalizationDismissedDocument =
  HydratedDocument<CannibalizationDismissed>;

/**
 * A query the user has marked as intentional cannibalization
 * (e.g. an alternate landing page is meant to compete on this query).
 * Dismissed queries still appear in the table but in a "Reviewed"
 * collapsed section, not flagged as actionable. We never auto-clear
 * these — a manual undismiss action would be needed if priorities
 * change.
 */
@Schema({ timestamps: true, collection: 'cannibalization_dismissed' })
export class CannibalizationDismissed {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true })
  query!: string;

  /** Optional note the user adds when dismissing — why it's intentional. */
  @Prop()
  note?: string;
}

export const CannibalizationDismissedSchema = SchemaFactory.createForClass(
  CannibalizationDismissed,
);
CannibalizationDismissedSchema.index(
  { clientId: 1, query: 1 },
  { unique: true },
);
