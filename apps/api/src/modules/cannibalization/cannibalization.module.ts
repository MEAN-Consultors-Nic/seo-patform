import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/client.schema';
import { ClientsModule } from '../clients/clients.module';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';
import {
  PageIndexStatus,
  PageIndexStatusSchema,
} from '../indexing/page-index-status.schema';
import {
  ContentPiece,
  ContentPieceSchema,
} from '../content/content-piece.schema';
import {
  CannibalizationCache,
  CannibalizationCacheSchema,
} from './cannibalization-cache.schema';
import {
  CannibalizationDismissed,
  CannibalizationDismissedSchema,
} from './cannibalization-dismissed.schema';
import { CannibalizationService } from './cannibalization.service';
import { CannibalizationController } from './cannibalization.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: PageIndexStatus.name, schema: PageIndexStatusSchema },
      { name: ContentPiece.name, schema: ContentPieceSchema },
      { name: CannibalizationCache.name, schema: CannibalizationCacheSchema },
      {
        name: CannibalizationDismissed.name,
        schema: CannibalizationDismissedSchema,
      },
    ]),
    ClientsModule,
    GoogleIntegrationsModule,
  ],
  controllers: [CannibalizationController],
  providers: [CannibalizationService],
  exports: [CannibalizationService],
})
export class CannibalizationModule {}
