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

  @Post('pull-gsc')
  async pullGsc(
    @Body()
    body: {
      clientId: string;
      from: string;
      to: string;
      limit?: number;
      minImpressions?: number;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(body.clientId, user);
    return this.keywords.pullFromGsc(body.clientId, user, body);
  }

  @Delete('gsc-pulled/:clientId')
  cleanGscPulled(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.keywords.cleanGscPulled(clientId, user);
  }

  @Post('sync-gsc')
  async syncGsc(
    @Body() body: { clientId: string; from: string; to: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(body.clientId, user);
    return this.keywords.syncFromGsc(body.clientId, user, body);
  }

  /**
   * Historical position time series for a client's keywords. Returns
   * one series per keyword bucketed by day.
   */
  @Get('position-history/:clientId')
  async positionHistory(
    @Param('clientId') clientId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('keywordId') keywordId: string | undefined,
    @Query('country') country: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.keywords.positionHistory(clientId, user, {
      from,
      to,
      keywordId: keywordId || undefined,
      country: country || undefined,
    });
  }

  /**
   * Top movers over the past N days (default 7). Returns gainers +
   * losers so the tracker tab can highlight both wins and drops.
   */
  @Get('position-movers/:clientId')
  async positionMovers(
    @Param('clientId') clientId: string,
    @Query('days') daysRaw: string | undefined,
    @Query('country') country: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const days = daysRaw ? Math.max(1, Math.min(90, Number(daysRaw))) : 7;
    return this.keywords.positionMovers(
      clientId,
      user,
      days,
      undefined,
      country || undefined,
    );
  }

  /**
   * On-demand snapshot for a single client — triggers the same GSC
   * sync the daily cron runs, but immediately. Useful when a
   * strategist has just published and wants a fresh datapoint.
   */
  @Post('snapshot-now')
  async snapshotNow(
    @Body() body: { clientId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.keywords.snapshotNow(body.clientId, user);
  }
}
