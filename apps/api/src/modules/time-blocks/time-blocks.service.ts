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
    options: { replace?: boolean; fromDate?: string; toDate?: string } = {},
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

    // 2. Determine planning window. By default we use the full cycle; the
    //    caller can pass a tighter range (e.g. when several days were already
    //    lost) and we will switch to a variable-session strategy to make the
    //    remaining hours fit.
    const cycleStartIso = formatDate(new Date(cycle.startDate));
    const cycleEndIso = formatDate(new Date(cycle.endDate));
    const windowStartIso = options.fromDate || cycleStartIso;
    const windowEndIso = options.toDate || cycleEndIso;
    if (windowStartIso > windowEndIso) {
      throw new BadRequestException('From date must be before To date.');
    }
    if (windowStartIso < cycleStartIso || windowEndIso > cycleEndIso) {
      throw new BadRequestException(
        'Planning window must stay inside the active cycle.',
      );
    }
    const compressed =
      windowStartIso !== cycleStartIso || windowEndIso !== cycleEndIso;

    const startDate = new Date(`${windowStartIso}T00:00:00Z`);
    const endDate = new Date(`${windowEndIso}T00:00:00Z`);
    const daysOff = new Set(wh.daysOff || []);
    const workDays = new Set(wh.workDays || []);
    const workingDays: string[] = [];
    for (let d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      const iso = formatDate(d);
      if (!workDays.has(dow)) continue;
      if (daysOff.has(iso)) continue;
      workingDays.push(iso);
    }

    if (workingDays.length === 0) {
      throw new BadRequestException(
        'No working days in the selected range. Adjust dates or working hours.',
      );
    }

    // 3. Wipe ALL planned blocks for this user/cycle (regardless of the
    //    planning window) when replace is requested. In-progress and
    //    completed blocks are always kept since the user already started
    //    working on them.
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

    // 4. Pre-compute per-day used minutes from existing blocks inside the
    //    window (so we don't double-book or overlap kept blocks).
    const used = new Map<string, { byDay: number; byClient: Map<string, number> }>();
    const existing = await this.model
      .find({
        userId: userObjId,
        cycleId: cycleObjId,
        date: { $gte: windowStartIso, $lte: windowEndIso },
      })
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

    // 5b. When the user has compressed the window, fall back to the
    //     variable-session strategy so we can pack the same amount of work
    //     into fewer days. The default (full cycle) keeps using the cleaner
    //     equal-slots layout below.
    if (compressed) {
      return this.autoPlanVariable({
        wh,
        userObjId,
        cycleObjId,
        workingDays,
        existing,
        used,
        dailyCapMinutes,
        clients,
        warnings,
        removed,
        windowStartIso,
        windowEndIso,
      });
    }

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

    // 6b. Reserve a single noon slot on the last working day of the cycle
    //     for "send client reports". The block is pulled out of the
    //     allocation pool before clients compete for slots, so it always
    //     lands on the calendar regardless of demand. We pick the first
    //     slot whose startTime is at or after 12:00 on that day.
    let reportingSlot: Slot | null = null;
    if (workingDays.length > 0) {
      const lastDay = workingDays[workingDays.length - 1];
      const idx = allSlots.findIndex(
        (s) => s.date === lastDay && s.startTime >= '12:00',
      );
      if (idx >= 0) {
        reportingSlot = allSlots.splice(idx, 1)[0];
      } else {
        // No afternoon slot on the last day — fall back to the last slot
        // of the day so we still book *something* on cycle close.
        const lastDayIdx = allSlots
          .map((s, i) => ({ s, i }))
          .filter((x) => x.s.date === lastDay)
          .pop();
        if (lastDayIdx) {
          reportingSlot = allSlots.splice(lastDayIdx.i, 1)[0];
        }
      }
    }

    const totalMinutesAvailable = allSlots.reduce((acc, s) => acc + s.durationMinutes, 0);

    // 7a. Carry over unfinished work from the previous cycle. Any task
    //     that was still pending / in-progress when the previous cycle
    //     closed gets re-tagged with the current cycle id so the planner
    //     (and the rest of the app) sees it as live work in the new
    //     cycle. Without this, an entire cycle's worth of unfinished
    //     tasks would be invisible the moment a new cycle starts.
    let carriedOver = 0;
    const prevCycle = await this.cycleModel
      .findOne({ endDate: { $lt: cycle.startDate } })
      .sort({ endDate: -1 })
      .lean()
      .exec();
    if (prevCycle) {
      const res = await this.taskModel
        .updateMany(
          {
            cycleId: prevCycle._id,
            clientId: { $in: clients.map((c) => c._id) },
            status: { $in: ['pending', 'in_progress'] },
          },
          { $set: { cycleId: cycleObjId } },
        )
        .exec();
      carriedOver = res.modifiedCount || 0;
    }

    // 7b. Pre-fetch open tasks once so we can incorporate pending count +
    //     priority into the allocation. Tier still gates the broad
    //     ordering (A > B > C) but within a tier, clients with more
    //     pending high-priority work get scheduled first. Clients with
    //     zero open tasks still get their tier allocation so the user
    //     can use those slots to plan the cycle's task list.
    const openTasks = await this.taskModel
      .find({
        cycleId: cycleObjId,
        clientId: { $in: clients.map((c) => c._id) },
        status: { $in: ['pending', 'in_progress'] },
      })
      .lean()
      .exec();
    const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const demandByClient = new Map<
      string,
      { count: number; score: number; remainingHours: number }
    >();
    for (const t of openTasks) {
      const cid = String(t.clientId);
      const entry =
        demandByClient.get(cid) || { count: 0, score: 0, remainingHours: 0 };
      entry.count++;
      entry.score += PRIORITY_WEIGHT[t.priority as string] ?? 1;
      const est = t.estimatedHours || 0;
      const act = t.actualHours || 0;
      const remaining = Math.max(0, est - act);
      // Fall back to the estimate when the task hasn't been worked yet, and
      // to 1h when nothing was estimated so the demand isn't zero.
      entry.remainingHours += remaining > 0 ? remaining : est || 1;
      demandByClient.set(cid, entry);
    }

    type ClientPlan = {
      clientId: string;
      name: string;
      tier: ClientTier;
      targetMinutes: number;
      slotsNeeded: number;
      slotsAssigned: number;
      lastDate: string | null;
      pendingCount: number;
      pendingScore: number;
      remainingHours: number;
    };
    const perClient = new Map<string, {
      name: string;
      tier: ClientTier;
      targetMinutes: number;
      scheduledMinutes: number;
      sessions: number;
      pendingCount: number;
      pendingScore: number;
    }>();
    const plansByTier: Record<ClientTier, ClientPlan[]> = { A: [], B: [], C: [] };
    const avgSlotMin =
      allSlots.length > 0 ? totalMinutesAvailable / allSlots.length : 120;
    for (const c of clients) {
      const tier = c.tier as ClientTier;
      const targetMinutes = Math.round((c.hoursPerCycle ?? HOURS_PER_TIER[tier]) * 60);
      const demand = demandByClient.get(String(c._id)) || {
        count: 0,
        score: 0,
        remainingHours: 0,
      };
      perClient.set(String(c._id), {
        name: c.name,
        tier,
        targetMinutes,
        scheduledMinutes: 0,
        sessions: 0,
        pendingCount: demand.count,
        pendingScore: demand.score,
      });
      // Every active client gets its tier allocation — even one with no
      // open tasks. The user reserves part of that slot to plan the
      // cycle's task list, so an empty queue isn't a reason to skip the
      // client. When tasks DO exist, the demand-based cap below keeps
      // us from over-allocating to a client whose pending work fits in
      // fewer hours than the tier target.
      const targetSlots = Math.max(1, Math.round(targetMinutes / avgSlotMin));
      const demandSlots =
        demand.count > 0
          ? Math.max(1, Math.ceil((demand.remainingHours * 60) / avgSlotMin))
          : targetSlots;
      const slotsNeeded = Math.min(targetSlots, demandSlots);
      plansByTier[tier].push({
        clientId: String(c._id),
        name: c.name,
        tier,
        targetMinutes,
        slotsNeeded,
        slotsAssigned: 0,
        lastDate: null,
        pendingCount: demand.count,
        pendingScore: demand.score,
        remainingHours: demand.remainingHours,
      });
    }
    if (carriedOver > 0) {
      warnings.push(
        `Carried over ${carriedOver} pending task(s) from the previous cycle (${prevCycle?.label ?? 'previous'}) into ${cycle.label}.`,
      );
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
      clientId?: Types.ObjectId;
      cycleId: Types.ObjectId;
      userId: Types.ObjectId;
      status: TimeBlockStatus;
      kind: 'client' | 'reporting';
    }> = [];

    const pickForSlot = (slot: Slot): ClientPlan | null => {
      for (const tier of ['A', 'B', 'C'] as ClientTier[]) {
        const tierPlans = plansByTier[tier];
        const needing = tierPlans.filter((p) => p.slotsAssigned < p.slotsNeeded);
        if (needing.length === 0) continue;
        const notToday = needing.filter((p) => p.lastDate !== slot.date);
        const pool = notToday.length > 0 ? notToday : needing;
        pool.sort((a, b) => {
          // 1. Anyone who hasn't been touched yet jumps first so rotation
          //    fairness still holds across the cycle.
          if (!a.lastDate && b.lastDate) return -1;
          if (a.lastDate && !b.lastDate) return 1;
          // 2. Within "already touched", prefer the client whose last
          //    block is the oldest (also fairness).
          const aD = a.lastDate || '';
          const bD = b.lastDate || '';
          if (aD !== bD) return aD.localeCompare(bD);
          // 3. Among ties on lastDate, prefer the client with more pending
          //    high-priority work — pendingScore weights high=3 medium=2
          //    low=1, so a client with 4 high-priority pending tasks beats
          //    one with 2 medium ones.
          if (a.pendingScore !== b.pendingScore) {
            return b.pendingScore - a.pendingScore;
          }
          // 4. Then the client with more pending tasks overall.
          if (a.pendingCount !== b.pendingCount) {
            return b.pendingCount - a.pendingCount;
          }
          // 5. Whoever has fewer slots assigned so far.
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
        kind: 'client',
      });
      picked.slotsAssigned++;
      picked.lastDate = slot.date;
      const stat = perClient.get(picked.clientId);
      if (stat) {
        stat.scheduledMinutes += slot.durationMinutes;
        stat.sessions += 1;
      }
    }

    // 8b. Append the reserved reporting block (no clientId) so it lands on
    //     the calendar at cycle close.
    if (reportingSlot) {
      newBlocks.push({
        date: reportingSlot.date,
        startTime: reportingSlot.startTime,
        endTime: reportingSlot.endTime,
        durationMinutes: reportingSlot.durationMinutes,
        cycleId: cycleObjId,
        userId: userObjId,
        status: 'planned',
        kind: 'reporting',
      });
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

    // 9. Pick a task for each block (highest-priority pending task for that client/cycle).
    //    Reuses the openTasks fetched at step 7 so we don't query Mongo twice.
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const tasksByClient = new Map<string, Array<{ _id: Types.ObjectId; remainingHours: number; priority: string }>>();
    for (const t of openTasks) {
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
      if (b.kind === 'reporting' || !b.clientId) continue;
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

  // --- Compressed-window strategy (variable-size sessions) -----------------
  // Used when the caller passes a fromDate/toDate that shrinks the planning
  // window. We give up the "equal slots" promise so we can fit more work in
  // fewer days, similar to the original strategy.

  private async autoPlanVariable(ctx: {
    wh: { timeBlocks: { start: string; end: string }[]; dailyCapHours: number };
    userObjId: Types.ObjectId;
    cycleObjId: Types.ObjectId;
    workingDays: string[];
    existing: Array<{ date: string; startTime: string; endTime: string; durationMinutes: number; clientId?: Types.ObjectId | string }>;
    used: Map<string, { byDay: number; byClient: Map<string, number> }>;
    dailyCapMinutes: number;
    clients: Array<{ _id: Types.ObjectId | string; name: string; tier: ClientTier; hoursPerCycle?: number }>;
    warnings: string[];
    removed: number;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<AutoPlanSummary> {
    const TIER_BLOCK_MINUTES: Record<ClientTier, number> = {
      A: 120,
      B: 90,
      C: 75,
    };
    const TIER_ORDER: Record<ClientTier, number> = { A: 0, B: 1, C: 2 };

    const timeBlocksMinutes = ctx.wh.timeBlocks.reduce(
      (acc, tb) => acc + Math.max(0, minutesBetween(tb.start, tb.end)),
      0,
    );
    const dailyAvailable = Math.min(ctx.dailyCapMinutes, timeBlocksMinutes);
    const totalMinutesAvailable = dailyAvailable * ctx.workingDays.length;

    // Build sessions per client
    type Session = { clientId: string; tier: ClientTier; minutes: number };
    const sessions: Session[] = [];
    const perClient = new Map<
      string,
      {
        name: string;
        tier: ClientTier;
        targetMinutes: number;
        scheduledMinutes: number;
        sessions: number;
      }
    >();
    for (const c of ctx.clients) {
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
        removed: ctx.removed,
        totalMinutesScheduled: 0,
        totalMinutesAvailable,
        perClient: [],
        warnings: ['No active clients to schedule.'],
      };
    }

    // Sort by tier A→B→C, interleave clients within tier
    sessions.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    const interleaved: Session[] = [];
    const tierBuckets: Record<ClientTier, Session[]> = { A: [], B: [], C: [] };
    for (const s of sessions) tierBuckets[s.tier].push(s);
    for (const tier of ['A', 'B', 'C'] as ClientTier[]) {
      const byClient = new Map<string, Session[]>();
      for (const s of tierBuckets[tier]) {
        const arr = byClient.get(s.clientId) || [];
        arr.push(s);
        byClient.set(s.clientId, arr);
      }
      const queues = Array.from(byClient.values());
      let i = 0;
      while (queues.some((q) => q.length > 0)) {
        const next = queues[i % queues.length].shift();
        if (next) interleaved.push(next);
        i++;
      }
    }

    // Build per-day cursors that start at the first time block (or past any
    // existing block on that day).
    const cursors = new Map<string, { tbIdx: number; cursor: string }>();
    for (const day of ctx.workingDays) {
      cursors.set(day, { tbIdx: 0, cursor: ctx.wh.timeBlocks[0]?.start ?? '09:00' });
    }
    for (const b of ctx.existing) {
      const cur = cursors.get(b.date);
      if (!cur) continue;
      if (b.endTime > cur.cursor) cur.cursor = b.endTime;
    }

    const newBlocks: Array<{
      date: string;
      startTime: string;
      endTime: string;
      durationMinutes: number;
      clientId: Types.ObjectId;
      cycleId: Types.ObjectId;
      userId: Types.ObjectId;
      status: TimeBlockStatus;
      taskId?: Types.ObjectId;
    }> = [];
    let dayCursor = 0;
    let unplaced = 0;

    const placeSession = (s: Session): boolean => {
      for (let attempt = 0; attempt < ctx.workingDays.length; attempt++) {
        const day = ctx.workingDays[(dayCursor + attempt) % ctx.workingDays.length];
        const dayUsed = ctx.used.get(day) || { byDay: 0, byClient: new Map<string, number>() };
        if (dayUsed.byDay + s.minutes > dailyAvailable) continue;
        // Soft limit: don't pile up the same client too much in one day
        if ((dayUsed.byClient.get(s.clientId) || 0) >= s.minutes * 2) continue;
        const cur = cursors.get(day)!;
        for (let bi = cur.tbIdx; bi < ctx.wh.timeBlocks.length; bi++) {
          const tb = ctx.wh.timeBlocks[bi];
          const start = cur.cursor < tb.start ? tb.start : cur.cursor;
          if (minutesBetween(start, tb.end) >= s.minutes) {
            const end = addMinutes(start, s.minutes);
            newBlocks.push({
              date: day,
              startTime: start,
              endTime: end,
              durationMinutes: s.minutes,
              clientId: new Types.ObjectId(s.clientId),
              cycleId: ctx.cycleObjId,
              userId: ctx.userObjId,
              status: 'planned',
            });
            dayUsed.byDay += s.minutes;
            dayUsed.byClient.set(
              s.clientId,
              (dayUsed.byClient.get(s.clientId) || 0) + s.minutes,
            );
            ctx.used.set(day, dayUsed);
            cur.cursor = end;
            cur.tbIdx = bi;
            return true;
          }
          cur.tbIdx = bi + 1;
          cur.cursor = ctx.wh.timeBlocks[bi + 1]?.start ?? tb.end;
        }
      }
      return false;
    };

    for (const s of interleaved) {
      const ok = placeSession(s);
      if (!ok) {
        unplaced++;
        continue;
      }
      const stat = perClient.get(s.clientId);
      if (stat) {
        stat.scheduledMinutes += s.minutes;
        stat.sessions += 1;
      }
      dayCursor = (dayCursor + 1) % ctx.workingDays.length;
    }

    if (unplaced > 0) {
      ctx.warnings.push(
        `${unplaced} session(s) could not fit in the compressed window (${ctx.windowStartIso} → ${ctx.windowEndIso}). Consider widening the range or reducing client hours.`,
      );
    }

    // Attach the highest-priority pending task per client
    const tasks = await this.taskModel
      .find({
        cycleId: ctx.cycleObjId,
        clientId: { $in: ctx.clients.map((c) => c._id) },
        status: { $in: ['pending', 'in_progress'] },
      })
      .lean()
      .exec();
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const tasksByClient = new Map<
      string,
      Array<{ _id: Types.ObjectId; remainingHours: number; priority: string }>
    >();
    for (const t of tasks) {
      const cid = String(t.clientId);
      const arr = tasksByClient.get(cid) || [];
      const remaining = Math.max(0, (t.estimatedHours || 0) - (t.actualHours || 0));
      arr.push({
        _id: t._id as Types.ObjectId,
        remainingHours: remaining > 0 ? remaining : t.estimatedHours || 1,
        priority: t.priority,
      });
      tasksByClient.set(cid, arr);
    }
    for (const list of tasksByClient.values()) {
      list.sort(
        (a, b) => (priorityRank[a.priority] ?? 5) - (priorityRank[b.priority] ?? 5),
      );
    }
    for (const b of newBlocks) {
      const queue = tasksByClient.get(String(b.clientId));
      if (!queue || queue.length === 0) continue;
      const task = queue[0];
      b.taskId = task._id;
      task.remainingHours -= b.durationMinutes / 60;
      if (task.remainingHours <= 0) queue.shift();
    }

    let created = 0;
    if (newBlocks.length > 0) {
      const docs = await this.model.insertMany(newBlocks);
      created = docs.length;
    }
    const totalMinutesScheduled = newBlocks.reduce(
      (acc, b) => acc + b.durationMinutes,
      0,
    );
    return {
      created,
      removed: ctx.removed,
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
      warnings: ctx.warnings,
    };
  }
}
