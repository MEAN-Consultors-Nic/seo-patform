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
import { WorkingHoursService } from '../working-hours/working-hours.service';
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
    private readonly workingHoursSvc: WorkingHoursService,
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
      role: 'seo-strategist',
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

}
