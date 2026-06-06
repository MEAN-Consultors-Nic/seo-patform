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
import { BacklinksService } from './backlinks.service';
import { UpsertBacklinkDto } from './dto/upsert-backlink.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';

@Controller('backlinks')
export class BacklinksController {
  constructor(
    private readonly svc: BacklinksService,
    private readonly clients: ClientsService,
  ) {}

  @Get()
  async byClient(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.svc.byClient(clientId, status);
  }

  @Get('summary')
  async summary(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.svc.summary(clientId);
  }

  @Post()
  async create(
    @Body() dto: UpsertBacklinkDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(dto.clientId, user);
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertBacklinkDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.remove(id, user);
  }
}
