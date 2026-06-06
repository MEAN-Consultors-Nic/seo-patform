import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tier') tier?: string,
    @Query('active') active?: string,
  ) {
    const activeBool =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.clients.findAll({ tier, active: activeBool }, user);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.clients.stats(user);
  }

  @Get('with-stats')
  findAllWithStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tier') tier?: string,
    @Query('active') active?: string,
  ) {
    const activeBool =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.clients.findAllWithStats({ tier, active: activeBool }, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clients.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clients.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clients.remove(id, user);
  }
}
