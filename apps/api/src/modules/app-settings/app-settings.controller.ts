import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ReportSectionConfig } from '@seo/shared';
import { AppSettingsService } from './app-settings.service';
import { Roles } from '../auth/roles.guard';



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

}
