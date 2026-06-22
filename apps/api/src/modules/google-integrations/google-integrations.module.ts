import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GoogleAuthToken,
  GoogleAuthTokenSchema,
} from './google-auth-token.schema';
import { GoogleOAuthService } from './google-oauth.service';
import { GscService } from './gsc.service';
import { Ga4Service } from './ga4.service';
import { MerchantCenterService } from './merchant-center.service';
import { GbpService } from './gbp.service';
import { CalendarService } from './calendar.service';
import { GoogleDocsService } from './google-docs.service';
import { GoogleIntegrationsService } from './google-integrations.service';
import { GoogleIntegrationsController } from './google-integrations.controller';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoogleAuthToken.name, schema: GoogleAuthTokenSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
      }),
    }),
    ClientsModule,
  ],
  controllers: [GoogleIntegrationsController],
  providers: [
    GoogleOAuthService,
    GscService,
    Ga4Service,
    MerchantCenterService,
    GbpService,
    CalendarService,
    GoogleDocsService,
    GoogleIntegrationsService,
  ],
  exports: [
    GoogleIntegrationsService,
    GoogleOAuthService,
    GscService,
    Ga4Service,
    MerchantCenterService,
    GbpService,
    CalendarService,
    GoogleDocsService,
  ],
})
export class GoogleIntegrationsModule {}
