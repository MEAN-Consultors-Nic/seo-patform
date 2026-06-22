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
import { IsBoolean, IsOptional, IsString } from 'class-validator';
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

  // --- Supervisor management (root + manager only) -----------------------

  @Get('supervisors')
  @Roles('root', 'seo-manager')
  listSupervisors() {
    return this.supervisorSvc.listSupervisors();
  }

  /** Creates a new supervisor and returns the plaintext PIN ONCE. */
  @Post('supervisors')
  @Roles('root', 'seo-manager')
  createSupervisor(@Body() dto: CreateSupervisorDto) {
    return this.supervisorSvc.createSupervisor(dto.name);
  }

  @Post('supervisors/:id/regenerate-pin')
  @Roles('root', 'seo-manager')
  regenerateSupervisorPin(@Param('id') id: string) {
    return this.supervisorSvc.regenerateSupervisorPin(id);
  }

  @Patch('supervisors/:id')
  @Roles('root', 'seo-manager')
  updateSupervisor(
    @Param('id') id: string,
    @Body() dto: UpdateSupervisorDto,
  ) {
    return this.supervisorSvc.updateSupervisor(id, dto);
  }

  @Delete('supervisors/:id')
  @Roles('root', 'seo-manager')
  deleteSupervisor(@Param('id') id: string) {
    return this.supervisorSvc.deleteSupervisor(id);
  }
}
