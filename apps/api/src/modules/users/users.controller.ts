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
import { Roles } from '../auth/roles.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // List of assignable owners — visible to root and managers for the Owner dropdown.
  @Get('assignable')
  @Roles('root', 'owner', 'admin')
  assignable() {
    return this.users.findAssignable();
  }

  @Get()
  @Roles('root')
  findAll() {
    return this.users.findAll();
  }

  @Get(':id')
  @Roles('root')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @Roles('root')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  @Roles('root')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/reset-password')
  @Roles('root')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.password);
  }

  @Delete(':id')
  @Roles('root')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}
