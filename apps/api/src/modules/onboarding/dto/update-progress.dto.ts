import { IsIn, IsOptional, IsString } from 'class-validator';
import { OnboardingItemState } from '@seo/shared';

const STATES: OnboardingItemState[] = ['pending', 'done', 'na'];

export class UpdateProgressItemDto {
  @IsString() key!: string;
  @IsIn(STATES) state!: OnboardingItemState;
  @IsOptional() @IsString() notes?: string;
}
