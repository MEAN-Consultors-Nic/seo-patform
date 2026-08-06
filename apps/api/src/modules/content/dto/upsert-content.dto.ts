import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ContentPieceType, ContentStatus } from '@seo/shared';

export class UpsertContentDto {
  @IsMongoId() clientId!: string;
  @IsString() title!: string;
  @IsOptional()
  @IsEnum(['idea', 'draft', 'published'])
  status?: ContentStatus;
  @IsOptional()
  @IsEnum(['page', 'post'])
  contentType?: ContentPieceType;
  @IsOptional() @IsString() targetKeyword?: string;
  @IsOptional() @IsString() targetUrl?: string;
  @IsOptional() @IsString() briefUrl?: string;
  @IsOptional() @IsString() publishedUrl?: string;
  @IsOptional() @IsString() metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsOptional() @IsNumber() wordCount?: number;
  @IsOptional() @IsString() notes?: string;
}
