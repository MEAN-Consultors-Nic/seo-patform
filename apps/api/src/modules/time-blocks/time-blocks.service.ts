import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AutoPlanSummary,
  ClientTier,
  HOURS_PER_TIER,
  TimeBlockStatus,
} from '@seo/shared';
import { TimeBlock, TimeBlockDocument } from './time-block.schema';
import { Client, ClientDocument } from '../clients/client.schema';
import { Cycle, CycleDocument } from '../cycles/cycle.schema';
import { Task, TaskDocument } from '../tasks/task.schema';
import { WorkingHoursService } from '../working-hours/working-hours.service';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';

const TIER_ORDER: Record<ClientTier, number> = { A: 0, B: 1, C: 2 };
const TIER_BLOCK_MINUTES: Record<ClientTier, number> = { A: 120, B: 90, C: 75 };

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class TimeBlocksService {
  constructor(
    @InjectModel(TimeBlock.name)
    private readonly model: Model<TimeBlockDocument>,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Cycle.name) private readonly cycleModel: Model<CycleDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    private readonly workingHoursSvc: WorkingHoursService,
    private readonly clientsSvc: ClientsService,
  ) {}

  // --- CRUD ----------------------------------------------------------------

  async listForUser(
    userId: string,
    filters: { cycleId?: string; date?: string; from?: string; to?: string } = {},
  ) {
    const q: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (filters.cycleId) q.cycleId = new Types.ObjectId(filters.cycleId);
    if (filters.date) q.date = filters.date;
    if (filters.from || filters.to) {
      const range: Record<string, string> = {};
      if (filters.from) range.$gte = filters.from;
      if (filters.to) range.$lte = filters.to;
      q.date = range;
    }
    return this.model
      .find(q)
      .populate('clientId', 'name tier logoUrl')
      .populate('taskId', 'title category status')
      .sort({ date: 1, startTime: 1 })
      .lean()
      .exec();
  }

  async create(
    userId: string,
    dto: {
      cycleId: string;
      date: string;
      startTime: string;
      endTime: string;
      clientId: string;
      taskId?: string;
      notes?: string;
    },
  ) {
    const duration = minutesBetween(dto.startTime, dto.endTime);
    if (duration <= 0)
      throw new BadRequestException('End time must be after start time');
    await this.clientsSvc.assertAccess(dto.clientId, {
      userId,
      email: '',
      role: 'seo-strategist',
    } as AuthenticatedUser);
    const doc = await this.model.create({
      userId: new Types.ObjectId(userId),
      cycleId: new Types.ObjectId(dto.cycleId),
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      durationMinutes: duration,
      clientId: new Types.ObjectId(dto.clientId),
      taskId: dto.taskId ? new Types.ObjectId(dto.taskId) : undefined,
      notes: dto.notes,
      status: 'planned',
    });
    return doc.populate([
      { path: 'clientId', select: 'name tier logoUrl' },
      { path: 'taskId', select: 'title category status' },
    ]);
  }

  async update(
    id: string,
    userId: string,
    dto: Partial<{
      date: string;
      startTime: string;
      endTime: string;
      clientId: string;
      taskId: string | null;
      status: TimeBlockStatus;
      notes: string;
      actualMinutes: number;
    }>,
  ) {
    const block = await this.model.findById(id).exec();
    if (!block) throw new NotFoundException('Block not found');
    if (block.userId.toString() !== userId)
      throw new BadRequestException('Not your block');

    if (dto.date) block.date = dto.date;
    if (dto.startTime) block.startTime = dto.startTime;
    if (dto.endTime) block.endTime = dto.endTime;
    if (dto.startTime || dto.endTime) {
      block.durationMinutes = minutesBetween(block.startTime, block.endTime);
      if (block.durationMinutes <= 0)
        throw new BadRequestException('End time must be after start time');
    }
    if (dto.clientId) block.clientId = new Types.ObjectId(dto.clientId);
    if (dto.taskId === null) block.taskId = undefined;
    else if (dto.taskId) block.taskId = new Types.ObjectId(dto.taskId);
    if (dto.status) block.status = dto.status;
    if (dto.notes !== undefined) block.notes = dto.notes;
    if (typeof dto.actualMinutes === 'number') block.actualMinutes = dto.actualMinutes;

    await block.save();
    return block.populate([
      { path: 'clientId', select: 'name tier logoUrl' },
      { path: 'taskId', select: 'title category status' },
    ]);
  }

  async remove(id: string, userId: string) {
    const block = await this.model.findById(id).exec();
    if (!block) throw new NotFoundException('Block not found');
    if (block.userId.toString() !== userId)
      throw new BadRequestException('Not your block');
    await block.deleteOne();
    return { deleted: true };
  }

  async start(id: string, userId: string) {
    return this.update(id, userId, { status: 'in_progress' }).then(async (b) => {
      const doc = await this.model.findByIdAndUpdate(
        id,
        { $set: { startedAt: new Date() } },
        { new: true },
      ).populate([
        { path: 'clientId', select: 'name tier logoUrl' },
        { path: 'taskId', select: 'title category status' },
      ]).exec();
      return doc || b;
    });
  }

  async complete(
    id: string,
    userId: string,
    actualMinutes?: number,
  ) {
    const block = await this.model.findById(id).exec();
    if (!block) throw new NotFoundException('Block not found');
    if (block.userId.toString() !== userId)
      throw new BadRequestException('Not your block');

    const minutes =
      typeof actualMinutes === 'number'
        ? actualMinutes
        : block.actualMinutes ?? block.durationMinutes;

    block.status = 'completed';
    block.completedAt = new Date();
    block.actualMinutes = minutes;
    await block.save();

    // Roll the hours into the linked task (if any)
    if (block.taskId) {
      const task = await this.taskModel.findById(block.taskId).exec();
      if (task) {
        const addedHours = minutes / 60;
        task.actualHours = (task.actualHours || 0) + addedHours;
        await task.save();
      }
    }

    return block.populate([
      { path: 'clientId', select: 'name tier logoUrl' },
      { path: 'taskId', select: 'title category status' },
    ]);
  }

  async skip(id: string, userId: string) {
    return this.update(id, userId, { status: 'skipped' });
  }

  // --- Auto-plan -----------------------------------------------------------

  async autoPlan(
    userId: string,
    cycleId: string,
    options: { replace?: boolean } = {},
  ): Promise<AutoPlanSummary> {
    const cycle = await this.cycleModel.findById(cycleId).lean().exec();
    if (!cycle) throw new NotFoundException('Cycle not found');

    const wh = await this.workingHoursSvc.findOrCreate(userId);
    const userObjId = new Types.ObjectId(userId);
    const cycleObjId = new Types.ObjectId(cycleId);

    // 1. Resolve which clients are accessible to this user
    const accessibleIds = await this.clientsSvc.listAccessibleIds({
      userId,
      email: '',
      role: 'seo-strategist',
    } as AuthenticatedUser);
    const clientQuery: Record<string, unknown> = { active: true };
    if (accessibleIds !== null) clientQuery._id = { $in: accessibleIds };
    const clients = await this.clientModel
      .find(clientQuery)
      .sort({ tier: 1, name: 1 })
      .lean()
      .exec();

    // 2. Build working days inside the cycle window
    const start = new Date(cycle.startDate);
    const end = new Date(cycle.endDate);
    const daysOff = new Set(wh.daysOff || []);
    const workDays = new Set(wh.workDays || []);
    const workingDays: string[] = [];
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      const iso = formatDate(d);
      if (!workDays.has(dow)) continue;
      if (daysOff.has(iso)) continue;
      workingDays.push(iso);
    }

    if (workingDays.length === 0) {
      throw new BadRequestException(
        'No working days in this cycle. Adjust your working hours settings.',
      );
    }

    // 3. Wipe planned blocks for this user/cycle if asked to replace
    const warnings: string[] = [];
    let removed = 0;
    if (options.replace) {
      const res = await this.model
        .deleteMany({
          userId: userObjId,
          cycleId: cycleObjId,
          status: 'planned',
        })
        .exec();
      removed = res.deletedCount || 0;
    }

    // 4. Pre-compute per-day used minutes from existing blocks (so we don't double-book)
    const used = new Map<string, { byDay: number; byClient: Map<string, number> }>();
    const existing = await this.model
      .find({ userId: userObjId, cycleId: cycleObjId })
      .lean()
      .exec();
    for (const b of existing) {
      const day = used.get(b.date) || { byDay: 0, byClient: new Map() };
      day.byDay += b.durationMinutes;
      const cId = String(b.clientId);
      day.byClient.set(cId, (day.byClient.get(cId) || 0) + b.durationMinutes);
      used.set(b.date, day);
    }

    // 5. Build daily capacity (total minutes available per day after subtracting used)
    const dailyCapMinutes = wh.dailyCapHours * 60;
    const timeBlocksMinutes = (wh.timeBlocks || []).reduce(
      (acc, tb) => acc + Math.max(0, minutesBetween(tb.start, tb.end)),
      0,
    );
    const dailyAvailable = Math.min(dailyCapMinutes, timeBlocksMinutes);

    // 6. Build "sessions" per client based on tier
    type Session = {
      clientId: string;
      tier: ClientTier;
      minutes: number;
    };
    const sessions: Session[] = [];
    const perClient = new Map<string, { name: string; tier: ClientTier; targetMinutes: number; scheduledMinutes: number; sessions: number }>();
    for (const c of clients) {
      const tier = c.tier as ClientTier;
      const targetMinutes = Math.round((c.hoursPerCycle ?? HOURS_PER_TIER[tier]) * 60);
      perClient.set(String(c._id), {
        name: c.name,
        tier,
        targetMinutes,
        scheduledMinutes: 0,
        sessions: 0,
      });
      const blockSize = TIER_BLOCK_MINUTES[tier];
      let remaining = targetMinutes;
      while (remaining > 0) {
        const minutes = Math.min(remaining, blockSize);
        sessions.push({ clientId: String(c._id), tier, minutes });
        remaining -= minutes;
      }
    }

    if (sessions.length === 0) {
      return {
        created: 0,
        removed,
        totalMinutesScheduled: 0,
        totalMinutesAvailable: dailyAvailable * workingDays.length,
        perClient: [],
        warnings: ['No active clients to schedule for this user.'],
      };
    }

    // 7. Sort sessions: Tier A first, then B, C. Within tier, interleave clients
    //    so we don't fill one client back-to-back.
    sessions.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    const interleaved: Session[] = [];
    const tierBuckets: Record<ClientTier, Session[]> = { A: [], B: [], C: [] };
    for (const s of sessions) tierBuckets[s.tier].push(s);
    for (const tier of ['A', 'B', 'C'] as ClientTier[]) {
      const bucket = tierBuckets[tier];
      const byClient = new Map<string, Session[]>();
      for (const s of bucket) {
        const arr = byClient.get(s.clientId) || [];
        arr.push(s);
        byClient.set(s.clientId, arr);
      }
      const queues = Array.from(byClient.values());
      let i = 0;
      while (queues.some((q) => q.length > 0)) {
        const q = queues[i % queues.length];
        const next = q.shift();
        if (next) interleaved.push(next);
        i++;
      }
    }

    // 8. Assign sessions to working days round-robin, keeping daily cap and
    //    avoiding more than 2 sessions of the same client on the same day.
    const newBlocks: Array<{
      date: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      clientId: Types.ObjectId;
      cycleId: Types.ObjectId;
      userId: Types.ObjectId;
      status: TimeBlockStatus;
    }> = [];

    // Build cursors for each day's next available start time
    const cursors = new Map<string, { tbIdx: number; cursor: string }>();
    for (const day of workingDays) {
      cursors.set(day, { tbIdx: 0, cursor: wh.timeBlocks[0]?.start ?? '09:00' });
    }

    // Honor pre-existing blocks: bump cursor past them
    for (const b of existing) {
      const cur = cursors.get(b.date);
      if (!cur) continue;
      if (b.endTime > cur.cursor) cur.cursor = b.endTime;
    }

    const placeSession = (s: Session): boolean => {
      // Try each working day in order until we find one that fits
      for (let attempt = 0; attempt < workingDays.length; attempt++) {
        const day = workingDays[(dayCursor + attempt) % workingDays.length];
        const day_used = used.get(day) || { byDay: 0, byClient: new Map<string, number>() };
        if (day_used.byDay + s.minutes > dailyAvailable) continue;
        if ((day_used.byClient.get(s.clientId) || 0) >= s.minutes * 2) continue;
        const cur = cursors.get(day)!;
        // Walk through timeBlocks until we find a slot
        for (let bi = cur.tbIdx; bi < wh.timeBlocks.length; bi++) {
          const tb = wh.timeBlocks[bi];
          const start = cur.cursor < tb.start ? tb.start : cur.cursor;
          if (minutesBetween(start, tb.end) >= s.minutes) {
            const end = addMinutes(start, s.minutes);
            newBlocks.push({
              date: day,
              startTime: start,
              endTime: end,
              durationMinutes: s.minutes,
              clientId: new Types.ObjectId(s.clientId),
              cycleId: cycleObjId,
              userId: userObjId,
              status: 'planned',
            });
            day_used.byDay += s.minutes;
            day_used.byClient.set(
              s.clientId,
              (day_used.byClient.get(s.clientId) || 0) + s.minutes,
            );
            used.set(day, day_used);
            cur.cursor = end;
            cur.tbIdx = bi;
            return true;
          }
          // No room in this sub-block, move to the next one
          cur.tbIdx = bi + 1;
          cur.cursor = wh.timeBlocks[bi + 1]?.start ?? tb.end;
        }
      }
      return false;
    };

    let dayCursor = 0;
    let unplaced = 0;
    for (const s of interleaved) {
      const ok = placeSession(s);
      if (!ok) {
        unplaced++;
      } else {
        const stat = perClient.get(s.clientId);
        if (stat) {
          stat.scheduledMinutes += s.minutes;
          stat.sessions += 1;
        }
        dayCursor = (dayCursor + 1) % workingDays.length;
      }
    }

    if (unplaced > 0) {
      warnings.push(
        `${unplaced} session(s) could not be placed — your weekly capacity is below the assigned hours. Consider reducing client hours, adding capacity, or splitting the cycle.`,
      );
    }

    // 9. Pick a task for each block (highest-priority pending task for that client/cycle)
    const tasks = await this.taskModel
      .find({
        cycleId: cycleObjId,
        clientId: { $in: clients.map((c) => c._id) },
        status: { $in: ['pending', 'in_progress'] },
      })
      .lean()
      .exec();
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const tasksByClient = new Map<string, Array<{ _id: Types.ObjectId; remainingHours: number; priority: string }>>();
    for (const t of tasks) {
      const cid = String(t.clientId);
      const arr = tasksByClient.get(cid) || [];
      const remainingHours = Math.max(0, (t.estimatedHours || 0) - (t.actualHours || 0));
      arr.push({
        _id: t._id as Types.ObjectId,
        remainingHours: remainingHours > 0 ? remainingHours : t.estimatedHours || 1,
        priority: t.priority,
      });
      tasksByClient.set(cid, arr);
    }
    for (const list of tasksByClient.values()) {
      list.sort((a, b) => (priorityRank[a.priority] ?? 5) - (priorityRank[b.priority] ?? 5));
    }
    for (const b of newBlocks) {
      const cid = String(b.clientId);
      const queue = tasksByClient.get(cid);
      if (!queue || queue.length === 0) continue;
      const task = queue[0];
      (b as typeof b & { taskId?: Types.ObjectId }).taskId = task._id;
      task.remainingHours -= b.durationMinutes / 60;
      if (task.remainingHours <= 0) queue.shift();
    }

    // 10. Persist
    let created = 0;
    if (newBlocks.length > 0) {
      const docs = await this.model.insertMany(newBlocks);
      created = docs.length;
    }

    const totalMinutesScheduled = newBlocks.reduce((acc, b) => acc + b.durationMinutes, 0);
    return {
      created,
      removed,
      totalMinutesScheduled,
      totalMinutesAvailable: dailyAvailable * workingDays.length,
      perClient: Array.from(perClient.entries()).map(([clientId, v]) => ({
        clientId,
        name: v.name,
        tier: v.tier,
        targetMinutes: v.targetMinutes,
        scheduledMinutes: v.scheduledMinutes,
        sessions: v.sessions,
      })),
      warnings,
    };
  }
}
