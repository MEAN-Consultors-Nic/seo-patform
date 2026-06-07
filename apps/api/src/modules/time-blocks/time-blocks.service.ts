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

    // 5. Build daily capacity
    const dailyCapMinutes = wh.dailyCapHours * 60;

    // 6. Build all available slots in chronological order.
    //    Each time block in the working hours is split into SLOTS_PER_BLOCK
    //    equal sub-slots so the user gets predictable, similar-length sessions
    //    (e.g. 07:00–12:00 -> two 2.5h slots; 13:00–17:00 -> two 2h slots).
    //    The daily cap is honored by trimming/dropping the last slots if the
    //    total exceeds it.
    const SLOTS_PER_BLOCK = 2;
    type Slot = {
      date: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
    };
    const allSlots: Slot[] = [];
    for (const day of workingDays) {
      const daySlots: Slot[] = [];
      for (const tb of wh.timeBlocks) {
        const totalMin = minutesBetween(tb.start, tb.end);
        if (totalMin <= 0) continue;
        const slotMin = Math.floor(totalMin / SLOTS_PER_BLOCK);
        let cursor = tb.start;
        for (let i = 0; i < SLOTS_PER_BLOCK; i++) {
          const isLast = i === SLOTS_PER_BLOCK - 1;
          const endT = isLast ? tb.end : addMinutes(cursor, slotMin);
          const dur = minutesBetween(cursor, endT);
          if (dur > 0) {
            daySlots.push({
              date: day,
              startTime: cursor,
              endTime: endT,
              durationMinutes: dur,
            });
          }
          cursor = endT;
        }
      }
      // Enforce daily cap by trimming from the end
      let dayTotal = daySlots.reduce((acc, s) => acc + s.durationMinutes, 0);
      while (dayTotal > dailyCapMinutes && daySlots.length > 0) {
        const last = daySlots[daySlots.length - 1];
        const excess = dayTotal - dailyCapMinutes;
        if (last.durationMinutes > excess) {
          last.endTime = addMinutes(last.startTime, last.durationMinutes - excess);
          last.durationMinutes -= excess;
        } else {
          daySlots.pop();
        }
        dayTotal = daySlots.reduce((acc, s) => acc + s.durationMinutes, 0);
      }
      // Drop slots that overlap a pre-existing (kept) block
      const dayExisting = existing.filter((b) => b.date === day);
      const filtered = daySlots.filter(
        (s) =>
          !dayExisting.some(
            (b) => s.startTime < b.endTime && b.startTime < s.endTime,
          ),
      );
      allSlots.push(...filtered);
    }

    const totalMinutesAvailable = allSlots.reduce((acc, s) => acc + s.durationMinutes, 0);

    // 7. Compute per-client demand in slots based on tier and target hours.
    type ClientPlan = {
      clientId: string;
      name: string;
      tier: ClientTier;
      targetMinutes: number;
      slotsNeeded: number;
      slotsAssigned: number;
      lastDate: string | null;
    };
    const perClient = new Map<string, {
      name: string;
      tier: ClientTier;
      targetMinutes: number;
      scheduledMinutes: number;
      sessions: number;
    }>();
    const plansByTier: Record<ClientTier, ClientPlan[]> = { A: [], B: [], C: [] };
    const avgSlotMin =
      allSlots.length > 0 ? totalMinutesAvailable / allSlots.length : 120;
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
      plansByTier[tier].push({
        clientId: String(c._id),
        name: c.name,
        tier,
        targetMinutes,
        slotsNeeded: Math.max(1, Math.round(targetMinutes / avgSlotMin)),
        slotsAssigned: 0,
        lastDate: null,
      });
    }

    if (allSlots.length === 0) {
      return {
        created: 0,
        removed,
        totalMinutesScheduled: 0,
        totalMinutesAvailable,
        perClient: [],
        warnings: ['No available slots in this cycle. Adjust working hours.'],
      };
    }

    // 8. Walk slots chronologically. For each slot, pick the next client by
    //    tier priority (A > B > C) and within tier prefer the client whose
    //    last assignment is oldest, avoiding the same day if possible.
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

    const pickForSlot = (slot: Slot): ClientPlan | null => {
      for (const tier of ['A', 'B', 'C'] as ClientTier[]) {
        const tierPlans = plansByTier[tier];
        const needing = tierPlans.filter((p) => p.slotsAssigned < p.slotsNeeded);
        if (needing.length === 0) continue;
        const notToday = needing.filter((p) => p.lastDate !== slot.date);
        const pool = notToday.length > 0 ? notToday : needing;
        pool.sort((a, b) => {
          const aD = a.lastDate || '0000-00-00';
          const bD = b.lastDate || '0000-00-00';
          if (aD !== bD) return aD.localeCompare(bD);
          if (a.slotsAssigned !== b.slotsAssigned)
            return a.slotsAssigned - b.slotsAssigned;
          return a.name.localeCompare(b.name);
        });
        return pool[0];
      }
      return null;
    };

    for (const slot of allSlots) {
      const picked = pickForSlot(slot);
      if (!picked) break;
      newBlocks.push({
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        durationMinutes: slot.durationMinutes,
        clientId: new Types.ObjectId(picked.clientId),
        cycleId: cycleObjId,
        userId: userObjId,
        status: 'planned',
      });
      picked.slotsAssigned++;
      picked.lastDate = slot.date;
      const stat = perClient.get(picked.clientId);
      if (stat) {
        stat.scheduledMinutes += slot.durationMinutes;
        stat.sessions += 1;
      }
    }

    // Flag clients that ended up under/over the target by more than ~25%
    for (const stat of perClient.values()) {
      if (stat.targetMinutes === 0) continue;
      const ratio = stat.scheduledMinutes / stat.targetMinutes;
      if (ratio < 0.75) {
        warnings.push(
          `${stat.name} (Tier ${stat.tier}) only got ${(stat.scheduledMinutes / 60).toFixed(1)}h of ${(stat.targetMinutes / 60).toFixed(1)}h target — your weekly capacity may be tight.`,
        );
      }
    }
    if (newBlocks.length < allSlots.length) {
      const leftover = allSlots.length - newBlocks.length;
      const leftoverMin = allSlots
        .slice(newBlocks.length)
        .reduce((acc, s) => acc + s.durationMinutes, 0);
      warnings.push(
        `${leftover} slot(s) (${(leftoverMin / 60).toFixed(1)}h) left as buffer — no remaining client demand to fill them.`,
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
      totalMinutesAvailable,
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
