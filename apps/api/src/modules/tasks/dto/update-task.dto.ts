import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  /**
   * Transient hint sent only when the user is completing a task and
   * has chosen to omit its image attachments from the Google Doc sync.
   * Read once in TasksService.update() and never persisted to the task
   * document — that's why it lives only on the update DTO, not the
   * shared schema.
   */
  @IsOptional() @IsBoolean() skipImages?: boolean;

  /**
   * Transient hint for the doc-sync side-effect. When the user picks
   * a specific tab from the completion modal, the mirror path uses
   * this exact name via findTabByName instead of the default
   * findMonthlyTab (which derives 'March 2026' style labels from the
   * completedAt date). Not persisted on the task document.
   */
  @IsOptional() @IsString() docTabName?: string;
}
