import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { startOfDay } from 'date-fns';
import { HOURS_PER_TIER, UserRole } from '@seo/shared';
import { Client, ClientDocument } from './client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Keyword, KeywordDocument } from '../keywords/keyword.schema';
import { Task, TaskDocument } from '../tasks/task.schema';
import { Cycle, CycleDocument } from '../cycles/cycle.schema';
import { Backlink, BacklinkDocument } from '../backlinks/backlink.schema';
import { AuthenticatedUser } from '../auth/roles.guard';

const MANAGER_ROLES: UserRole[] = ['root', 'seo-manager'];

function isManager(role: UserRole): boolean {
  return MANAGER_ROLES.includes(role);
}

function ownerScopeFilter(user: AuthenticatedUser): Record<string, unknown> {
  if (isManager(user.role)) return {};
  return { ownerId: new Types.ObjectId(user.userId) };
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly model: Model<ClientDocument>,
    @InjectModel(Keyword.name) private readonly keywordModel: Model<KeywordDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Cycle.name) private readonly cycleModel: Model<CycleDocument>,
    @InjectModel(Backlink.name) private readonly backlinkModel: Model<BacklinkDocument>,
  ) {}

  async findAll(
    filters: { tier?: string; packageId?: string; active?: boolean } = {},
    user?: AuthenticatedUser,
  ) {
    const q: Record<string, unknown> = {};
    if (filters.packageId) q.packageId = new Types.ObjectId(filters.packageId);
    else if (filters.tier) q.tier = filters.tier;
    if (typeof filters.active === 'boolean') q.active = filters.active;
    if (user) Object.assign(q, ownerScopeFilter(user));
    return this.model
      .find(q)
      .populate('ownerId', 'name email')
      .populate('packageId', 'name color description deliverables hoursPerPeriod')
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user?: AuthenticatedUser) {
    const client = await this.model
      .findById(id)
      .populate('ownerId', 'name email')
      .populate('packageId', 'name color description deliverables hoursPerPeriod')
      .lean()
      .exec();
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    if (user && !isManager(user.role)) {
      const ownerStr = (client.ownerId as unknown as { _id?: unknown } | Types.ObjectId | null);
      const ownerId =
        ownerStr && typeof ownerStr === 'object' && '_id' in ownerStr
          ? String((ownerStr as { _id: unknown })._id)
          : String(ownerStr ?? '');
      if (ownerId !== user.userId) {
        throw new ForbiddenException('You do not have access to this client');
      }
    }
    return client;
  }

  async assertAccess(clientId: string, user: AuthenticatedUser): Promise<void> {
    if (isManager(user.role)) return;
    const exists = await this.model
      .exists({
        _id: new Types.ObjectId(clientId),
        ownerId: new Types.ObjectId(user.userId),
      })
      .exec();
    if (!exists)
      throw new ForbiddenException('You do not have access to this client');
  }

  async listAccessibleIds(user: AuthenticatedUser): Promise<Types.ObjectId[] | null> {
    // Returns null when no scoping needed (manager/root), or list of ObjectIds owned by user.
    if (isManager(user.role)) return null;
    const docs = await this.model
      .find({ ownerId: new Types.ObjectId(user.userId) }, { _id: 1 })
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
    return doc.save();
  }

  async update(id: string, dto: UpdateClientDto, user?: AuthenticatedUser) {
    if (user) await this.assertAccess(id, user);
    // Strategists cannot reassign ownership
    const patch: Record<string, unknown> = { ...dto };
    if (user && !isManager(user.role)) delete patch.ownerId;
    if (patch.ownerId) patch.ownerId = new Types.ObjectId(patch.ownerId as string);
    const updated = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .populate('ownerId', 'name email')
      .populate('packageId', 'name color description deliverables hoursPerPeriod')
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Client ${id} not found`);
    return updated;
  }

  async remove(id: string, user?: AuthenticatedUser) {
    if (user && !isManager(user.role)) {
      throw new ForbiddenException('Only managers can delete clients');
    }
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Client ${id} not found`);
    return { deleted: true };
  }

  async stats(user?: AuthenticatedUser) {
    const match: Record<string, unknown> = { active: true };
    if (user && !isManager(user.role)) {
      match.ownerId = new Types.ObjectId(user.userId);
    }
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
    if (user) Object.assign(q, ownerScopeFilter(user));
    const clients = await this.model
      .find(q)
      .populate('ownerId', 'name email')
      .populate('packageId', 'name color description deliverables hoursPerPeriod')
      .sort({ tier: 1, name: 1 })
      .lean()
      .exec();

    return Promise.all(
      clients.map(async (c) => {
        const [keywords, tasks, liveBacklinks] = await Promise.all([
          this.keywordModel.find({ clientId: c._id }).lean().exec(),
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
          },
        };
      }),
    );
  }
}
