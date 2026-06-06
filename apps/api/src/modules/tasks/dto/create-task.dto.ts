import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TaskCategory, TaskStatus } from '@seo/shared';

export class CreateTaskDto {
  @IsMongoId() clientId!: string;
  @IsMongoId() cycleId!: string;

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
}
