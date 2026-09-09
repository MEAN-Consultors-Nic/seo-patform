import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { TaskTemplatesModule } from '../task-templates/task-templates.module';
import { CyclesModule } from '../cycles/cycles.module';
import { PriorityQueueModule } from '../priority-queue/priority-queue.module';

/**
 * Work-planning barrel — everything about scheduling and tracking
 * strategist work: task lifecycle, task templates, cycles (kept for
 * legacy report compat), and the daily priority queue.
 */
@Module({
  imports: [
    TasksModule,
    TaskTemplatesModule,
    CyclesModule,
    PriorityQueueModule,
  ],
  exports: [
    TasksModule,
    TaskTemplatesModule,
    CyclesModule,
    PriorityQueueModule,
  ],
})
export class WorkModule {}
