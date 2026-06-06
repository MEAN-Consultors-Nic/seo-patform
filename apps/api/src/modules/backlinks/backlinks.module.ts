import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Backlink, BacklinkSchema } from './backlink.schema';
import { BacklinksService } from './backlinks.service';
import { BacklinksController } from './backlinks.controller';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Backlink.name, schema: BacklinkSchema },
    ]),
    forwardRef(() => ClientsModule),
  ],
  controllers: [BacklinksController],
  providers: [BacklinksService],
  exports: [BacklinksService, MongooseModule],
})
export class BacklinksModule {}
