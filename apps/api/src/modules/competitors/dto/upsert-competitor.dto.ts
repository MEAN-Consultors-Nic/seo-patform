import {
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertCompetitorDto {
  @IsMongoId() clientId!: string;
  @IsString() name!: string;
  @IsString() url!: string;
  @IsOptional() @IsNumber() domainRating?: number;
  @IsOptional() @IsNumber() estimatedTraffic?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
