import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole, USER_ROLES } from '@seo/shared';

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(USER_ROLES) role?: UserRole;
  /** Empty string clears the manager assignment; ObjectId sets it. */
  @IsOptional() @IsMongoId() managerId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ResetPasswordDto {
  @IsString() password!: string;
}
