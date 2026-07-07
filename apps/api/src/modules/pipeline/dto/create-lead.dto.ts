import {
  IsArray,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  LEAD_SOURCES,
  LeadService,
  LeadSource,
  LeadStage,
} from '@seo/shared';

const LEAD_SERVICES: LeadService[] = ['seo', 'ppc', 'website', 'combo', 'other'];
const LEAD_STAGES: LeadStage[] = [
  'new',
  'no_show',
  'proposal_sent',
  'closed_won',
  'closed_lost',
];

export class CreateLeadDto {
  @IsString() businessName!: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsIn(LEAD_SOURCES) source?: LeadSource;
  @IsOptional() @IsArray() @IsIn(LEAD_SERVICES, { each: true }) services?: LeadService[];
  @IsOptional() @IsNumber() @Min(0) monthlyDealValue?: number;
  @IsOptional() @IsNumber() @Min(0) oneTimeDealValue?: number;
  @IsOptional() @IsIn(LEAD_STAGES) stage?: LeadStage;
  @IsOptional() @IsMongoId() ownerId?: string;
  @IsOptional() @IsString() notes?: string;
}
