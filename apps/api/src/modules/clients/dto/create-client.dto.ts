import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClientTier } from '@seo/shared';

class ContactDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() role?: string;
}

class AccessDto {
  @IsOptional() @IsBoolean() gsc?: boolean;
  @IsOptional() @IsBoolean() ga4?: boolean;
  @IsOptional() @IsBoolean() gbp?: boolean;
  @IsOptional() @IsBoolean() cms?: boolean;
  @IsOptional() @IsBoolean() ahrefs?: boolean;
  @IsOptional() @IsBoolean() semrush?: boolean;
  @IsOptional() @IsString() notes?: string;
}

class KnowledgeDto {
  @IsOptional() @IsString() brandVoice?: string;
  @IsOptional() @IsString() targetPersona?: string;
  @IsOptional() @IsString() anchorRules?: string;
  @IsOptional() @IsString() internalLinkingStrategy?: string;
  @IsOptional() @IsString() internalNotes?: string;
}

class ServiceAreaMetricsDto {
  @IsOptional() @IsNumber() clicks?: number;
  @IsOptional() @IsNumber() impressions?: number;
  @IsOptional() @IsNumber() ctr?: number;
  @IsOptional() @IsNumber() position?: number;
  @IsOptional() @IsString() rangeFrom?: string;
  @IsOptional() @IsString() rangeTo?: string;
  @IsOptional() refreshedAt?: Date;
}

class ServiceAreaDto {
  @IsString() name!: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() landingPageUrl?: string;
  @IsOptional() @IsString() googleMapsUrl?: string;
  @IsOptional() @IsString() primaryKeyword?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @ValidateNested() @Type(() => ServiceAreaMetricsDto) metrics?: ServiceAreaMetricsDto;
}

class BaselineKpisDto {
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

export class CreateClientDto {
  @IsString() name!: string;
  @IsEnum(['A', 'B', 'C']) tier!: ClientTier;
  @IsString() url!: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsMongoId() ownerId?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts?: ContactDto[];
  @IsOptional() @ValidateNested() @Type(() => AccessDto) access?: AccessDto;
  @IsOptional() @ValidateNested() @Type(() => KnowledgeDto) knowledge?: KnowledgeDto;
  @IsOptional() @ValidateNested() @Type(() => BaselineKpisDto) baselineKpis?: BaselineKpisDto;
  @IsOptional() baselineDate?: Date;
  @IsOptional() @IsNumber() hoursPerCycle?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() ga4PropertyId?: string;
  @IsOptional() @IsString() gscSiteUrl?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaDto)
  serviceAreas?: ServiceAreaDto[];
}
