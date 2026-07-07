import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TaskTemplatesService } from './task-templates.service';
import { ClientTier, TaskTemplate } from '@seo/shared';
import { Roles } from '../auth/roles.guard';

@Controller('task-templates')
export class TaskTemplatesController {
  constructor(private readonly svc: TaskTemplatesService) {}

  @Get()
  list(@Query('tier') tier?: ClientTier, @Query('active') active?: string) {
    const activeBool =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.svc.list({ tier, active: activeBool });
  }

  @Post()
  @Roles('root', 'owner', 'admin')
  create(@Body() dto: Partial<TaskTemplate>) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('root', 'owner', 'admin')
  update(@Param('id') id: string, @Body() dto: Partial<TaskTemplate>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('root', 'owner', 'admin')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post('apply-recurring')
  @Roles('root', 'owner', 'admin')
  applyRecurring(@Body() body: { cycleId: string }) {
    return this.svc.applyRecurring(body.cycleId);
  }
}
