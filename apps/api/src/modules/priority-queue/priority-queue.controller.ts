import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { PriorityQueueService } from './priority-queue.service';

@Controller('priority-queue')
export class PriorityQueueController {
  constructor(private readonly svc: PriorityQueueService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.getQueue(user);
  }
}
