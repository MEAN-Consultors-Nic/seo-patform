import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SendEmailAttachmentDto {
  @IsString() filename!: string;
  @IsString() contentBase64!: string;
  @IsOptional() @IsString() mimeType?: string;
}

export class SendEmailDto {
  /** Client the email belongs to. Nullable for one-off / non-client sends. */
  @IsOptional() @IsMongoId() clientId?: string;

  /** Purpose slug for the archive filter (default: 'general'). */
  @IsOptional() @IsString() kind?: string;

  @IsArray() @ArrayNotEmpty() @IsEmail({}, { each: true }) to!: string[];
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) cc?: string[];
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) bcc?: string[];

  @IsString() @MaxLength(200) subject!: string;

  /**
   * Rich HTML body. Rendered as-is inside the multipart/alternative
   * MIME payload alongside a plain-text fallback derived by stripping
   * tags.
   */
  @IsString() htmlBody!: string;

  @IsOptional() @IsString() textBody?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SendEmailAttachmentDto)
  attachments?: SendEmailAttachmentDto[];

  /** Optional Reply-To header override. */
  @IsOptional() @IsEmail() replyTo?: string;
}
