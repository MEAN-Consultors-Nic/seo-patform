import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeBlock, TimeBlockSchema } from './time-block.schema';
import { TimeBlocksService } from './time-blocks.service';
import { TimeBlocksController } from './time-blocks.controller';
import { ClientsModule } from '../clients/clients.module';
import { CyclesModule } from '../cycles/cycles.module';
import { TasksModule } from '../tasks/tasks.module';
import { WorkingHoursModule } from '../working-hours/working-hours.module';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TimeBlock.name, schema: TimeBlockSchema },
    ]),
    ClientsModule,
    CyclesModule,
    TasksModule,
    WorkingHoursModule,
    GoogleIntegrationsModule,
  ],
  controllers: [TimeBlocksController],
  providers: [TimeBlocksService],
  exports: [TimeBlocksService],
})
export class TimeBlocksModule {}
