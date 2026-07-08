import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Public } from './jwt-auth.guard';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

class ChangePasswordDto {
  @IsString() @MinLength(6) currentPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

class SetPasswordDto {
  @IsString() token!: string;
  @IsString() @MinLength(8) password!: string;
}

class ForgotPasswordDto {
  @IsEmail() email!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: { user: { userId: string } }) {
    return this.auth.findById(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  change(
    @Req() req: { user: { userId: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  /**
   * Pre-check for the /set-password page. Client hits this with the
   * token from the URL to decide whether to render the form or an
   * "invalid link" state. Does not consume the token.
   */
  @Public()
  @Get('token/peek')
  peekToken(@Query('token') token: string) {
    if (!token) return { valid: false };
    return this.auth.peekToken(token);
  }

  /**
   * Consume an invite/reset token to set a password. Returns a JWT so
   * the user lands logged-in on the shell.
   */
  @Public()
  @Post('set-password')
  setPassword(@Body() dto: SetPasswordDto) {
    return this.auth.setPasswordFromToken(dto.token, dto.password);
  }

  /**
   * Kick off a password-reset flow. Always returns { ok: true } so the
   * caller can't tell whether the email exists.
   */
  @Public()
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('onboarding/complete')
  completeOnboarding(@Req() req: { user: { userId: string } }) {
    return this.auth.completeOnboarding(req.user.userId);
  }
}
