import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { IndexingService } from './indexing.service';

@Controller('clients/:clientId/indexing')
export class IndexingController {
  constructor(private readonly svc: IndexingService) {}

  @Get()
  list(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.listForClient(clientId, user);
  }

  @Get('summary')
  summary(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.getSummary(clientId, user);
  }

  @Post('pull')
  pull(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.pullForClient(clientId, user);
  }

  @Post('request-indexing')
  requestIndexing(
    @Param('clientId') clientId: string,
    @Body() body: { url?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body?.url) throw new BadRequestException('url is required');
    return this.svc.requestIndexing(clientId, body.url, user);
  }
}
