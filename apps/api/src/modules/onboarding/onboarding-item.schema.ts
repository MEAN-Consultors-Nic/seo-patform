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
  @Prop({ required: true, type: String, unique: true, index: true }) key!: string;
  @Prop({ required: true, type: String }) label!: string;
  // Explicit `type: String` for every union-typed prop — otherwise
  // @nestjs/mongoose throws CannotDetermineTypeError at boot.
  @Prop({ required: true, type: String }) section!: OnboardingSection;
  @Prop({ required: true, type: String, default: 'important' })
  priority!: OnboardingItemPriority;
  @Prop({ type: String }) autoCheck?: OnboardingAutoCheck;
  @Prop({ type: String }) helpText?: string;
  @Prop({ type: Number, default: 100 }) order!: number;
  @Prop({ type: Boolean, default: true }) active!: boolean;
}

export const OnboardingItemSchema = SchemaFactory.createForClass(OnboardingItem);
