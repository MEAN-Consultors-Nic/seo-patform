import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  OnboardingAutoCheck,
  OnboardingItemPriority,
  OnboardingSection,
} from '@seo/shared';

const SECTIONS: OnboardingSection[] = [
  'accounts-access',
  'local-listings',
  'social',
  'research-strategy',
  'technical',
  'content',
  'other',
];

const PRIORITIES: OnboardingItemPriority[] = [
  'critical',
  'important',
  'nice-to-have',
];

const AUTO_CHECKS: OnboardingAutoCheck[] = [
  'gsc-configured',
  'ga4-configured',
  'gbp-configured',
  'shopify-connected',
  'wordpress-connected',
  'google-doc-linked',
  'website-set',
  'logo-set',
];

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class CreateOnboardingItemDto {
  @IsString() key!: string;
  @IsString() label!: string;
  @IsIn(SECTIONS) section!: OnboardingSection;
  @IsIn(PRIORITIES) priority!: OnboardingItemPriority;
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(AUTO_CHECKS)
  autoCheck?: OnboardingAutoCheck;
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
