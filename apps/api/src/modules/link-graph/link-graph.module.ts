import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LinkGraphSnapshot,
  LinkGraphSnapshotSchema,
} from './link-graph.schema';
import { LinkGraphService } from './link-graph.service';
import { LinkGraphController } from './link-graph.controller';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LinkGraphSnapshot.name, schema: LinkGraphSnapshotSchema },
    ]),
    forwardRef(() => ClientsModule),
  ],
  providers: [LinkGraphService],
  controllers: [LinkGraphController],
  exports: [LinkGraphService],
})
export class LinkGraphModule {}
