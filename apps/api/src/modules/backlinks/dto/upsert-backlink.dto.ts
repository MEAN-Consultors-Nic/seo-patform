import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { BacklinkStatus, BacklinkType } from '@seo/shared';

export class UpsertBacklinkDto {
  @IsMongoId() clientId!: string;
  @IsString() sourceUrl!: string;
  @IsString() targetUrl!: string;
  @IsString() anchorText!: string;
  @IsOptional() @IsNumber() domainRating?: number;
  @IsOptional()
  @IsEnum(['dofollow', 'nofollow'])
  linkType?: BacklinkType;
  @IsOptional() @IsEnum(['live', 'lost', 'pending']) status?: BacklinkStatus;
  @IsOptional() @IsString() notes?: string;
}
