import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimeBlockStatus } from '@seo/shared';
import { TimeBlock, TimeBlockDocument } from './time-block.schema';
import { Client, ClientDocument } from '../clients/client.schema';
import { Cycle, CycleDocument } from '../cycles/cycle.schema';
import { Task, TaskDocument } from '../tasks/task.schema';
import { ClientsService } from '../clients/clients.service';
import { CalendarService } from '../google-integrations/calendar.service';
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
    private readonly clientsSvc: ClientsService,
    private readonly calendarSvc: CalendarService,
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
      role: 'strategist',
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

  // --- Pull from Google Calendar -----------------------------------------

  /**
   * Syncs the user's Google Calendar into TimeBlock records for the given
   * cycle. Each calendar event whose title contains the name of an active
   * client gets upserted as a TimeBlock; events without a matching client
   * are reported back as "unmatched" so the user can fix the titles and
   * re-pull. The sync is idempotent — re-pulling replaces planned blocks
   * that came from Google, but keeps blocks the user has already started
   * or completed so in-flight work isn't lost.
   *
   * Matching rules:
   *  - Case-insensitive substring against client.name
   *  - Longest match wins (so "American Storage PR" beats "American
   *    Storage" when both clients exist)
   *  - Whitespace-trimmed event title; reporting-cycle events still need
   *    explicit client names — there's no special slot reservation.
   */
  async pullFromCalendar(
    userId: string,
    cycleId: string,
  ): Promise<{
    created: number;
    removed: number;
    skippedKept: number;
    unmatched: Array<{ title: string; startsAt: string }>;
    totalEvents: number;
  }> {
    const cycle = await this.cycleModel.findById(cycleId).lean().exec();
    if (!cycle) throw new NotFoundException('Cycle not found');

    // Resolve which clients are visible to the user — same logic as the
    // old auto-plan so role-based filtering still applies.
    const accessibleIds = await this.clientsSvc.listAccessibleIds({
      userId,
      email: '',
      role: 'strategist',
    } as AuthenticatedUser);
    const clientQuery: Record<string, unknown> = { active: true };
    if (accessibleIds !== null) clientQuery._id = { $in: accessibleIds };
    const clients = await this.clientModel
      .find(clientQuery)
      .lean()
      .exec();
    // Build a flat index of (clientId, needle) pairs from each client's
    // primary name plus its configured calendarAliases. Sorted by needle
    // length DESC so the longest matching string wins — that's how
    // "American Storage PR" beats "American Storage" when both clients
    // exist, and how an alias like "MB Global Logistics" wins over a
    // shorter accidental substring match.
    const clientIndex = clients.flatMap((c) => {
      const names = [c.name, ...(c.calendarAliases ?? [])]
        .map((n) => (n || '').trim())
        .filter(Boolean);
      return names.map((n) => ({ id: c._id, needle: n.toLowerCase() }));
    });
    clientIndex.sort((a, b) => b.needle.length - a.needle.length);

    const userObjId = new Types.ObjectId(userId);
    const cycleObjId = new Types.ObjectId(cycleId);

    // Fetch events for the cycle window. Calendar API needs Date objects
    // so we build them from the cycle's start/end inclusive of the full
    // last day (end of day UTC).
    const from = new Date(cycle.startDate);
    const to = new Date(cycle.endDate);
    to.setUTCHours(23, 59, 59, 999);
    let events;
    try {
      events = await this.calendarSvc.listEvents(userId, from, to);
    } catch (err) {
      // Surface useful messages instead of a generic 500 — most failures
      // here are predictable: missing scope (user reconnected without
      // checking the Calendar checkbox), token revoked, or Google API
      // unavailability.
      const e = err as { code?: number; message?: string; response?: { data?: { error?: { message?: string } } } };
      const upstreamMsg =
        e.response?.data?.error?.message || e.message || 'Unknown error';
      if (
        upstreamMsg.toLowerCase().includes('insufficient') ||
        upstreamMsg.toLowerCase().includes('scope')
      ) {
        throw new BadRequestException(
          'Google Calendar access not granted. Disconnect Google in Settings → Integrations, then reconnect and make sure the "See your calendars" checkbox stays checked.',
        );
      }
      if (e.code === 401 || upstreamMsg.toLowerCase().includes('unauthorized')) {
        throw new BadRequestException(
          'Google session expired. Reconnect Google in Settings → Integrations.',
        );
      }
      throw new BadRequestException(
        `Could not read Google Calendar: ${upstreamMsg}`,
      );
    }

    // Wipe planned blocks for this user/cycle that came from a previous
    // pull. In-progress / completed / skipped blocks are kept so the
    // user's work history survives a re-sync.
    const wipe = await this.model
      .deleteMany({
        userId: userObjId,
        cycleId: cycleObjId,
        googleEventId: { $exists: true, $ne: null },
        status: 'planned',
      })
      .exec();
    const removed = wipe.deletedCount || 0;

    // Existing blocks that survived the wipe (in_progress / completed /
    // skipped). Keyed by googleEventId so we know to skip re-creating
    // them.
    const kept = await this.model
      .find({
        userId: userObjId,
        cycleId: cycleObjId,
        googleEventId: { $exists: true, $ne: null },
      })
      .select('googleEventId')
      .lean()
      .exec();
    const keptIds = new Set(kept.map((b) => String(b.googleEventId)));

    const unmatched: Array<{ title: string; startsAt: string }> = [];
    const toCreate: Array<Partial<TimeBlock>> = [];
    for (const ev of events) {
      if (keptIds.has(ev.googleEventId)) continue;
      const title = ev.title.trim();
      if (!title) {
        unmatched.push({
          title: '(empty title)',
          startsAt: ev.startsAt.toISOString(),
        });
        continue;
      }
      const titleLc = title.toLowerCase();
      const match = clientIndex.find((c) => titleLc.includes(c.needle));
      if (!match) {
        unmatched.push({ title, startsAt: ev.startsAt.toISOString() });
        continue;
      }
      // Use Google's raw local-time strings so the block lands at the
      // same wall-clock time the user sees in Google Calendar. The
      // dateTime format is `YYYY-MM-DDTHH:mm:ss±HH:mm`, so chars 0–9
      // give the local date and 11–15 give HH:mm in that calendar's
      // timezone. Going through Date#toISOString would convert to UTC
      // and shift everything by the calendar's offset.
      toCreate.push({
        userId: userObjId,
        cycleId: cycleObjId,
        clientId: match.id as Types.ObjectId,
        date: ev.startDateTime.slice(0, 10),
        startTime: ev.startDateTime.slice(11, 16),
        endTime: ev.endDateTime.slice(11, 16),
        durationMinutes: ev.durationMinutes,
        kind: 'client',
        status: 'planned' as TimeBlockStatus,
        notes: ev.description,
        googleEventId: ev.googleEventId,
        googleEventLink: ev.htmlLink,
      });
    }

    if (toCreate.length > 0) {
      await this.model.insertMany(toCreate);
    }

    return {
      created: toCreate.length,
      removed,
      skippedKept: keptIds.size,
      unmatched,
      totalEvents: events.length,
    };
  }

  // --- Weekly plan generator ------------------------------------------------

  private static readonly HOURS_PER_SLOT = 5;
  private static readonly SLOTS_PER_WEEK = 10; // 5 days × 2 slots
  private static readonly WORKDAYS = 5;
  private static readonly SLOT_STARTS = ['09:00', '14:00']; // 5h each
  private static readonly SLOT_ENDS = ['14:00', '19:00'];

  /**
   * Produces the weekly-plan proposal for the given user starting at
   * weekStart (must be a Monday). Sorts active clients by tier ascending
   * (A → B → C) then by "last worked" ascending (oldest first). Assigns
   * one 5-hour slot per client per week, capped at 10 clients per week;
   * overflow clients roll into subsequent weeks. Clients that already
   * have a Google Calendar event matching their name/alias for the
   * proposed week keep that event's date/time instead of a synthetic
   * auto-slot — preserving whatever the user manually scheduled.
   *
   * The plan is a pure computation — nothing is persisted here. Call
   * commitWeeklyPlan to persist the resulting slots as TimeBlocks or
   * pushWeeklyPlanToCalendar to write them into Google Calendar.
   */
  async generateWeeklyPlan(
    userId: string,
    weekStart: string,
    user: AuthenticatedUser,
  ): Promise<{
    weeks: Array<{
      start: string;
      end: string;
      slots: Array<{
        clientId: string;
        clientName: string;
        tier: string;
        date: string;
        startTime: string;
        endTime: string;
        source: 'calendar' | 'generated';
        googleEventId?: string;
        googleEventLink?: string;
        conflict?: { existingTitle: string; existingRange: string };
      }>;
    }>;
    unassigned: number;
  }> {
    const monday = this.parseMonday(weekStart);
    if (!monday) {
      throw new BadRequestException(
        'weekStart must be a Monday in YYYY-MM-DD format.',
      );
    }
    // Load clients the caller can see + their metadata.
    const accessibleIds = await this.clientsSvc.listAccessibleIds(user);
    const clientQuery: Record<string, unknown> = { active: true };
    if (accessibleIds !== null) clientQuery._id = { $in: accessibleIds };
    const clients = await this.clientModel
      .find(clientQuery)
      .select('_id name tier calendarAliases')
      .lean()
      .exec();
    if (clients.length === 0) {
      return { weeks: [], unassigned: 0 };
    }

    // Last-worked date per client — max(TimeBlock.date) for this user.
    const lastWorkedRows = await this.model
      .aggregate([
        {
          $match: {
            userId: new Types.ObjectId(userId),
            clientId: { $in: clients.map((c) => c._id) },
          },
        },
        { $group: { _id: '$clientId', lastDate: { $max: '$date' } } },
      ])
      .exec();
    const lastWorkedByClient = new Map<string, string>();
    for (const r of lastWorkedRows) {
      lastWorkedByClient.set(String(r._id), r.lastDate);
    }

    // Tier rank — A first, then B, then C, else last.
    const tierRank = (t?: string) =>
      t === 'A' ? 0 : t === 'B' ? 1 : t === 'C' ? 2 : 9;

    const ordered = [...clients].sort((a, b) => {
      const t = tierRank(a.tier) - tierRank(b.tier);
      if (t !== 0) return t;
      const la = lastWorkedByClient.get(String(a._id)) || '';
      const lb = lastWorkedByClient.get(String(b._id)) || '';
      // Oldest first — never-worked clients (empty string) sort ahead of
      // any actual date.
      return la.localeCompare(lb);
    });

    // How many weeks do we need? ceil(clients / 10).
    const totalWeeks = Math.ceil(
      ordered.length / TimeBlocksService.SLOTS_PER_WEEK,
    );

    // Look ahead across ALL weeks so we can match calendar events per week.
    const rangeFrom = new Date(monday);
    const rangeTo = new Date(monday);
    rangeTo.setUTCDate(rangeTo.getUTCDate() + 7 * totalWeeks);
    rangeTo.setUTCHours(23, 59, 59, 999);
    let calendarEvents: Awaited<
      ReturnType<CalendarService['listEvents']>
    > = [];
    try {
      calendarEvents = await this.calendarSvc.listEvents(
        userId,
        rangeFrom,
        rangeTo,
      );
    } catch {
      // Missing scope / token — proceed without calendar preservation.
      // The user still gets a synthetic plan; existing calendar entries
      // just won't be honored this run.
    }

    // Build the client-name index (identical pattern to pullFromCalendar
    // so matching stays consistent across the two flows).
    const clientIndex = clients.flatMap((c) => {
      const names = [c.name, ...(c.calendarAliases ?? [])]
        .map((n) => (n || '').trim())
        .filter(Boolean);
      return names.map((n) => ({
        id: String(c._id),
        needle: n.toLowerCase(),
      }));
    });
    clientIndex.sort((a, b) => b.needle.length - a.needle.length);

    // Bucket calendar events by (clientId, weekIndex).
    const matchedByClientWeek = new Map<
      string,
      { event: (typeof calendarEvents)[number]; weekIndex: number }
    >();
    for (const ev of calendarEvents) {
      const t = ev.title.trim().toLowerCase();
      if (!t) continue;
      const match = clientIndex.find((c) => t.includes(c.needle));
      if (!match) continue;
      const evStart = new Date(ev.startsAt);
      const daysFromMonday = Math.floor(
        (evStart.getTime() - monday.getTime()) / (24 * 60 * 60 * 1000),
      );
      const weekIndex = Math.floor(daysFromMonday / 7);
      if (weekIndex < 0 || weekIndex >= totalWeeks) continue;
      // Keep only ONE event per (client, week) — the earliest.
      const key = `${match.id}::${weekIndex}`;
      if (!matchedByClientWeek.has(key)) {
        matchedByClientWeek.set(key, { event: ev, weekIndex });
      }
    }

    // Compose the plan week by week. Slots inside a week fill in this
    // order: Mon-morning, Mon-afternoon, Tue-morning, ..., Fri-afternoon.
    const weeks: Array<{
      start: string;
      end: string;
      slots: Array<{
        clientId: string;
        clientName: string;
        tier: string;
        date: string;
        startTime: string;
        endTime: string;
        source: 'calendar' | 'generated';
        googleEventId?: string;
        googleEventLink?: string;
        conflict?: { existingTitle: string; existingRange: string };
      }>;
    }> = [];

    for (let w = 0; w < totalWeeks; w++) {
      const weekMonday = new Date(monday);
      weekMonday.setUTCDate(weekMonday.getUTCDate() + w * 7);
      const weekFriday = new Date(weekMonday);
      weekFriday.setUTCDate(weekFriday.getUTCDate() + 4);
      const weekClients = ordered.slice(
        w * TimeBlocksService.SLOTS_PER_WEEK,
        (w + 1) * TimeBlocksService.SLOTS_PER_WEEK,
      );

      // Track which auto-slot index is next for clients without a
      // calendar entry. Skip auto-slots that overlap with existing
      // matched events (their time is claimed by the calendar event).
      const usedAutoSlots = new Set<number>();
      // Also collect all events (matched or not) in this week for
      // conflict detection when placing auto slots.
      const eventsThisWeek = calendarEvents.filter((ev) => {
        const daysFromMonday = Math.floor(
          (new Date(ev.startsAt).getTime() - weekMonday.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        return daysFromMonday >= 0 && daysFromMonday < 7;
      });

      const slots: (typeof weeks)[number]['slots'] = [];
      // Pass 1: honor calendar-matched slots first so their positions
      // are locked in before auto-assignment starts.
      const remaining: typeof weekClients = [];
      for (const c of weekClients) {
        const key = `${String(c._id)}::${w}`;
        const matched = matchedByClientWeek.get(key);
        if (matched) {
          const ev = matched.event;
          slots.push({
            clientId: String(c._id),
            clientName: c.name,
            tier: c.tier,
            date: ev.startDateTime.slice(0, 10),
            startTime: ev.startDateTime.slice(11, 16),
            endTime: ev.endDateTime.slice(11, 16),
            source: 'calendar',
            googleEventId: ev.googleEventId,
            googleEventLink: ev.htmlLink,
          });
        } else {
          remaining.push(c);
        }
      }
      // Pass 2: assign auto-slots to the rest.
      for (const c of remaining) {
        let placed = false;
        for (
          let idx = 0;
          idx < TimeBlocksService.SLOTS_PER_WEEK;
          idx++
        ) {
          if (usedAutoSlots.has(idx)) continue;
          const day = Math.floor(idx / 2);
          const half = idx % 2;
          const slotDate = new Date(weekMonday);
          slotDate.setUTCDate(slotDate.getUTCDate() + day);
          const dateIso = formatDate(slotDate);
          const startTime = TimeBlocksService.SLOT_STARTS[half];
          const endTime = TimeBlocksService.SLOT_ENDS[half];
          // Skip auto-slots whose range overlaps ANY event in this
          // week — those hours are already spoken for on the user's
          // calendar even if it isn't a client match.
          const overlap = eventsThisWeek.find((ev) => {
            return this.eventOverlapsSlot(
              ev,
              dateIso,
              startTime,
              endTime,
            );
          });
          if (overlap) {
            usedAutoSlots.add(idx);
            continue;
          }
          usedAutoSlots.add(idx);
          slots.push({
            clientId: String(c._id),
            clientName: c.name,
            tier: c.tier,
            date: dateIso,
            startTime,
            endTime,
            source: 'generated',
          });
          placed = true;
          break;
        }
        if (!placed) {
          // Every slot in this week overlaps with something on the
          // calendar. Bump this client to the next week's overflow
          // logic — insert a synthetic marker with no date so the UI
          // can surface it.
          slots.push({
            clientId: String(c._id),
            clientName: c.name,
            tier: c.tier,
            date: '',
            startTime: '',
            endTime: '',
            source: 'generated',
            conflict: {
              existingTitle: 'Week is full of pre-existing events',
              existingRange: '',
            },
          });
        }
      }

      weeks.push({
        start: formatDate(weekMonday),
        end: formatDate(weekFriday),
        slots,
      });
    }

    return {
      weeks,
      unassigned: weeks.reduce(
        (s, w) => s + w.slots.filter((sl) => !sl.date).length,
        0,
      ),
    };
  }

  /**
   * Persists the given plan as TimeBlocks. Calendar-sourced slots reuse
   * their googleEventId so the block is idempotent-upsertable via the
   * same mechanism as pullFromCalendar. Auto-generated slots get plain
   * planned blocks with no calendar link (pushWeeklyPlanToCalendar will
   * write them out separately).
   */
  async commitWeeklyPlan(
    userId: string,
    weekStart: string,
    plan: {
      weeks: Array<{
        slots: Array<{
          clientId: string;
          date: string;
          startTime: string;
          endTime: string;
          source: 'calendar' | 'generated';
          googleEventId?: string;
          googleEventLink?: string;
        }>;
      }>;
    },
    user: AuthenticatedUser,
  ): Promise<{ created: number; skipped: number }> {
    // Resolve the cycle for weekStart so persisted blocks are anchored
    // to a real cycle (matches the shape of pullFromCalendar output).
    const cycle = await this.cycleModel
      .findOne({
        startDate: { $lte: new Date(weekStart) },
        endDate: { $gte: new Date(weekStart) },
      })
      .lean()
      .exec();
    if (!cycle) {
      throw new BadRequestException(
        `No cycle found containing ${weekStart}. Plan can only be committed inside an active cycle.`,
      );
    }
    const userObjId = new Types.ObjectId(userId);
    const cycleObjId = new Types.ObjectId(cycle._id);

    let created = 0;
    let skipped = 0;
    for (const week of plan.weeks) {
      for (const s of week.slots) {
        if (!s.date) {
          skipped++;
          continue;
        }
        // Skip if a planned block already exists for (user, date, startTime).
        // Prevents duplicates on repeated commits.
        const exists = await this.model
          .findOne({
            userId: userObjId,
            date: s.date,
            startTime: s.startTime,
          })
          .lean()
          .exec();
        if (exists) {
          skipped++;
          continue;
        }
        await user; // touch to satisfy lint if unused
        await this.model.create({
          userId: userObjId,
          cycleId: cycleObjId,
          clientId: new Types.ObjectId(s.clientId),
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMinutes: minutesBetween(s.startTime, s.endTime),
          kind: 'client',
          status: 'planned',
          googleEventId: s.googleEventId,
          googleEventLink: s.googleEventLink,
        });
        created++;
      }
    }
    return { created, skipped };
  }

  /**
   * Pushes the plan's generated slots into Google Calendar. Slots
   * whose source is 'calendar' are skipped — the user already has an
   * event for them. On success stamps googleEventId back onto the
   * matching TimeBlock so future pulls/renders can link out to the
   * calendar event.
   */
  async pushWeeklyPlanToCalendar(
    userId: string,
    plan: {
      weeks: Array<{
        slots: Array<{
          clientId: string;
          clientName: string;
          date: string;
          startTime: string;
          endTime: string;
          source: 'calendar' | 'generated';
        }>;
      }>;
    },
  ): Promise<{ pushed: number; skipped: number; conflicts: number }> {
    let pushed = 0;
    let skipped = 0;
    let conflicts = 0;
    // Read the user's existing calendar events across the plan range
    // once so we can flag conflicts without a per-slot round-trip.
    const allDates = plan.weeks
      .flatMap((w) => w.slots)
      .map((s) => s.date)
      .filter(Boolean)
      .sort();
    let existing: Awaited<
      ReturnType<CalendarService['listEvents']>
    > = [];
    if (allDates.length > 0) {
      const from = new Date(allDates[0]);
      const to = new Date(allDates[allDates.length - 1]);
      to.setUTCHours(23, 59, 59, 999);
      try {
        existing = await this.calendarSvc.listEvents(userId, from, to);
      } catch (err) {
        throw new BadRequestException(
          `Could not read Google Calendar to check for conflicts: ${(err as Error).message}`,
        );
      }
    }
    for (const week of plan.weeks) {
      for (const s of week.slots) {
        if (!s.date) {
          skipped++;
          continue;
        }
        if (s.source === 'calendar') {
          // The user already has this on their calendar — preserving.
          skipped++;
          continue;
        }
        // Conflict = any existing event that overlaps this slot's window.
        const conflict = existing.find((ev) =>
          this.eventOverlapsSlot(ev, s.date, s.startTime, s.endTime),
        );
        if (conflict) {
          conflicts++;
          skipped++;
          continue;
        }
        const startIso = `${s.date}T${s.startTime}:00`;
        const endIso = `${s.date}T${s.endTime}:00`;
        const timeZone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        try {
          const created = await this.calendarSvc.createEvent(userId, {
            summary: s.clientName,
            description: 'Scheduled by Internal Tools weekly plan.',
            startDateTime: startIso,
            endDateTime: endIso,
            timeZone,
          });
          // Stamp the event id back onto the matching TimeBlock so future
          // renders can link straight to Google Calendar.
          await this.model
            .updateOne(
              {
                userId: new Types.ObjectId(userId),
                clientId: new Types.ObjectId(s.clientId),
                date: s.date,
                startTime: s.startTime,
              },
              {
                $set: {
                  googleEventId: created.googleEventId,
                  googleEventLink: created.htmlLink,
                },
              },
            )
            .exec();
          pushed++;
        } catch {
          skipped++;
        }
      }
    }
    return { pushed, skipped, conflicts };
  }

  private eventOverlapsSlot(
    ev: { startDateTime: string; endDateTime: string },
    date: string,
    startTime: string,
    endTime: string,
  ): boolean {
    if (ev.startDateTime.slice(0, 10) !== date) return false;
    const evStart = ev.startDateTime.slice(11, 16);
    const evEnd = ev.endDateTime.slice(11, 16);
    return evStart < endTime && evEnd > startTime;
  }

  private parseMonday(iso: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    if (isNaN(d.getTime())) return null;
    if (d.getUTCDay() !== 1) return null;
    return d;
  }
}
