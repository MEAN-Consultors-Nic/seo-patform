import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskCategory, TaskStatus } from '@seo/shared';

export class SubtaskDto {
  @IsString() title!: string;
  @IsOptional() @IsBoolean() done?: boolean;
}

export class CreateTaskDto {
  @IsMongoId() clientId!: string;
  /** Optional — cycles are being phased out in favor of date-range reports. */
  @IsOptional() @IsMongoId() cycleId?: string;

  /**
   * Optional — the content pipeline piece this task was spawned for.
   * Set by the "Write draft" action so publishing the piece can find
   * and auto-complete this task.
   */
  @IsOptional() @IsMongoId() contentPieceId?: string;

  @IsEnum([
    'technical',
    'onpage',
    'content',
    'offpage',
    'local-gbp',
    'monitoring',
    'reporting',
  ])
  category!: TaskCategory;

  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() estimatedHours?: number;
  @IsOptional() @IsNumber() actualHours?: number;

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed', 'blocked'])
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(['high', 'medium', 'low'])
  priority?: 'high' | 'medium' | 'low';

  @IsOptional() @IsString() notes?: string;

  /**
   * Explicit completed-at date. Normally set automatically by the
   * service when status flips to 'completed', but exposed here so
   * the UI can backdate a task (or fix an accidentally-wrong date).
   */
  @IsOptional() @IsDateString() completedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtaskDto)
  subtasks?: SubtaskDto[];
}
