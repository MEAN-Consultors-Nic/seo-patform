import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupervisorDocument = HydratedDocument<Supervisor>;

/**
 * One row per registered supervisor. Auth lookup compares the entered
 * PIN against each active supervisor's bcrypt hash; the first match
 * wins. Names are user-visible (shown in the comment thread and on the
 * supervisor portal welcome line) so they should be human-readable.
 *
 * No email / login flow — the PIN IS the credential, and the admin
 * controls rotation from the Settings page.
 */
@Schema({ timestamps: true, collection: 'supervisors' })
export class Supervisor {
  @Prop({ required: true })
  name!: string;

  /**
   * bcrypt(pin). The raw PIN is intentionally not stored — once shown
   * to the admin at creation / regeneration time, only the hash
   * survives. Admins can regenerate from the Settings page.
   */
  @Prop({ required: true })
  pinHash!: string;

  @Prop({ default: true })
  active!: boolean;

  /** Updated on each successful auth; surfaces "last seen" in the admin list. */
  @Prop()
  lastSeenAt?: Date;
}

export const SupervisorSchema = SchemaFactory.createForClass(Supervisor);
