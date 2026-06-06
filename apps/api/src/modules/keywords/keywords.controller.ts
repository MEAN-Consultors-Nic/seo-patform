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
import { KeywordsService } from './keywords.service';
import { RecordPositionDto, UpsertKeywordDto } from './dto/upsert-keyword.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';

@Controller('keywords')
export class KeywordsController {
  constructor(
    private readonly keywords: KeywordsService,
    private readonly clients: ClientsService,
  ) {}

  @Get()
  async byClient(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.keywords.byClient(clientId);
  }

  @Get('summary')
  async summary(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.keywords.summaryByClient(clientId);
  }

  @Get('movements')
  async movements(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.keywords.movements(clientId);
  }

  @Get('volatility')
  async volatility(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.keywords.volatility(clientId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.keywords.findOne(id, user);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.keywords.timeline(id, user);
  }

  @Get(':id/history')
  history(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.keywords.history(id, user, limit ? Number(limit) : undefined);
  }

  @Post()
  async create(
    @Body() dto: UpsertKeywordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(dto.clientId, user);
    return this.keywords.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertKeywordDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.keywords.update(id, dto, user);
  }

  @Post(':id/positions')
  record(
    @Param('id') id: string,
    @Body() dto: RecordPositionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.keywords.recordPosition(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.keywords.remove(id, user);
  }
}
