import { Body, Controller, Get, Put } from '@nestjs/common';
import { WorkingHoursService } from './working-hours.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class TimeRangeDto {
  @Matches(TIME_PATTERN, { message: 'start must be HH:mm' })
  start!: string;
  @Matches(TIME_PATTERN, { message: 'end must be HH:mm' })
  end!: string;
}

class UpdateWorkingHoursDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workDays?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  timeBlocks?: TimeRangeDto[];

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(24)
  dailyCapHours?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsArray()
  @Matches(DATE_PATTERN, { each: true, message: 'daysOff must be YYYY-MM-DD' })
  daysOff?: string[];
}

@Controller('working-hours')
export class WorkingHoursController {
  constructor(private readonly svc: WorkingHoursService) {}

  @Get()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.findOrCreate(user.userId);
  }

  @Put()
  update(
    @Body() dto: UpdateWorkingHoursDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(user.userId, dto);
  }
}
