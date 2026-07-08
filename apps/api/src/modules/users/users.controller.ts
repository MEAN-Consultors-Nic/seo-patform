import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto, UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { Roles } from '../auth/roles.guard';

/**
 * User management endpoints. Post-Phase-1 hierarchy:
 * root / owner / admin can manage users (create / update / delete /
 * reset password). Manager / strategist / client roles cannot.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // List of assignable owners — visible to admin+ for the Owner
  // dropdown on the Client form.
  @Get('assignable')
  @Roles('root', 'owner', 'admin')
  assignable() {
    return this.users.findAssignable();
  }

  @Get()
  @Roles('root', 'owner', 'admin')
  findAll() {
    return this.users.findAll();
  }

  @Get(':id')
  @Roles('root', 'owner', 'admin')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @Roles('root', 'owner', 'admin')
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.create(dto, actor.email);
  }

  @Post(':id/resend-invite')
  @Roles('root', 'owner', 'admin')
  resendInvite(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.resendInvite(id, actor.email);
  }

  @Patch(':id')
  @Roles('root', 'owner', 'admin')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/reset-password')
  @Roles('root', 'owner', 'admin')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.password);
  }

  @Delete(':id')
  @Roles('root', 'owner', 'admin')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
