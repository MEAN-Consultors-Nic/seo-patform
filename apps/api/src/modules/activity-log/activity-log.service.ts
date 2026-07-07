import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ActivityLog, ActivityLogDocument } from './activity-log.schema';

export interface LogEventInput {
  userId?: string;
  userEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectModel(ActivityLog.name)
    private readonly model: Model<ActivityLogDocument>,
  ) {}

  /**
   * Non-blocking write. Failures are logged and swallowed so we never
   * take down the main business logic just because the audit write
   * failed (e.g. Mongo blip during a login storm).
   */
  async log(input: LogEventInput): Promise<void> {
    try {
      await this.model.create({
        userId: input.userId ? new Types.ObjectId(input.userId) : undefined,
        userEmail: input.userEmail,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        details: input.details,
        ip: input.ip,
        userAgent: input.userAgent,
      });
    } catch (e) {
      this.logger.warn(
        `activity-log write failed for action=${input.action}: ${(e as Error).message}`,
      );
    }
  }

  async list(filters: {
    userId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}) {
    const q: Record<string, unknown> = {};
    if (filters.userId) q.userId = new Types.ObjectId(filters.userId);
    if (filters.action) q.action = filters.action;
    if (filters.targetType) q.targetType = filters.targetType;
    if (filters.targetId) q.targetId = filters.targetId;
    const timeRange: Record<string, Date> = {};
    if (filters.from) timeRange.$gte = new Date(filters.from);
    if (filters.to) timeRange.$lte = new Date(filters.to);
    if (Object.keys(timeRange).length) q.at = timeRange;
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    return this.model
      .find(q)
      .sort({ at: -1 })
      .limit(limit)
      .populate('userId', 'name email role')
      .lean()
      .exec();
  }
}
