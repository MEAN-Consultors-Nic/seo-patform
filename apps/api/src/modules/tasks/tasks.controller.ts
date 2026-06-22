import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId?: string,
    @Query('cycleId') cycleId?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.tasks.findAll({ clientId, cycleId, status, category }, user);
  }

  @Get('summary')
  summary(
    @Query('cycleId') cycleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.summaryByClient(cycleId, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.remove(id, user);
  }

  @Post(':id/attachments')
  addAttachment(
    @Param('id') id: string,
    @Body() body: {
      publicId: string;
      url: string;
      thumbnailUrl?: string;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      resourceType?: 'image' | 'raw' | 'video';
      originalFilename?: string;
      label?: 'before' | 'after' | 'other';
      caption?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.addAttachment(id, body, user);
  }

  @Patch(':id/attachments')
  patchAttachment(
    @Param('id') id: string,
    @Body() body: { publicId: string; label?: 'before' | 'after' | 'other'; caption?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { publicId, ...patch } = body;
    return this.tasks.updateAttachment(id, publicId, patch, user);
  }

  @Delete(':id/attachments')
  removeAttachment(
    @Param('id') id: string,
    @Body() body: { publicId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasks.removeAttachment(id, body.publicId, user);
  }

  @Post(':id/subtasks')
  addSubtask(
    @Param('id') id: string,
    @Body() body: { title?: string; done?: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body?.title || !body.title.trim()) {
      throw new BadRequestException('subtask title is required');
    }
    return this.tasks.addSubtask(
      id,
      { title: body.title.trim(), done: !!body.done },
      user,
    );
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() body: { content?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!body?.content || !body.content.trim()) {
      throw new BadRequestException('Comment is empty');
    }
    return this.tasks.addTeamComment(id, body.content.trim(), user);
  }
}
