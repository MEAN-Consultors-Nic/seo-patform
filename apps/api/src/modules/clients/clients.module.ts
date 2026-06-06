import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from './client.schema';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { Keyword, KeywordSchema } from '../keywords/keyword.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { Cycle, CycleSchema } from '../cycles/cycle.schema';
import { Backlink, BacklinkSchema } from '../backlinks/backlink.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Keyword.name, schema: KeywordSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Cycle.name, schema: CycleSchema },
      { name: Backlink.name, schema: BacklinkSchema },
    ]),
  ],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService, MongooseModule],
})
export class ClientsModule {}
