import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { ReportSectionConfig } from '@seo/shared';
import { AppSettingsService } from './app-settings.service';
import { SupervisorService } from '../supervisor/supervisor.service';
import { Roles } from '../auth/roles.guard';

class CreateSupervisorDto {
  @IsString() name!: string;
}

class UpdateSupervisorDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class PlatformSettingsDto {
  @IsOptional() @IsString() organizationName?: string;
  @IsOptional() @IsString() organizationColor?: string;
  @IsOptional()
  @IsIn(['weekly', 'biweekly', 'monthly'])
  digestFrequency?: 'weekly' | 'biweekly' | 'monthly';
}

@Controller('app-settings')
export class AppSettingsController {
  constructor(
    private readonly svc: AppSettingsService,
    private readonly supervisorSvc: SupervisorService,
  ) {}

  @Get('report-layout')
  getReportLayout() {
    return this.svc.getReportLayout();
  }

  @Put('report-layout')
  setReportLayout(@Body() body: { layout?: ReportSectionConfig[] }) {
    return this.svc.setReportLayout(body?.layout ?? []);
  }

  // --- Org branding + digest cadence (Core Slice 1.3) --------------------

  @Get('platform')
  getPlatform() {
    return this.svc.getPlatformSettings();
  }

  @Patch('platform')
  @Roles('root', 'owner', 'admin')
  async setPlatform(@Body() dto: PlatformSettingsDto) {
    await this.svc.setPlatformSettings(dto);
    return this.svc.getPlatformSettings();
  }

  // --- Supervisor management (root + manager only) -----------------------

  @Get('supervisors')
  @Roles('root', 'owner', 'admin')
  listSupervisors() {
    return this.supervisorSvc.listSupervisors();
  }

  /** Creates a new supervisor and returns the plaintext PIN ONCE. */
  @Post('supervisors')
  @Roles('root', 'owner', 'admin')
  createSupervisor(@Body() dto: CreateSupervisorDto) {
    return this.supervisorSvc.createSupervisor(dto.name);
  }

  @Post('supervisors/:id/regenerate-pin')
  @Roles('root', 'owner', 'admin')
  regenerateSupervisorPin(@Param('id') id: string) {
    return this.supervisorSvc.regenerateSupervisorPin(id);
  }

  @Patch('supervisors/:id')
  @Roles('root', 'owner', 'admin')
  updateSupervisor(
    @Param('id') id: string,
    @Body() dto: UpdateSupervisorDto,
  ) {
    return this.supervisorSvc.updateSupervisor(id, dto);
  }

  @Delete('supervisors/:id')
  @Roles('root', 'owner', 'admin')
  deleteSupervisor(@Param('id') id: string) {
    return this.supervisorSvc.deleteSupervisor(id);
  }
}
