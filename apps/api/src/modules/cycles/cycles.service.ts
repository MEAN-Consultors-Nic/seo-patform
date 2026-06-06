import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import {
  addDays,
  endOfMonth,
  format,
  isWithinInterval,
  startOfDay,
  setDate,
} from 'date-fns';
import { Cycle, CycleDocument } from './cycle.schema';

@Injectable()
export class CyclesService implements OnModuleInit {
  private readonly logger = new Logger(CyclesService.name);

  constructor(
    @InjectModel(Cycle.name) private readonly model: Model<CycleDocument>,
  ) {}

  async onModuleInit() {
    await this.ensureCyclesAround(new Date());
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async dailyMaintenance() {
    const now = new Date();
    await this.ensureCyclesAround(now);
    await this.recomputeStatuses(now);
  }

  private buildCyclesForMonth(refDate: Date) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const firstHalfStart = new Date(year, month, 1);
    const firstHalfEnd = new Date(year, month, 15);
    const secondHalfStart = new Date(year, month, 16);
    const secondHalfEnd = endOfMonth(refDate);
    return [
      {
        startDate: firstHalfStart,
        endDate: firstHalfEnd,
        reportDueDate: firstHalfEnd,
        label: `${format(firstHalfStart, 'yyyy-MM')}-Q1`,
      },
      {
        startDate: secondHalfStart,
        endDate: secondHalfEnd,
        reportDueDate: secondHalfEnd,
        label: `${format(secondHalfStart, 'yyyy-MM')}-Q2`,
      },
    ];
  }

  async ensureCyclesAround(refDate: Date) {
    const monthsToCover = [
      refDate,
      addDays(endOfMonth(refDate), 1),
      addDays(endOfMonth(addDays(endOfMonth(refDate), 1)), 1),
    ];
    for (const ref of monthsToCover) {
      const cycles = this.buildCyclesForMonth(ref);
      for (const c of cycles) {
        await this.model
          .updateOne(
            { label: c.label },
            { $setOnInsert: { ...c, status: 'upcoming' } },
            { upsert: true },
          )
          .exec();
      }
    }
    await this.recomputeStatuses(refDate);
  }

  async recomputeStatuses(refDate: Date) {
    const today = startOfDay(refDate);
    const all = await this.model.find({}).exec();
    for (const cyc of all) {
      let newStatus = cyc.status;
      if (today > cyc.endDate) newStatus = 'closed';
      else if (
        isWithinInterval(today, { start: cyc.startDate, end: cyc.endDate })
      ) {
        const daysToEnd =
          (cyc.endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        newStatus = daysToEnd <= 1.5 ? 'reporting' : 'active';
      } else if (today < cyc.startDate) newStatus = 'upcoming';
      if (newStatus !== cyc.status) {
        cyc.status = newStatus;
        await cyc.save();
      }
    }
  }

  async findAll() {
    return this.model.find().sort({ startDate: 1 }).lean().exec();
  }

  async getCurrent() {
    const now = startOfDay(new Date());
    const cycle = await this.model
      .findOne({
        startDate: { $lte: now },
        endDate: { $gte: now },
      })
      .lean()
      .exec();
    if (!cycle)
      throw new NotFoundException('No active cycle found for today');
    return cycle;
  }

  async getNext() {
    const now = startOfDay(new Date());
    return this.model
      .findOne({ startDate: { $gt: now } })
      .sort({ startDate: 1 })
      .lean()
      .exec();
  }

  async findOne(id: string) {
    const cycle = await this.model.findById(id).lean().exec();
    if (!cycle) throw new NotFoundException(`Cycle ${id} not found`);
    return cycle;
  }
}
