import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { LinkGraphService } from './link-graph.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

@Controller('clients/:clientId/link-graph')
export class LinkGraphController {
  constructor(private readonly svc: LinkGraphService) {}

  @Get('snapshots')
  list(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.listSnapshots(clientId, user);
  }

  @Get('snapshots/:snapshotId')
  detail(
    @Param('clientId') clientId: string,
    @Param('snapshotId') snapshotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.getSnapshot(clientId, snapshotId, user);
  }

  @Post('crawl')
  crawl(
    @Param('clientId') clientId: string,
    @Body() body: { pageCap?: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.startCrawl(clientId, body || {}, user);
  }
}
