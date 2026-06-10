import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  AttachmentLabel,
  Subtask,
  TaskAttachment,
  TaskCategory,
  TaskStatus,
} from '@seo/shared';

export type TaskDocument = HydratedDocument<Task>;

@Schema({ _id: false })
class TaskAttachmentSubSchema implements TaskAttachment {
  @Prop({ required: true }) publicId!: string;
  @Prop({ required: true }) url!: string;
  @Prop() thumbnailUrl?: string;
  @Prop() format?: string;
  @Prop() width?: number;
  @Prop() height?: number;
  @Prop() bytes?: number;
  @Prop({ type: String, enum: ['image', 'raw', 'video'] })
  resourceType?: 'image' | 'raw' | 'video';
  @Prop() originalFilename?: string;
  @Prop({ type: String, enum: ['before', 'after', 'other'], default: 'other' })
  label?: AttachmentLabel;
  @Prop() caption?: string;
  @Prop({ default: () => new Date() }) uploadedAt!: Date;
}

@Schema({ _id: false })
class SubtaskSubSchema implements Subtask {
  @Prop({ required: true }) title!: string;
  @Prop({ default: false }) done!: boolean;
}

const SubtaskSchemaDef = SchemaFactory.createForClass(SubtaskSubSchema);

@Schema({ timestamps: true, collection: 'tasks' })
export class Task {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cycle', required: true, index: true })
  cycleId!: Types.ObjectId;

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

  @Prop({ required: true })
  title!: string;

  @Prop()
  description?: string;

  @Prop({ default: 0 })
  estimatedHours!: number;

  @Prop({ default: 0 })
  actualHours!: number;

  @Prop({
    required: true,
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'blocked'],
    default: 'pending',
  })
  status!: TaskStatus;

  @Prop({
    required: true,
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  })
  priority!: 'high' | 'medium' | 'low';

  @Prop()
  completedAt?: Date;

  @Prop()
  notes?: string;

  @Prop({ type: [TaskAttachmentSubSchema], default: [] })
  attachments?: TaskAttachment[];

  @Prop({ type: [SubtaskSchemaDef], default: [] })
  subtasks?: Subtask[];
}

export const TaskSchema = SchemaFactory.createForClass(Task);
TaskSchema.index({ clientId: 1, cycleId: 1 });
