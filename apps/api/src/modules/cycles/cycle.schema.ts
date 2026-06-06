import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CycleStatus } from '@seo/shared';

export type CycleDocument = HydratedDocument<Cycle>;

@Schema({ timestamps: true, collection: 'cycles' })
export class Cycle {
  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ required: true })
  reportDueDate!: Date;

  @Prop({
    required: true,
    type: String,
    enum: ['upcoming', 'active', 'reporting', 'closed'],
    default: 'upcoming',
  })
  status!: CycleStatus;

  @Prop({ required: true, unique: true })
  label!: string;
}

export const CycleSchema = SchemaFactory.createForClass(Cycle);
CycleSchema.index({ startDate: 1, endDate: 1 });
