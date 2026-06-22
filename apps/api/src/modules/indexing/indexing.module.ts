import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PageIndexStatus,
  PageIndexStatusSchema,
} from './page-index-status.schema';
import { Client, ClientSchema } from '../clients/client.schema';
import { IndexingService } from './indexing.service';
import { IndexingController } from './indexing.controller';
import { ClientsModule } from '../clients/clients.module';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PageIndexStatus.name, schema: PageIndexStatusSchema },
      { name: Client.name, schema: ClientSchema },
    ]),
    ClientsModule,
    GoogleIntegrationsModule,
  ],
  controllers: [IndexingController],
  providers: [IndexingService],
  exports: [IndexingService],
})
export class IndexingModule {}
