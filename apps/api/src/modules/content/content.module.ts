import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentPiece, ContentPieceSchema } from './content-piece.schema';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { ClientsModule } from '../clients/clients.module';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ContentPiece.name, schema: ContentPieceSchema },
    ]),
    forwardRef(() => ClientsModule),
    GoogleIntegrationsModule,
  ],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
