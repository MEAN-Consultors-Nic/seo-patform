import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { UpsertReportDto } from './dto/upsert-report.dto';
import { Public } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly clients: ClientsService,
  ) {}

  @Get()
  async byClient(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.reports.findByClient(clientId);
  }

  @Get('kpi-history')
  async kpiHistory(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.reports.kpiHistory(clientId, limit ? Number(limit) : undefined);
  }

  @Get('by-cycle')
  async byCycle(
    @Query('clientId') clientId: string,
    @Query('cycleId') cycleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.reports.findOneByCycle(clientId, cycleId);
  }

  @Post()
  async upsert(
    @Body() dto: UpsertReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(dto.clientId, user);
    return this.reports.upsert(dto);
  }

  @Post('auto-compose')
  async autoCompose(
    @Body() body: { clientId: string; cycleId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(body.clientId, user);
    return this.reports.autoCompose(body.clientId, body.cycleId);
  }

  @Get('pdf/:clientId/:cycleId')
  async pdf(
    @Param('clientId') clientId: string,
    @Param('cycleId') cycleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.clients.assertAccess(clientId, user);
    const buf = await this.reports.generatePdf(clientId, cycleId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="report-${clientId}-${cycleId}.pdf"`,
    );
    res.send(buf);
  }

  // --- Share (auth required to manage) -------------------------------------
  @Post('share')
  async share(
    @Body() body: { clientId: string; cycleId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(body.clientId, user);
    return this.reports.ensureShareToken(body.clientId, body.cycleId);
  }

  @Post('share/reset-pin')
  async resetPin(
    @Body() body: { clientId: string; cycleId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(body.clientId, user);
    return this.reports.regeneratePin(body.clientId, body.cycleId);
  }

  @Post('share/send-notification')
  async sendNotification(
    @Body() body: { clientId: string; cycleId: string; recipients: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(body.clientId, user);
    return this.reports.sendNotification(
      body.clientId,
      body.cycleId,
      body.recipients || [],
    );
  }

  @Delete('share')
  async revoke(
    @Body() body: { clientId: string; cycleId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(body.clientId, user);
    return this.reports.revokeShareToken(body.clientId, body.cycleId);
  }
}

// --- Public controller (no auth) -------------------------------------------
@Controller('public/reports')
export class PublicReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Public()
  @Get(':token')
  meta(@Param('token') token: string) {
    return this.reports.getPublicMeta(token);
  }

  @Public()
  @Post(':token/unlock')
  unlock(@Param('token') token: string, @Body() body: { pin: string }) {
    const pin = (body?.pin || '').trim();
    return this.reports.verifyPin(token, pin);
  }

  @Public()
  @Get(':token/pdf')
  async pdf(
    @Param('token') token: string,
    @Query('unlock') unlock: string,
    @Res() res: Response,
  ) {
    this.reports.verifyPdfUnlock(unlock, token);
    const buf = await this.reports.generatePdfByToken(token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="report.pdf"`);
    res.send(buf);
  }
}
