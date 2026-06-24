import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { CannibalizationService } from './cannibalization.service';

@Controller('clients/:clientId/cannibalization')
export class CannibalizationController {
  constructor(private readonly svc: CannibalizationService) {}

  @Get('keywords')
  keywords(
    @Param('clientId') clientId: string,
    @Query('refresh') refresh: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.getKeywordCannibalization(clientId, user, refresh === '1');
  }

  @Get('canonicals')
  canonicals(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.getCanonicalMismatches(clientId, user);
  }

  @Get('internal')
  internal(
    @Param('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.getInternalOverlap(clientId, user);
  }

  @Post('dismiss')
  dismiss(
    @Param('clientId') clientId: string,
    @Body() body: { query?: string; note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body?.query) throw new BadRequestException('query is required');
    return this.svc.dismissQuery(clientId, body.query, body.note, user);
  }

  @Delete('dismiss')
  undismiss(
    @Param('clientId') clientId: string,
    @Body() body: { query?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body?.query) throw new BadRequestException('query is required');
    return this.svc.undismissQuery(clientId, body.query, user);
  }
}
