import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OnboardingItemState } from '@seo/shared';

@Schema({ _id: false })
export class OnboardingProgressItemSub {
  @Prop({ required: true, type: String }) key!: string;
  @Prop({ required: true, type: String, default: 'pending' })
  state!: OnboardingItemState;
  @Prop({ type: Date }) completedAt?: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' })
  completedBy?: Types.ObjectId;
  @Prop({ type: String }) notes?: string;
}

const ProgressItemSchemaDef = SchemaFactory.createForClass(
  OnboardingProgressItemSub,
);

export type OnboardingProgressDocument = HydratedDocument<OnboardingProgress>;

@Schema({ timestamps: true, collection: 'onboarding_progress' })
export class OnboardingProgress {
  @Prop({
    type: Types.ObjectId,
    ref: 'Client',
    required: true,
    unique: true,
    index: true,
  })
  clientId!: Types.ObjectId;

  @Prop({ type: [ProgressItemSchemaDef], default: [] })
  items!: OnboardingProgressItemSub[];
}

export const OnboardingProgressSchema =
  SchemaFactory.createForClass(OnboardingProgress);
