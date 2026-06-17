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
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { TimeBlocksService } from './time-blocks.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { TimeBlockStatus } from '@seo/shared';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class CreateBlockDto {
  @IsString() cycleId!: string;
  @Matches(DATE) date!: string;
  @Matches(TIME) startTime!: string;
  @Matches(TIME) endTime!: string;
  @IsString() clientId!: string;
  @IsOptional() @IsString() taskId?: string;
  @IsOptional() @IsString() notes?: string;
}

class UpdateBlockDto {
  @IsOptional() @Matches(DATE) date?: string;
  @IsOptional() @Matches(TIME) startTime?: string;
  @IsOptional() @Matches(TIME) endTime?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() taskId?: string | null;
  @IsOptional()
  @IsIn(['planned', 'in_progress', 'completed', 'skipped'])
  status?: TimeBlockStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Min(0) actualMinutes?: number;
}

class PullFromCalendarDto {
  @IsString() cycleId!: string;
}

class CompleteDto {
  @IsOptional() @IsNumber() @Min(0) actualMinutes?: number;
}

@Controller('time-blocks')
export class TimeBlocksController {
  constructor(private readonly svc: TimeBlocksService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cycleId') cycleId?: string,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listForUser(user.userId, { cycleId, date, from, to });
  }

  @Post()
  create(@Body() dto: CreateBlockDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, user.userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.remove(id, user.userId);
  }

  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.start(id, user.userId);
  }

  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.complete(id, user.userId, dto?.actualMinutes);
  }

  @Post(':id/skip')
  skip(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.skip(id, user.userId);
  }

  @Post('pull-from-calendar')
  pullFromCalendar(
    @Body() dto: PullFromCalendarDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.pullFromCalendar(user.userId, dto.cycleId);
  }
}
