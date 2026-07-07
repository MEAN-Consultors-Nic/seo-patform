import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PackageColor, DeliverableFrequency } from '@seo/shared';

const PACKAGE_COLORS: PackageColor[] = [
  'ink',
  'sky',
  'brand',
  'positive',
  'amber',
  'purple',
  'rose',
];

const FREQUENCIES: DeliverableFrequency[] = [
  'per_period',
  'weekly',
  'biweekly',
  'monthly',
];

const TASK_CATEGORIES = [
  'technical',
  'onpage',
  'content',
  'offpage',
  'local-gbp',
  'monitoring',
  'reporting',
];

export class DeliverableDto {
  @IsString() key!: string;
  @IsString() label!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsString() unit!: string;
  @IsIn(FREQUENCIES) frequency!: DeliverableFrequency;
  @IsOptional() @IsIn(TASK_CATEGORIES) matchTaskCategory?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePackageDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(PACKAGE_COLORS) color!: PackageColor;
  @IsOptional() @IsNumber() @Min(0) hoursPerPeriod?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliverableDto)
  deliverables!: DeliverableDto[];
}
