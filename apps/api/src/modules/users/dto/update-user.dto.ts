import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@seo/shared';

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(['root', 'seo-manager', 'seo-strategist']) role?: UserRole;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ResetPasswordDto {
  @IsString() password!: string;
}
