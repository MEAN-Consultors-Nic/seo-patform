import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  OnboardingAutoCheck,
  OnboardingItemPriority,
  OnboardingSection,
} from '@seo/shared';

export type OnboardingItemDocument = HydratedDocument<OnboardingItem>;

@Schema({ timestamps: true, collection: 'onboarding_items' })
export class OnboardingItem {
  @Prop({ required: true, unique: true, index: true }) key!: string;
  @Prop({ required: true }) label!: string;
  @Prop({ required: true }) section!: OnboardingSection;
  @Prop({ required: true, default: 'important' })
  priority!: OnboardingItemPriority;
  @Prop() autoCheck?: OnboardingAutoCheck;
  @Prop() helpText?: string;
  @Prop({ default: 100 }) order!: number;
  @Prop({ default: true }) active!: boolean;
}

export const OnboardingItemSchema = SchemaFactory.createForClass(OnboardingItem);
