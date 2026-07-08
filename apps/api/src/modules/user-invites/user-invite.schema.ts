import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserInviteDocument = HydratedDocument<UserInvite>;

export type UserInvitePurpose = 'invite' | 'password_reset';

/**
 * One row per outstanding invite / password-reset request. We store a
 * SHA-256 hash of the token so a database dump doesn't leak reusable
 * links. The raw token only lives in the email we send.
 *
 * Mongo's TTL index (`expires: 0` on `expiresAt`) purges expired rows
 * automatically so stale tokens can't accumulate.
 */
@Schema({ timestamps: true, collection: 'user_invites' })
export class UserInvite {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ type: String, enum: ['invite', 'password_reset'], required: true })
  purpose!: UserInvitePurpose;

  @Prop({ required: true }) expiresAt!: Date;

  @Prop() usedAt?: Date;
}

export const UserInviteSchema = SchemaFactory.createForClass(UserInvite);
UserInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
