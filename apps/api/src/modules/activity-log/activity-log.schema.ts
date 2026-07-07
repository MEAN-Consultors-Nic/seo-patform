import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityLogDocument = HydratedDocument<ActivityLog>;

/**
 * Append-only audit trail. Every meaningful state change in the
 * platform posts a row here so admins can answer "who did what,
 * when, to which client / user / package". Consumers of this
 * feed include the future credentials watchdog and the delivery
 * risk digest.
 */
@Schema({ timestamps: { createdAt: 'at', updatedAt: false }, collection: 'activity_log' })
export class ActivityLog {
  /**
   * Actor. Null for pre-auth events (e.g. failed login attempts with
   * an unknown email) — those still get logged with just email + IP.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  userId?: Types.ObjectId;

  /** Denormalized so we don't have to join on delete. */
  @Prop({ type: String }) userEmail?: string;

  /** Verb.noun format — e.g. "client.updated", "auth.login.success". */
  @Prop({ required: true, type: String, index: true }) action!: string;

  /** e.g. "Client", "User", "Package", "Report". */
  @Prop({ type: String, index: true }) targetType?: string;

  /** ObjectId or human-readable id string of the target row. */
  @Prop({ type: String }) targetId?: string;

  /** Small structured payload with the meaningful change details. */
  @Prop({ type: Object }) details?: Record<string, unknown>;

  @Prop({ type: String }) ip?: string;
  @Prop({ type: String }) userAgent?: string;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
ActivityLogSchema.index({ userId: 1, action: 1, targetType: 1 });
