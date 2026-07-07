import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole, USER_ROLES } from '@seo/shared';

export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsString() @MinLength(8) password!: string;
  @IsEnum(USER_ROLES) role!: UserRole;
  /** Optional: manager the user reports to (used for team hierarchy). */
  @IsOptional() @IsMongoId() managerId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
