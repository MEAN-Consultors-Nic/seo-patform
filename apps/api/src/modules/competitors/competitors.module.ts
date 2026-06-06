import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Competitor, CompetitorSchema } from './competitor.schema';
import { CompetitorsService } from './competitors.service';
import { CompetitorsController } from './competitors.controller';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Competitor.name, schema: CompetitorSchema },
    ]),
    forwardRef(() => ClientsModule),
  ],
  controllers: [CompetitorsController],
  providers: [CompetitorsService],
})
export class CompetitorsModule {}
