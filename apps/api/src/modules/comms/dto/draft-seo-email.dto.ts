import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class KpiPairDto {
  @IsOptional() @IsNumber() current?: number;
  @IsOptional() @IsNumber() previous?: number;
}

export class DraftSeoEmailDto {
  @IsString() clientName!: string;
  @IsOptional() @IsString() clientDomain?: string;
  @IsString() periodLabel!: string;

  @IsOptional() @ValidateNested() @Type(() => KpiPairDto) clicks?: KpiPairDto;
  @IsOptional() @ValidateNested() @Type(() => KpiPairDto) impressions?: KpiPairDto;
  @IsOptional() @ValidateNested() @Type(() => KpiPairDto) avgPosition?: KpiPairDto;
  @IsOptional() @ValidateNested() @Type(() => KpiPairDto) top10?: KpiPairDto;

  @IsArray()
  @IsString({ each: true })
  actionsCompleted!: string[];

  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() signOff?: string;
  @IsOptional() @IsIn(['seo-report', 'opt-email', 'general']) kind?: string;
}
