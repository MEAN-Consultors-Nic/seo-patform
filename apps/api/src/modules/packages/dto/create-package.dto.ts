import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsMongoId,
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

// Coerce empty strings to undefined so class-validator's @IsOptional
// treats blank form fields as "not provided" instead of failing @IsIn.
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class DeliverableDto {
  @IsString() key!: string;
  @IsString() label!: string;
  @Type(() => Number) @IsNumber() @Min(0) quantity!: number;
  @IsString() unit!: string;
  @IsIn(FREQUENCIES) frequency!: DeliverableFrequency;
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(TASK_CATEGORIES)
  matchTaskCategory?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreatePackageDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(PACKAGE_COLORS) color!: PackageColor;
  @IsOptional() @IsMongoId() serviceId?: string;
  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hoursPerPeriod?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliverableDto)
  deliverables?: DeliverableDto[];
}
