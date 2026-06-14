import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TimeBlockStatus } from '@seo/shared';

export type TimeBlockDocument = HydratedDocument<TimeBlock>;

@Schema({ timestamps: true, collection: 'time-blocks' })
export class TimeBlock {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cycle', required: true, index: true })
  cycleId!: Types.ObjectId;

  @Prop({ required: true })
  date!: string; // YYYY-MM-DD

  @Prop({ required: true })
  startTime!: string; // HH:mm

  @Prop({ required: true })
  endTime!: string;

  @Prop({ required: true })
  durationMinutes!: number;

  // Required for client blocks (kind='client') — reporting blocks
  // (kind='reporting') aren't tied to a single client so this can be null.
  @Prop({ type: Types.ObjectId, ref: 'Client', index: true })
  clientId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Task' })
  taskId?: Types.ObjectId;

  /**
   * `client` (default) — a regular work block tied to a single client.
   * `reporting` — reserved cycle-end slot for sending reports; no clientId.
   */
  @Prop({
    type: String,
    enum: ['client', 'reporting'],
    default: 'client',
  })
  kind!: 'client' | 'reporting';

  @Prop({
    type: String,
    enum: ['planned', 'in_progress', 'completed', 'skipped'],
    default: 'planned',
  })
  status!: TimeBlockStatus;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop()
  actualMinutes?: number;

  @Prop()
  notes?: string;
}

export const TimeBlockSchema = SchemaFactory.createForClass(TimeBlock);
TimeBlockSchema.index({ userId: 1, date: 1, startTime: 1 });
TimeBlockSchema.index({ userId: 1, cycleId: 1 });
