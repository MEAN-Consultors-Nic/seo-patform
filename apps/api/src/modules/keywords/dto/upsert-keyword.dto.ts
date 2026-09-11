import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  KeywordIntent,
  KeywordPriority,
  KeywordStatus,
  RankingDevice,
} from '@seo/shared';

export class UpsertKeywordDto {
  @IsMongoId() clientId!: string;
  @IsString() text!: string;
  @IsOptional() @IsString() targetUrl?: string;
  @IsOptional() @IsNumber() volume?: number;
  @IsOptional() @IsNumber() difficulty?: number;
  @IsOptional()
  @IsEnum(['informational', 'transactional', 'commercial', 'navigational'])
  intent?: KeywordIntent;
  @IsOptional() @IsString() group?: string;

  // --- keyword-list / research fields ---
  // The global ValidationPipe runs with forbidNonWhitelisted, so every
  // field the edit modal sends has to be declared here or the whole
  // request is rejected.
  @IsOptional() @IsNumber() cpc?: number;
  @IsOptional() @IsEnum(['high', 'medium', 'low']) priority?: KeywordPriority;
  @IsOptional()
  @IsEnum(['idea', 'assigned', 'published'])
  status?: KeywordStatus;
  @IsOptional() @IsBoolean() tracked?: boolean;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) listIds?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class RecordPositionDto {
  @IsNumber() position!: number;
  @IsOptional() @IsString() rankingUrl?: string;
  @IsOptional() @IsEnum(['desktop', 'mobile']) device?: RankingDevice;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() notes?: string;
}
