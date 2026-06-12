import { Body, Controller, Get, Put } from '@nestjs/common';
import { ReportSectionConfig } from '@seo/shared';
import { AppSettingsService } from './app-settings.service';

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
}
