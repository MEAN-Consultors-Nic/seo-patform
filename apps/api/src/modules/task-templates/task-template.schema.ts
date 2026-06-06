import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ClientTier, TaskCategory } from '@seo/shared';

export type TaskTemplateDocument = HydratedDocument<TaskTemplate>;

@Schema({ timestamps: true, collection: 'task_templates' })
export class TaskTemplate {
  @Prop({ required: true }) title!: string;

  @Prop({
    required: true,
    type: String,
    enum: [
      'technical',
      'onpage',
      'content',
      'offpage',
      'local-gbp',
      'monitoring',
      'reporting',
    ],
  })
  category!: TaskCategory;

  @Prop() description?: string;

  @Prop({ required: true, default: 1 })
  defaultEstimatedHours!: number;

  @Prop({
    required: true,
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  })
  defaultPriority!: 'high' | 'medium' | 'low';

  @Prop({ type: [String], required: true, default: ['A', 'B', 'C'] })
  applicableTiers!: ClientTier[];

  @Prop({ default: true })
  active!: boolean;
}

export const TaskTemplateSchema = SchemaFactory.createForClass(TaskTemplate);
