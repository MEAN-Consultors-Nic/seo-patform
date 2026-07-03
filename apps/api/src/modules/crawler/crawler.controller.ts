import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';
import { CrawlOrchestratorService } from './crawl-orchestrator.service';
import { CrawlAnalyzerService } from './crawl-analyzer.service';
import { CrawlerService } from './crawler.service';
import { StartCrawlDto } from './dto/start-crawl.dto';

@Controller('clients/:clientId/crawl')
export class CrawlerController {
  constructor(
    private readonly clients: ClientsService,
    private readonly svc: CrawlerService,
    private readonly orchestrator: CrawlOrchestratorService,
    private readonly analyzer: CrawlAnalyzerService,
  ) {}

  @Post('start')
  async start(
    @Param('clientId') clientId: string,
    @Body() dto: StartCrawlDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.orchestrator.startCrawl({
      clientId,
      rootUrl: dto.rootUrl,
      maxDepth: dto.maxDepth ?? 3,
      maxPages: dto.maxPages ?? 500,
      rateLimit: dto.rateLimit ?? 3,
      respectRobots: !!dto.respectRobots,
      ignoreUtm: dto.ignoreUtm !== false,
      userAgent: dto.userAgent,
      sitemapUrl: dto.sitemapUrl,
    });
  }

  @Get()
  async list(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.svc.listForClient(clientId);
  }

  @Get(':jobId/status')
  async status(
    @Param('clientId') clientId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.svc.getStatus(jobId);
  }

  @Get(':jobId/pages')
  async pages(
    @Param('clientId') clientId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.svc.listPages(jobId);
  }

  @Get(':jobId/analysis')
  async analysis(
    @Param('clientId') clientId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    return this.analyzer.analyze(jobId);
  }

  @Get(':jobId/csv')
  async csv(
    @Param('clientId') clientId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.clients.assertAccess(clientId, user);
    const csv = await this.svc.exportCsv(jobId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="crawl-${jobId}.csv"`,
    );
    res.send(csv);
  }

  @Post(':jobId/cancel')
  async cancel(
    @Param('clientId') clientId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    await this.orchestrator.cancelCrawl(jobId);
    return { cancelled: true };
  }
}
