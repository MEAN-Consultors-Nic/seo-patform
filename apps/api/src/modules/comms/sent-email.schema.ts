import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SentEmailDocument = HydratedDocument<SentEmail>;

/**
 * Archive of every outbound email dispatched via Gmail-send. Feeds
 * the client detail Comms tab ("last sent" + full history) and the
 * bulk-send roster ("who hasn't been contacted in N days").
 */
@Schema({ timestamps: true, collection: 'sent_emails' })
export class SentEmail {
  /** User who dispatched the email (the connected Gmail owner). */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  senderUserId!: Types.ObjectId;

  @Prop({ type: String }) senderEmail?: string;

  /** Client this message pertains to. Nullable for one-off sends. */
  @Prop({ type: Types.ObjectId, ref: 'Client', index: true })
  clientId?: Types.ObjectId;

  /**
   * Purpose slug so the archive can filter by "seo-report",
   * "opt-email", "proposal-followup", etc. Free-text so future
   * modules can register their own kinds.
   */
  @Prop({ type: String, required: true, default: 'general' })
  kind!: string;

  @Prop({ type: String, required: true }) subject!: string;

  /** Recipient list, primary + copies. Stored so we can display them. */
  @Prop({ type: [String], required: true }) to!: string[];
  @Prop({ type: [String], default: [] }) cc?: string[];
  @Prop({ type: [String], default: [] }) bcc?: string[];

  /** Rendered HTML body actually sent to Gmail. */
  @Prop({ type: String, required: true }) htmlBody!: string;

  /** Optional plain-text fallback body. */
  @Prop({ type: String }) textBody?: string;

  /** Attachments hint — filenames only, we don't store the payloads. */
  @Prop({ type: [String], default: [] }) attachmentNames?: string[];

  /** Gmail's message-id header, useful for reply threading. */
  @Prop({ type: String }) gmailMessageId?: string;

  /** Whether the send succeeded. false + error captured on failure. */
  @Prop({ type: Boolean, required: true, default: true }) ok!: boolean;
  @Prop({ type: String }) errorMessage?: string;
}

export const SentEmailSchema = SchemaFactory.createForClass(SentEmail);
SentEmailSchema.index({ clientId: 1, createdAt: -1 });
SentEmailSchema.index({ senderUserId: 1, createdAt: -1 });
