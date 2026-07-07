import { Controller, Get, Query } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { Roles } from '../auth/roles.guard';

@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly svc: ActivityLogService) {}

  /**
   * Admin-only viewer. Filterable by userId / action / targetType /
   * date range. Defaults to the last 100 events, capped at 500 per
   * request.
   */
  @Get()
  @Roles('root', 'owner', 'admin')
  list(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.list({
      userId,
      action,
      targetType,
      targetId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
