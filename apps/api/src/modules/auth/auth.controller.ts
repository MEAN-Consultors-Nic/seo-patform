import {
  Body,
  Controller,
  Get,
  Post,
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
}
