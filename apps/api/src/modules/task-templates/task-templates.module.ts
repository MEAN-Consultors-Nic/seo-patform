import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TaskTemplate,
  TaskTemplateSchema,
} from './task-template.schema';
import { TaskTemplatesService } from './task-templates.service';
import { TaskTemplatesController } from './task-templates.controller';
import { ClientsModule } from '../clients/clients.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaskTemplate.name, schema: TaskTemplateSchema },
    ]),
    ClientsModule,
    TasksModule,
  ],
  controllers: [TaskTemplatesController],
  providers: [TaskTemplatesService],
})
export class TaskTemplatesModule {}
