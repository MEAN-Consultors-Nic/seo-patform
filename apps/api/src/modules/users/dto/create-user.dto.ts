import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@seo/shared';

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(['root', 'seo-manager', 'seo-strategist']) role!: UserRole;
  @IsOptional() @IsBoolean() active?: boolean;
}
