import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { PackageColor } from '@seo/shared';

const COLORS: PackageColor[] = [
  'ink',
  'sky',
  'brand',
  'positive',
  'amber',
  'purple',
  'rose',
];

export class CreateServiceDto {
  @IsString() name!: string;
  // slug: kebab-case, lowercase, alphanum + dashes
  @IsString() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) slug!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(COLORS) color?: PackageColor;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateServiceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) slug?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(COLORS) color?: PackageColor;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
