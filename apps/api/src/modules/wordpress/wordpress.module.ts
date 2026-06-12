import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module';
import { WordpressController } from './wordpress.controller';
import { WordpressService } from './wordpress.service';

@Module({
  imports: [ClientsModule],
  controllers: [WordpressController],
  providers: [WordpressService],
  exports: [WordpressService],
})
export class WordpressModule {}
