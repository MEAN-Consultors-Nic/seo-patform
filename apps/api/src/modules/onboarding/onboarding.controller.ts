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
import { OnboardingService } from './onboarding.service';
import { CreateOnboardingItemDto } from './dto/create-item.dto';
import { UpdateOnboardingItemDto } from './dto/update-item.dto';
import { UpdateProgressItemDto } from './dto/update-progress.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { AppSettingsService } from '../app-settings/app-settings.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly appSettings: AppSettingsService,
  ) {}

  // --- Template item CRUD ----------------------------------------------------

  @Get('items')
  listItems(@Query('includeInactive') includeInactive?: string) {
    return this.onboarding.listItems(includeInactive === 'true');
  }

  @Post('items')
  createItem(@Body() dto: CreateOnboardingItemDto) {
    return this.onboarding.createItem(dto);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingItemDto,
  ) {
    return this.onboarding.updateItem(id, dto);
  }

  @Delete('items/:id')
  removeItem(@Param('id') id: string) {
    return this.onboarding.removeItem(id);
  }

  // --- Window setting --------------------------------------------------------

  @Get('window-days')
  async getWindow() {
    return { onboardingWindowDays: await this.appSettings.getOnboardingWindowDays() };
  }

  @Patch('window-days')
  async setWindow(@Body() body: { days: number }) {
    const value = await this.appSettings.setOnboardingWindowDays(body?.days);
    return { onboardingWindowDays: value };
  }

  // --- Per-client snapshot / progress ---------------------------------------

  @Get('client/:clientId')
  snapshot(@Param('clientId') clientId: string) {
    return this.onboarding.snapshot(clientId);
  }

  @Patch('client/:clientId/state')
  setState(
    @Param('clientId') clientId: string,
    @Body() dto: UpdateProgressItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.onboarding.setState(clientId, dto, user.userId);
  }
}
