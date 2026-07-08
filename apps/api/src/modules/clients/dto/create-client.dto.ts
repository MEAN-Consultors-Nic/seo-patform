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
  @IsOptional() @IsString() _id?: string;
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() createdAt?: Date | string;
  @IsOptional() updatedAt?: Date | string;
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

class CredentialDto {
  @IsOptional() @IsString() _id?: string;
  @IsString() label!: string;
  @IsEnum(['website', 'booking', 'social', 'email', 'other'])
  category!: 'website' | 'booking' | 'social' | 'email' | 'other';
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() notes?: string;
  // Mongoose adds these to existing credential subdocs when the
  // frontend echoes them back on save. They're informational and we
  // don't trust the client values anyway, but the validator with
  // whitelist:true rejects unknown keys outright. Accept them as
  // optional so the round-trip works.
  @IsOptional() createdAt?: Date | string;
  @IsOptional() updatedAt?: Date | string;
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
  @IsOptional() @IsBoolean() isCityHub?: boolean;
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
  /** @deprecated Use packageId. Kept optional for legacy callers. */
  @IsOptional() @IsEnum(['A', 'B', 'C']) tier?: ClientTier;
  @IsOptional() @IsMongoId() packageId?: string;
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
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CredentialDto)
  credentials?: CredentialDto[];
  @IsOptional() @ValidateNested() @Type(() => KnowledgeDto) knowledge?: KnowledgeDto;
  @IsOptional() @ValidateNested() @Type(() => BaselineKpisDto) baselineKpis?: BaselineKpisDto;
  @IsOptional() baselineDate?: Date;
  @IsOptional() @IsNumber() hoursPerCycle?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() endingDate?: Date;
  @IsOptional() @IsArray() @IsString({ each: true }) calendarAliases?: string[];
  @IsOptional() @IsString() googleDocId?: string;
  @IsOptional() @IsString() googleSheetId?: string;
  @IsOptional() @IsString() ga4PropertyId?: string;
  @IsOptional() @IsString() gscSiteUrl?: string;
  @IsOptional() @IsBoolean() isEcommerce?: boolean;
  @IsOptional() @IsString() merchantCenterId?: string;
  @IsOptional() @IsString() gbpAccountName?: string;
  @IsOptional() @IsString() gbpLocationName?: string;
  @IsOptional() @IsString() shopifyShopDomain?: string;
  @IsOptional() @IsString() shopifyClientId?: string;
  @IsOptional() @IsString() shopifyClientSecret?: string;
  @IsOptional() @IsString() shopifyAccessToken?: string;
  @IsOptional() @IsEnum(['shopify', 'wordpress', 'custom']) websitePlatform?:
    | 'shopify'
    | 'wordpress'
    | 'custom';
  @IsOptional() @IsString() wordpressSiteUrl?: string;
  @IsOptional() @IsString() wordpressUsername?: string;
  @IsOptional() @IsString() wordpressAppPassword?: string;
  @IsOptional() @IsEnum(['yoast', 'rankmath', 'aioseo', 'native']) wordpressSeoPlugin?:
    | 'yoast'
    | 'rankmath'
    | 'aioseo'
    | 'native';
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaDto)
  serviceAreas?: ServiceAreaDto[];
  // Business profile — new fields consumed by the Onboarding tab.
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() businessDescription?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) services?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) socialLinks?: string[];
  @IsOptional() @IsString() reviewsUrl?: string;
  @IsOptional() @IsString() photosUrl?: string;
  /** Agency service lines: seo / ppc / website / other. Multi-select. */
  @IsOptional() @IsArray() @IsString({ each: true }) serviceLines?: string[];
}
