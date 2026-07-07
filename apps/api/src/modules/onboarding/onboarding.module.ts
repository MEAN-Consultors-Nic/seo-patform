import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OnboardingItem,
  OnboardingItemSchema,
} from './onboarding-item.schema';
import {
  OnboardingProgress,
  OnboardingProgressSchema,
} from './onboarding-progress.schema';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { Client, ClientSchema } from '../clients/client.schema';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OnboardingItem.name, schema: OnboardingItemSchema },
      { name: OnboardingProgress.name, schema: OnboardingProgressSchema },
      { name: Client.name, schema: ClientSchema },
    ]),
    AppSettingsModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
