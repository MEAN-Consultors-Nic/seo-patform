import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole, USER_ROLES } from '@seo/shared';

/**
 * New users are created without a password. The API emails the invite
 * link; the user picks their own password via the /set-password flow.
 */
export class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() name!: string;
  @IsEnum(USER_ROLES) role!: UserRole;
  /** Optional: manager the user reports to (used for team hierarchy). */
  @IsOptional() @IsMongoId() managerId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
