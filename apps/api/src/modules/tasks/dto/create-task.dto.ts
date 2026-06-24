import {
  IsArray,
  IsBoolean,
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubtaskDto)
  subtasks?: SubtaskDto[];
}
