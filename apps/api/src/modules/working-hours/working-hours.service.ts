import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DEFAULT_WORKING_HOURS, WorkingHoursConfig } from '@seo/shared';
import { WorkingHours, WorkingHoursDocument } from './working-hours.schema';

@Injectable()
export class WorkingHoursService {
  constructor(
    @InjectModel(WorkingHours.name)
    private readonly model: Model<WorkingHoursDocument>,
  ) {}

  async findOrCreate(userId: string): Promise<WorkingHoursDocument> {
    const objId = new Types.ObjectId(userId);
    let doc = await this.model.findOne({ userId: objId }).exec();
    if (!doc) {
      doc = await this.model.create({
        userId: objId,
        ...DEFAULT_WORKING_HOURS,
      });
    }
    return doc;
  }

  async update(
    userId: string,
    dto: Partial<Omit<WorkingHoursConfig, 'userId' | '_id'>>,
  ): Promise<WorkingHoursDocument> {
    const objId = new Types.ObjectId(userId);
    const update: Record<string, unknown> = {};
    if (dto.workDays) update.workDays = dto.workDays;
    if (dto.timeBlocks) update.timeBlocks = dto.timeBlocks;
    if (typeof dto.dailyCapHours === 'number') update.dailyCapHours = dto.dailyCapHours;
    if (dto.timezone) update.timezone = dto.timezone;
    if (dto.daysOff) update.daysOff = dto.daysOff;
    const doc = await this.model
      .findOneAndUpdate(
        { userId: objId },
        { $set: update, $setOnInsert: { ...DEFAULT_WORKING_HOURS, userId: objId } },
        { new: true, upsert: true },
      )
      .exec();
    return doc!;
  }
}
