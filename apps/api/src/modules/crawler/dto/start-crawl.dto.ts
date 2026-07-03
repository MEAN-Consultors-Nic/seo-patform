import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class StartCrawlDto {
  @IsUrl({ require_protocol: true })
  rootUrl!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  maxDepth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  maxPages?: number;

  /** Requests per second. Kept low so we don't get rate-limited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  rateLimit?: number;

  @IsOptional()
  @IsBoolean()
  respectRobots?: boolean;

  @IsOptional()
  @IsBoolean()
  ignoreUtm?: boolean;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
