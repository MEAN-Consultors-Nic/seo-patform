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
import { CompetitorsService } from './competitors.service';
import { UpsertCompetitorDto } from './dto/upsert-competitor.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';

@Controller('competitors')
export class CompetitorsController {
  constructor(
    private readonly svc: CompetitorsService,
    private readonly clients: ClientsService,
  ) {}

  @Get()
  async byClient(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.svc.byClient(clientId);
  }

  @Post()
  async create(
    @Body() dto: UpsertCompetitorDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(dto.clientId, user);
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertCompetitorDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.remove(id, user);
  }
}
