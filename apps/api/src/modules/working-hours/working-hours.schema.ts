import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  WorkingHoursConfig,
  WorkingHoursTimeRange,
} from '@seo/shared';

export type WorkingHoursDocument = HydratedDocument<WorkingHours>;

@Schema({ _id: false })
class TimeRangeSubSchema implements WorkingHoursTimeRange {
  @Prop({ required: true }) start!: string;
  @Prop({ required: true }) end!: string;
}

const TimeRangeSchemaDef = SchemaFactory.createForClass(TimeRangeSubSchema);

@Schema({ timestamps: true, collection: 'working-hours' })
export class WorkingHours
  implements Omit<WorkingHoursConfig, '_id' | 'userId' | 'createdAt' | 'updatedAt'>
{
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] })
  workDays!: number[];

  @Prop({ type: [TimeRangeSchemaDef], default: [] })
  timeBlocks!: WorkingHoursTimeRange[];

  @Prop({ default: 8 })
  dailyCapHours!: number;

  @Prop({ default: 'America/Puerto_Rico' })
  timezone?: string;

  @Prop({ type: [String], default: [] })
  daysOff!: string[];
}

export const WorkingHoursSchema = SchemaFactory.createForClass(WorkingHours);
