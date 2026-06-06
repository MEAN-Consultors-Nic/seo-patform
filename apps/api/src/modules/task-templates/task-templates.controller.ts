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
  @Roles('root', 'seo-manager')
  create(@Body() dto: Partial<TaskTemplate>) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('root', 'seo-manager')
  update(@Param('id') id: string, @Body() dto: Partial<TaskTemplate>) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('root', 'seo-manager')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post('apply-recurring')
  @Roles('root', 'seo-manager')
  applyRecurring(@Body() body: { cycleId: string }) {
    return this.svc.applyRecurring(body.cycleId);
  }
}
