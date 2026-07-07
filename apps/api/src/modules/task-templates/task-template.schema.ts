import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
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

  /**
   * @deprecated Kept during the tier → package migration so the seed +
   * legacy filters keep working while packages populate. Once every
   * environment has run the boot-time migration this can be removed.
   */
  @Prop({ type: [String], required: false, default: undefined })
  applicableTiers?: ClientTier[];

  /**
   * Post-migration source of truth for which Packages this template
   * applies to. Populated automatically from applicableTiers via
   * PackagesService.onModuleInit; new templates created after the
   * migration set this directly.
   */
  @Prop({ type: [Types.ObjectId], ref: 'Package', default: [] })
  applicablePackageIds!: Types.ObjectId[];

  @Prop({ default: true })
  active!: boolean;
}

export const TaskTemplateSchema = SchemaFactory.createForClass(TaskTemplate);
