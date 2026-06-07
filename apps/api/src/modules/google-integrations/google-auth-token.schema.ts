import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type GoogleAuthTokenDocument = HydratedDocument<GoogleAuthToken>;

@Schema({ timestamps: true, collection: 'google-auth-tokens' })
export class GoogleAuthToken {
  // We currently store one token per user (typically the agency root account).
  // Used for Search Console queries on behalf of that user.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  refreshToken!: string;

  @Prop()
  accessToken?: string;

  @Prop({ type: Date })
  accessTokenExpiresAt?: Date;

  @Prop({ type: [String], default: [] })
  scopes!: string[];

  @Prop()
  googleEmail?: string;
}

export const GoogleAuthTokenSchema = SchemaFactory.createForClass(GoogleAuthToken);
