import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class KpisDto {
  @IsOptional() @IsNumber() organicSessions?: number;
  @IsOptional() @IsNumber() newUsers?: number;
  @IsOptional() @IsNumber() engagementRate?: number;
  @IsOptional() @IsNumber() avgEngagementTime?: number;
  @IsOptional() @IsNumber() conversionRate?: number;
  @IsOptional() @IsNumber() impressions?: number;
  @IsOptional() @IsNumber() clicks?: number;
  @IsOptional() @IsNumber() ctr?: number;
  @IsOptional() @IsNumber() avgPosition?: number;
  @IsOptional() @IsNumber() conversions?: number;
  @IsOptional() @IsNumber() indexedPages?: number;
  @IsOptional() @IsNumber() nonIndexedPages?: number;
  @IsOptional() @IsNumber() gbpSearches?: number;
  @IsOptional() @IsNumber() gbpCalls?: number;
  @IsOptional() @IsNumber() gbpDirections?: number;
  @IsOptional() @IsNumber() gbpWebsiteClicks?: number;
  @IsOptional() @IsNumber() gbpReviews?: number;
}

export class UpsertReportDto {
  @IsMongoId() clientId!: string;
  @IsMongoId() cycleId!: string;

  @IsOptional() @ValidateNested() @Type(() => KpisDto) kpis?: KpisDto;
  @IsOptional() @ValidateNested() @Type(() => KpisDto) kpisPrevious?: KpisDto;

  @IsOptional() @IsString() coverImageUrl?: string;
  @IsOptional() @IsString() executiveSummary?: string;
  @IsOptional() @IsString() findings?: string;
  @IsOptional() @IsString() nextPeriodPlan?: string;
  @IsOptional() @IsString() clientBlockers?: string;
  @IsOptional() @IsString() finalConsiderations?: string;
  @IsOptional() @IsBoolean() includeServiceAreas?: boolean;
  @IsOptional() @IsBoolean() comparePeriods?: boolean;
  @IsOptional()
  @IsEnum(['clicks', 'impressions', 'ctr', 'position'])
  locationsSort?: 'clicks' | 'impressions' | 'ctr' | 'position';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenKpis?: string[];
}
