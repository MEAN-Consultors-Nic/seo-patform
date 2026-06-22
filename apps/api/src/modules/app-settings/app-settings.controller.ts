import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ReportSectionConfig } from '@seo/shared';
import { AppSettingsService } from './app-settings.service';
import { Roles } from '../auth/roles.guard';

@Controller('app-settings')
export class AppSettingsController {
  constructor(private readonly svc: AppSettingsService) {}

  @Get('report-layout')
  getReportLayout() {
    return this.svc.getReportLayout();
  }

  @Put('report-layout')
  setReportLayout(@Body() body: { layout?: ReportSectionConfig[] }) {
    return this.svc.setReportLayout(body?.layout ?? []);
  }

  // --- Supervisor portal management (root + manager only) -----------------

  @Get('supervisor')
  @Roles('root', 'seo-manager')
  getSupervisorState() {
    return this.svc.getSupervisorState();
  }

  @Post('supervisor/regenerate-pin')
  @Roles('root', 'seo-manager')
  regenerateSupervisorPin() {
    return this.svc.regenerateSupervisorPin();
  }

  @Get('supervisor/reveal-pin')
  @Roles('root', 'seo-manager')
  revealSupervisorPin() {
    return this.svc.revealSupervisorPin();
  }

  @Delete('supervisor')
  @Roles('root', 'seo-manager')
  disableSupervisor() {
    return this.svc.clearSupervisorPin().then(() => ({ disabled: true }));
  }
}
