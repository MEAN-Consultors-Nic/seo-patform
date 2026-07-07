import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProposalCadence } from '@seo/shared';

const CADENCES: ProposalCadence[] = ['one-time', 'monthly', 'annual'];

export class ProposalItemDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(CADENCES) cadence!: ProposalCadence;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsOptional() @IsString() paymentLinkUrl?: string;
}

export class CreateProposalDto {
  @IsString() title!: string;
  @IsOptional() @IsMongoId() leadId?: string;
  @IsOptional() @IsMongoId() clientId?: string;
  @IsString() businessName!: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() website?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalItemDto)
  items!: ProposalItemDto[];
  @IsOptional() @IsString() intro?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsString() notes?: string;
}
