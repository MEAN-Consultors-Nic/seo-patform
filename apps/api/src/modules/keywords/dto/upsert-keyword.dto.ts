import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { KeywordIntent, RankingDevice } from '@seo/shared';

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
}

export class RecordPositionDto {
  @IsNumber() position!: number;
  @IsOptional() @IsString() rankingUrl?: string;
  @IsOptional() @IsEnum(['desktop', 'mobile']) device?: RankingDevice;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() notes?: string;
}
