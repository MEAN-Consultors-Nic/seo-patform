import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/client.schema';
import { ClientsModule } from '../clients/clients.module';
import { Task, TaskSchema } from '../tasks/task.schema';
import { Cycle, CycleSchema } from '../cycles/cycle.schema';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';
import {
  PriorityQueueMomentumCache,
  PriorityQueueMomentumCacheSchema,
} from './priority-queue-cache.schema';
import { PriorityQueueService } from './priority-queue.service';
import { PriorityQueueController } from './priority-queue.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Cycle.name, schema: CycleSchema },
      {
        name: PriorityQueueMomentumCache.name,
        schema: PriorityQueueMomentumCacheSchema,
      },
    ]),
    ClientsModule,
    GoogleIntegrationsModule,
  ],
  controllers: [PriorityQueueController],
  providers: [PriorityQueueService],
})
export class PriorityQueueModule {}
