import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole } from '@seo/shared';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, type: String, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, type: String })
  passwordHash!: string;

  @Prop({ required: true, type: String })
  name!: string;

  /**
   * Enum accepts new roles + the two legacy values so the app can boot
   * against a database that hasn't run the migration yet. The migration
   * (UsersService.onModuleInit) rewrites legacy values to the new ones
   * on first boot; after that the legacy values remain permitted by the
   * schema for one release, then can be dropped.
   */
  @Prop({
    required: true,
    type: String,
    enum: [
      'root',
      'owner',
      'admin',
      'manager',
      'strategist',
      'supervisor',
      'client',
      'seo-manager',
      'seo-strategist',
    ],
    default: 'strategist',
  })
  role!: UserRole;

  /**
   * When set, the user reports up to this manager. Used to compute the
   * "team's clients" scope for managers and to display the org tree.
   * Nullable for root / owner / admin who sit outside the team hierarchy.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  managerId?: Types.ObjectId;

  @Prop({ default: true })
  active!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
