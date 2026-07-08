import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class CreateSubscriptionDto {
  @IsMongoId() serviceId!: string;
  @IsOptional() @IsMongoId() packageId?: string;
  @IsOptional() @IsNumber() @Min(0) hoursPerCycle?: number;
  @IsOptional() @Transform(emptyToUndefined) @IsDateString() startDate?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsDateString() endingDate?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateSubscriptionDto {
  @IsOptional() @IsMongoId() serviceId?: string;
  @IsOptional() @IsMongoId() packageId?: string;
  @IsOptional() @IsNumber() @Min(0) hoursPerCycle?: number;
  @IsOptional() @Transform(emptyToUndefined) @IsDateString() startDate?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsDateString() endingDate?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() notes?: string;
}
