import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Keyword, KeywordSchema } from './keyword.schema';
import {
  KeywordRanking,
  KeywordRankingSchema,
} from './keyword-ranking.schema';
import { KeywordsService } from './keywords.service';
import { KeywordsController } from './keywords.controller';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Keyword.name, schema: KeywordSchema },
      { name: KeywordRanking.name, schema: KeywordRankingSchema },
    ]),
    forwardRef(() => ClientsModule),
  ],
  controllers: [KeywordsController],
  providers: [KeywordsService],
  exports: [KeywordsService, MongooseModule],
})
export class KeywordsModule {}
