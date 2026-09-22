import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { startOfDay } from 'date-fns';
import {
  ClientHealthStatus,
  ClientRosterStats,
  HOURS_PER_TIER,
} from '@seo/shared';
import { Client, ClientDocument } from './client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Keyword, KeywordDocument } from '../keywords/keyword.schema';
import { Task, TaskDocument } from '../tasks/task.schema';
import { Cycle, CycleDocument } from '../cycles/cycle.schema';
import { Backlink, BacklinkDocument } from '../backlinks/backlink.schema';
import { User, UserDocument } from '../auth/user.schema';
import {
  AuthenticatedUser,
  canManageTeam,
  isAdmin,
  isManagerOrAbove,
} from '../auth/roles.guard';
import { ActivityLogService } from '../activity-log/activity-log.service';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    @InjectModel(Client.name) private readonly model: Model<ClientDocument>,
    @InjectModel(Keyword.name) private readonly keywordModel: Model<KeywordDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Cycle.name) private readonly cycleModel: Model<CycleDocument>,
    @InjectModel(Backlink.name) private readonly backlinkModel: Model<BacklinkDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly audit: ActivityLogService,
  ) {}


  /**
   * Builds the Mongo filter that restricts a query to the clients a
   * given user is allowed to see:
   *
   *   root / owner / admin → no filter (whole roster).
   *   manager              → ownerId ∈ (self + strategist team members).
   *   strategist           → ownerId = self.
   *
   * Async because manager scope needs a team-member lookup. Callers
   * are already async, so no cost.
   */
  private async ownerScopeFilter(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    if (isAdmin(user.role)) return {};
    const selfOid = new Types.ObjectId(user.userId);
    if (user.role === 'manager') {
      const team = await this.userModel
        .find({ managerId: selfOid }, { _id: 1 })
        .lean()
        .exec();
      const ids = [selfOid, ...team.map((t) => t._id as Types.ObjectId)];
      return { ownerId: { $in: ids } };
    }
    return { ownerId: selfOid };
  }

  async findAll(
    filters: { tier?: string; packageId?: string; active?: boolean } = {},
    user?: AuthenticatedUser,
  ) {
    const q: Record<string, unknown> = {};
    if (filters.packageId) q.packageId = new Types.ObjectId(filters.packageId);
    else if (filters.tier) q.tier = filters.tier;
    if (typeof filters.active === 'boolean') q.active = filters.active;
    if (user) Object.assign(q, await this.ownerScopeFilter(user));
    return this.model
      .find(q)
      .populate('ownerId', 'name email')
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user?: AuthenticatedUser) {
    const client = await this.model
      .findById(id)
      .populate('ownerId', 'name email')
      .lean()
      .exec();
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    if (user && !isAdmin(user.role)) {
      const allowedIds = await this.buildAllowedOwnerIds(user);
      const ownerStr = client.ownerId as
        | { _id?: unknown }
        | Types.ObjectId
        | null;
      const ownerId =
        ownerStr && typeof ownerStr === 'object' && '_id' in ownerStr
          ? String((ownerStr as { _id: unknown })._id)
          : String(ownerStr ?? '');
      if (!allowedIds.some((o) => o.toString() === ownerId)) {
        throw new ForbiddenException('You do not have access to this client');
      }
    }
    return client;
  }

  /**
   * Returns the set of userIds whose clients the caller is allowed to
   * see (self + team). Empty means "unrestricted" — root/owner/admin.
   */
  private async buildAllowedOwnerIds(
    user: AuthenticatedUser,
  ): Promise<Types.ObjectId[]> {
    if (isAdmin(user.role)) return []; // caller handles unrestricted case
    const selfOid = new Types.ObjectId(user.userId);
    if (user.role === 'manager') {
      const team = await this.userModel
        .find({ managerId: selfOid }, { _id: 1 })
        .lean()
        .exec();
      return [selfOid, ...team.map((t) => t._id as Types.ObjectId)];
    }
    return [selfOid];
  }

  async assertAccess(clientId: string, user: AuthenticatedUser): Promise<void> {
    if (isAdmin(user.role)) return;
    const allowedIds = await this.buildAllowedOwnerIds(user);
    const exists = await this.model
      .exists({
        _id: new Types.ObjectId(clientId),
        ownerId: { $in: allowedIds },
      })
      .exec();
    if (!exists)
      throw new ForbiddenException('You do not have access to this client');
  }

  async listAccessibleIds(
    user: AuthenticatedUser,
  ): Promise<Types.ObjectId[] | null> {
    // Returns null when caller can see everything (root/owner/admin);
    // list of client _ids otherwise.
    if (isAdmin(user.role)) return null;
    const allowedIds = await this.buildAllowedOwnerIds(user);
    const docs = await this.model
      .find({ ownerId: { $in: allowedIds } }, { _id: 1 })
      .lean()
      .exec();
    return docs.map((d) => d._id as Types.ObjectId);
  }

  async create(dto: CreateClientDto, user?: AuthenticatedUser) {
    const ownerId =
      dto.ownerId
        ? new Types.ObjectId(dto.ownerId)
        : user
          ? new Types.ObjectId(user.userId)
          : undefined;
    // hoursPerCycle fallback: explicit → legacy tier lookup → 0. When
    // the frontend picks a Package it seeds hoursPerCycle from
    // package.hoursPerPeriod before submitting, so this branch is only
    // hit by legacy callers.
    const hoursFallback = dto.tier ? HOURS_PER_TIER[dto.tier] : 0;
    const doc = new this.model({
      ...dto,
      ownerId,
      packageId: dto.packageId ? new Types.ObjectId(dto.packageId) : undefined,
      hoursPerCycle: dto.hoursPerCycle ?? hoursFallback,
    });
    const saved = await doc.save();
    await this.audit.log({
      userId: user?.userId,
      userEmail: user?.email,
      action: 'client.created',
      targetType: 'Client',
      targetId: String(saved._id),
      details: {
        name: saved.name,
        url: saved.url,
        ownerId: ownerId?.toString(),
      },
    });
    return saved;
  }

  async update(id: string, dto: UpdateClientDto, user?: AuthenticatedUser) {
    if (user) await this.assertAccess(id, user);
    // Only manager-or-above can reassign the owner.
    const patch: Record<string, unknown> = { ...dto };
    if (user && !canManageTeam(user.role)) delete patch.ownerId;
    if (patch.ownerId) patch.ownerId = new Types.ObjectId(patch.ownerId as string);
    const updated = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .populate('ownerId', 'name email')
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Client ${id} not found`);
    await this.audit.log({
      userId: user?.userId,
      userEmail: user?.email,
      action: 'client.updated',
      targetType: 'Client',
      targetId: id,
      details: { fields: Object.keys(patch) },
    });
    return updated;
  }

  async remove(id: string, user?: AuthenticatedUser) {
    if (user && !isManagerOrAbove(user.role)) {
      throw new ForbiddenException(
        'Only manager-or-above roles can delete clients',
      );
    }
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Client ${id} not found`);
    await this.audit.log({
      userId: user?.userId,
      userEmail: user?.email,
      action: 'client.deleted',
      targetType: 'Client',
      targetId: id,
      details: { name: deleted.name },
    });
    return { deleted: true };
  }

  async stats(user?: AuthenticatedUser) {
    const match: Record<string, unknown> = { active: true };
    if (user) Object.assign(match, await this.ownerScopeFilter(user));
    const grouped = await this.model.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$tier',
          count: { $sum: 1 },
          totalHours: { $sum: '$hoursPerCycle' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const total = grouped.reduce((acc, g) => acc + g.totalHours, 0);
    return { perTier: grouped, totalHoursPerCycle: total };
  }

  async findAllWithStats(
    filters: { tier?: string; active?: boolean } = {},
    user?: AuthenticatedUser,
  ) {
    const today = startOfDay(new Date());
    const currentCycle = await this.cycleModel
      .findOne({ startDate: { $lte: today }, endDate: { $gte: today } })
      .lean()
      .exec();

    const q: Record<string, unknown> = {};
    if (filters.tier) q.tier = filters.tier;
    if (typeof filters.active === 'boolean') q.active = filters.active;
    if (user) Object.assign(q, await this.ownerScopeFilter(user));
    const clients = await this.model
      .find(q)
      .populate('ownerId', 'name email')
      .sort({ tier: 1, name: 1 })
      .lean()
      .exec();

    return Promise.all(
      clients.map(async (c) => {
        const [keywords, tasks, liveBacklinks] = await Promise.all([
          this.keywordModel
            .find({ clientId: c._id, tracked: { $ne: false } })
            .lean()
            .exec(),
          currentCycle
            ? this.taskModel
                .find({ clientId: c._id, cycleId: currentCycle._id })
                .lean()
                .exec()
            : Promise.resolve([]),
          this.backlinkModel.countDocuments({
            clientId: c._id,
            status: 'live',
          }),
        ]);

        const rankedKeywords = keywords.filter(
          (k) => typeof k.currentPosition === 'number',
        );
        const top10 = rankedKeywords.filter(
          (k) => (k.currentPosition || 999) <= 10,
        ).length;
        const top3 = rankedKeywords.filter(
          (k) => (k.currentPosition || 999) <= 3,
        ).length;
        const avgPosition =
          rankedKeywords.length > 0
            ? rankedKeywords.reduce(
                (acc, k) => acc + (k.currentPosition || 0),
                0,
              ) / rankedKeywords.length
            : null;

        // Movement: gainers - losers
        let gainers = 0;
        let losers = 0;
        for (const k of keywords) {
          if (
            typeof k.currentPosition === 'number' &&
            typeof k.previousPosition === 'number'
          ) {
            if (k.previousPosition > k.currentPosition) gainers++;
            else if (k.previousPosition < k.currentPosition) losers++;
          }
        }

        const completedTasks = tasks.filter((t) => t.status === 'completed').length;
        const actualHours = tasks.reduce(
          (acc, t) => acc + (t.actualHours || 0),
          0,
        );

        // Roster health: penalize days-since-last-delivered-work + open
        // tasks. Score 0-100, buckets: healthy >=70, watch 50-69,
        // at-risk <50. Derived from the tasks we already loaded, so this
        // costs no extra query.
        const completedAts = tasks
          .map((t) => (t as { completedAt?: Date | string }).completedAt)
          .filter((d): d is Date | string => !!d)
          .map((d) => new Date(d).getTime())
          .filter((n) => Number.isFinite(n));
        const lastActivityAt = completedAts.length
          ? new Date(Math.max(...completedAts))
          : undefined;
        const daysSinceLastActivity = lastActivityAt
          ? Math.floor((Date.now() - lastActivityAt.getTime()) / 86400000)
          : null;
        const openTasks = tasks.length - completedTasks;
        const healthScore = this.computeHealthScore(
          daysSinceLastActivity,
          openTasks,
        );
        const healthStatus: ClientHealthStatus =
          healthScore >= 70
            ? 'healthy'
            : healthScore >= 50
              ? 'watch'
              : 'at-risk';

        return {
          ...c,
          stats: {
            keywords: {
              total: keywords.length,
              ranked: rankedKeywords.length,
              top3,
              top10,
              avgPosition,
              gainers,
              losers,
            },
            currentCycleTasks: {
              total: tasks.length,
              completed: completedTasks,
            },
            currentCycleHours: {
              actual: Math.round(actualHours * 10) / 10,
              assigned: c.hoursPerCycle,
              pct:
                c.hoursPerCycle > 0
                  ? Math.round((actualHours / c.hoursPerCycle) * 100)
                  : 0,
            },
            backlinks: liveBacklinks,
            lastActivityAt,
            daysSinceLastActivity,
            healthScore,
            healthStatus,
          },
        };
      }),
    );
  }

  /**
   * Roster-health formula.
   *  Base: 100
   *  Penalty: 1 pt per day since the last completed task (max 60).
   *  Penalty: 5 pt per open task on the current cycle.
   *  Clients with nothing completed yet start at 60 (neither healthy
   *  nor at-risk) so a brand-new client doesn't false-flag on day 1.
   */
  private computeHealthScore(
    daysSinceLastActivity: number | null,
    openTasks: number,
  ): number {
    let score = 100;
    if (daysSinceLastActivity === null) {
      score = 60;
    } else {
      score -= Math.min(60, daysSinceLastActivity);
    }
    score -= Math.min(50, Math.max(0, openTasks) * 5);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Roster-level KPI tiles for the Clients page. Aggregates across
   * every client in the caller's scope: totals, per-service counts,
   * and status buckets (at-risk / expansion / canceled).
   */
  async rosterStats(user: AuthenticatedUser): Promise<ClientRosterStats> {
    const scope = await this.ownerScopeFilter(user);
    const clients = await this.model
      .find({ ...scope })
      .select({ active: 1, serviceLines: 1, _id: 1 })
      .lean()
      .exec();
    const rows = clients as unknown as Array<{
      _id: Types.ObjectId;
      active?: boolean;
      serviceLines?: string[];
    }>;
    const active = rows.filter((c) => c.active !== false);
    const inactive = rows.filter((c) => c.active === false);

    const perService = { seo: 0, ppc: 0, website: 0, other: 0, combo: 0 };
    for (const c of active) {
      const lines = (c.serviceLines ?? []).filter(Boolean);
      const set = new Set(lines);
      if (set.has('seo')) perService.seo++;
      if (set.has('ppc')) perService.ppc++;
      if (set.has('website')) perService.website++;
      if (set.has('other') || set.size === 0) perService.other++;
      if (set.size > 1) perService.combo++;
    }

    // At-risk count needs the full per-client health signal — pull the
    // full stats snapshot in scope and count the at-risk bucket. This
    // is O(N) over the roster; fine for the tens-to-hundreds of clients
    // an agency will realistically manage.
    const withStats = await this.findAllWithStats({ active: true }, user);
    const atRisk = withStats.filter(
      (c) =>
        (c as unknown as { stats?: { healthStatus?: string } }).stats
          ?.healthStatus === 'at-risk',
    ).length;

    return {
      totalActive: active.length,
      atRisk,
      expansion: perService.combo,
      canceled: inactive.length,
      perService,
    };
  }

  // --- Client-level attachments ------------------------------------------

  async addAttachment(
    clientId: string,
    attachment: {
      publicId: string;
      url: string;
      thumbnailUrl?: string;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      resourceType?: 'image' | 'raw' | 'video';
      originalFilename?: string;
      label?: string;
    },
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    if (!attachment?.publicId || !attachment?.url) {
      throw new BadRequestException('Attachment is missing publicId or url.');
    }
    const updated = await this.model
      .findByIdAndUpdate(
        clientId,
        {
          $push: {
            attachments: {
              ...attachment,
              uploadedAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Client ${clientId} not found`);
    await this.audit.log({
      userId: user?.userId,
      userEmail: user?.email,
      action: 'client.attachment.added',
      targetType: 'Client',
      targetId: clientId,
      details: {
        publicId: attachment.publicId,
        filename: attachment.originalFilename,
      },
    });
    return updated;
  }

  async updateAttachment(
    clientId: string,
    publicId: string,
    patch: { label?: string },
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    const setDoc: Record<string, unknown> = {};
    if (patch.label !== undefined) {
      setDoc['attachments.$.label'] = patch.label || undefined;
    }
    if (Object.keys(setDoc).length === 0) {
      throw new BadRequestException('Nothing to update.');
    }
    const updated = await this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(clientId),
          'attachments.publicId': publicId,
        },
        { $set: setDoc },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Attachment ${publicId} not found on client`);
    }
    return updated;
  }

  async removeAttachment(
    clientId: string,
    publicId: string,
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    const updated = await this.model
      .findByIdAndUpdate(
        clientId,
        { $pull: { attachments: { publicId } } },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Client ${clientId} not found`);
    await this.audit.log({
      userId: user?.userId,
      userEmail: user?.email,
      action: 'client.attachment.removed',
      targetType: 'Client',
      targetId: clientId,
      details: { publicId },
    });
    return { deleted: true };
  }

  // --- Notes -------------------------------------------------------------
  //
  // Notes are subdocs on the Client with their own _id so the frontend
  // can address them without knowing an array index. Every mutation
  // returns the whole updated Client so the UI can re-render its notes
  // list off a single response.

  async addNote(
    clientId: string,
    content: string,
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    const clean = (content || '').trim();
    if (!clean) {
      throw new BadRequestException('Note content is required.');
    }
    const updated = await this.model
      .findByIdAndUpdate(
        clientId,
        {
          $push: {
            notes: {
              content: clean,
              attachments: [],
              authorId: user?.userId,
              authorName: user?.email,
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Client ${clientId} not found`);
    await this.audit.log({
      userId: user?.userId,
      userEmail: user?.email,
      action: 'client.note.added',
      targetType: 'Client',
      targetId: clientId,
    });
    return updated;
  }

  async updateNote(
    clientId: string,
    noteId: string,
    content: string,
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    const clean = (content || '').trim();
    if (!clean) {
      throw new BadRequestException('Note content is required.');
    }
    const updated = await this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(clientId),
          'notes._id': new Types.ObjectId(noteId),
        },
        {
          $set: {
            'notes.$.content': clean,
            // Bump the subdoc's updatedAt so the UI shows an edited
            // marker. Mongoose's subdoc timestamps only auto-touch on
            // full-subdoc replaces, not $set of a single field.
            'notes.$.updatedAt': new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Note ${noteId} not found on client`);
    }
    return updated;
  }

  async removeNote(
    clientId: string,
    noteId: string,
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    const updated = await this.model
      .findByIdAndUpdate(
        clientId,
        { $pull: { notes: { _id: new Types.ObjectId(noteId) } } },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Client ${clientId} not found`);
    await this.audit.log({
      userId: user?.userId,
      userEmail: user?.email,
      action: 'client.note.removed',
      targetType: 'Client',
      targetId: clientId,
      details: { noteId },
    });
    return { deleted: true };
  }

  async addNoteAttachment(
    clientId: string,
    noteId: string,
    attachment: {
      publicId: string;
      url: string;
      thumbnailUrl?: string;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      resourceType?: 'image' | 'raw' | 'video';
      originalFilename?: string;
    },
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    if (!attachment?.publicId || !attachment?.url) {
      throw new BadRequestException('Attachment is missing publicId or url.');
    }
    const updated = await this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(clientId),
          'notes._id': new Types.ObjectId(noteId),
        },
        {
          $push: {
            'notes.$.attachments': {
              ...attachment,
              uploadedAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Note ${noteId} not found on client`);
    }
    return updated;
  }

  async removeNoteAttachment(
    clientId: string,
    noteId: string,
    publicId: string,
    user?: AuthenticatedUser,
  ) {
    if (user) await this.assertAccess(clientId, user);
    const updated = await this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(clientId),
          'notes._id': new Types.ObjectId(noteId),
        },
        {
          $pull: { 'notes.$.attachments': { publicId } },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Note ${noteId} not found on client`);
    }
    return updated;
  }
}
