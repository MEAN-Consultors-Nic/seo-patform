import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ContentStatus } from '@seo/shared';

export class UpsertContentDto {
  @IsMongoId() clientId!: string;
  @IsString() title!: string;
  @IsOptional()
  @IsEnum(['idea', 'draft', 'published'])
  status?: ContentStatus;
  @IsOptional() @IsString() targetKeyword?: string;
  @IsOptional() @IsString() targetUrl?: string;
  @IsOptional() @IsString() briefUrl?: string;
  @IsOptional() @IsString() publishedUrl?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsNumber() wordCount?: number;
  @IsOptional() @IsString() notes?: string;
}
