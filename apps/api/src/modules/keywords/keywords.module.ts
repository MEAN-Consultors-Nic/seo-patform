import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Keyword, KeywordSchema } from './keyword.schema';
import {
  KeywordRanking,
  KeywordRankingSchema,
} from './keyword-ranking.schema';
import { Client, ClientSchema } from '../clients/client.schema';
import { KeywordsService } from './keywords.service';
import { KeywordsController } from './keywords.controller';
import { ClientsModule } from '../clients/clients.module';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Keyword.name, schema: KeywordSchema },
      { name: KeywordRanking.name, schema: KeywordRankingSchema },
      // Client model registered locally so the daily-snapshot cron can
      // enumerate clients without depending on ClientsService (which is
      // forwardRef'd and not fully constructed during module bootstrap).
      { name: Client.name, schema: ClientSchema },
    ]),
    forwardRef(() => ClientsModule),
    GoogleIntegrationsModule,
  ],
  controllers: [KeywordsController],
  providers: [KeywordsService],
  exports: [KeywordsService, MongooseModule],
})
export class KeywordsModule {}
