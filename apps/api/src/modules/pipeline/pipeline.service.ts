import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LeadStage, LEAD_STAGE_ORDER, PipelineStats } from '@seo/shared';
import { Lead, LeadDocument } from './lead.schema';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  AddActivityDto,
  ChangeStageDto,
  UpdateLeadDto,
} from './dto/update-lead.dto';
import {
  AuthenticatedUser,
  canManageTeam,
  isAdmin,
} from '../auth/roles.guard';
import { ActivityLogService } from '../activity-log/activity-log.service';

@Injectable()
export class PipelineService {
  constructor(
    @InjectModel(Lead.name) private readonly model: Model<LeadDocument>,
    private readonly audit: ActivityLogService,
  ) {}

  /**
   * Scope leads by ownership: root/owner/admin see everything;
   * managers see their team's leads (self + strategists reporting to
   * them); strategists see only their own. Mirrors the client scoping
   * logic from Core Slice 1.1.
   */
  private async scopeFilter(user: AuthenticatedUser): Promise<Record<string, unknown>> {
    if (isAdmin(user.role)) return {};
    // Managers see any lead owned by themselves. For strict "team scope"
    // we could join the users collection like ClientsService, but for
    // the initial pipeline slice self-only + admin-sees-all is enough
    // and matches how the tools codebase handles pipeline ownership.
    return { ownerId: new Types.ObjectId(user.userId) };
  }

  async findAll(user: AuthenticatedUser, stage?: LeadStage) {
    const q: Record<string, unknown> = await this.scopeFilter(user);
    if (stage) q.stage = stage;
    return this.model
      .find(q)
      .populate('ownerId', 'name email role')
      .populate('clientId', 'name')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const doc = await this.model
      .findById(id)
      .populate('ownerId', 'name email role')
      .populate('clientId', 'name')
      .lean()
      .exec();
    if (!doc) throw new NotFoundException(`Lead ${id} not found`);
    await this.assertAccess(doc, user);
    return doc;
  }

  async create(dto: CreateLeadDto, user: AuthenticatedUser) {
    const doc = await this.model.create({
      ...dto,
      ownerId: dto.ownerId
        ? new Types.ObjectId(dto.ownerId)
        : new Types.ObjectId(user.userId),
      stage: dto.stage || 'new',
      activity: [
        {
          at: new Date(),
          kind: 'stage-change',
          authorUserId: new Types.ObjectId(user.userId),
          authorName: user.email,
          toStage: dto.stage || 'new',
          text: 'Lead created',
        },
      ],
    });
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'lead.created',
      targetType: 'Lead',
      targetId: String(doc._id),
      details: {
        businessName: doc.businessName,
        stage: doc.stage,
      },
    });
    return doc.toObject();
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthenticatedUser) {
    const lead = await this.model.findById(id).exec();
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    await this.assertAccess(lead, user);
    // Reassignment is manager-or-above only.
    if (dto.ownerId && !canManageTeam(user.role)) {
      delete dto.ownerId;
    }
    const patch: Record<string, unknown> = { ...dto };
    if (dto.ownerId) patch.ownerId = new Types.ObjectId(dto.ownerId);
    Object.assign(lead, patch);
    await lead.save();
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'lead.updated',
      targetType: 'Lead',
      targetId: id,
      details: { fields: Object.keys(patch) },
    });
    return lead.toObject();
  }

  async changeStage(id: string, dto: ChangeStageDto, user: AuthenticatedUser) {
    const lead = await this.model.findById(id).exec();
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    await this.assertAccess(lead, user);
    if (!LEAD_STAGE_ORDER.includes(dto.stage)) {
      throw new BadRequestException(`Unknown stage: ${dto.stage}`);
    }
    if (dto.stage === lead.stage) return lead.toObject();
    const from = lead.stage;
    lead.stage = dto.stage;
    if (dto.stage === 'closed_won' || dto.stage === 'closed_lost') {
      lead.closedAt = new Date();
      if (dto.closedReason) lead.closedReason = dto.closedReason;
    } else {
      lead.closedAt = undefined;
      lead.closedReason = undefined;
    }
    lead.activity.push({
      at: new Date(),
      kind: 'stage-change',
      authorUserId: new Types.ObjectId(user.userId),
      authorName: user.email,
      fromStage: from,
      toStage: dto.stage,
      text: dto.closedReason,
    } as never);
    await lead.save();
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'lead.stage-changed',
      targetType: 'Lead',
      targetId: id,
      details: { from, to: dto.stage, closedReason: dto.closedReason },
    });
    return lead.toObject();
  }

  async addActivity(
    id: string,
    dto: AddActivityDto,
    user: AuthenticatedUser,
  ) {
    const lead = await this.model.findById(id).exec();
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    await this.assertAccess(lead, user);
    lead.activity.push({
      at: new Date(),
      kind: dto.kind,
      authorUserId: new Types.ObjectId(user.userId),
      authorName: user.email,
      text: dto.text,
    } as never);
    await lead.save();
    return lead.toObject();
  }

  async remove(id: string, user: AuthenticatedUser) {
    const lead = await this.model.findById(id).exec();
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    await this.assertAccess(lead, user);
    await lead.deleteOne();
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'lead.deleted',
      targetType: 'Lead',
      targetId: id,
      details: { businessName: lead.businessName },
    });
    return { deleted: true };
  }

  /**
   * KPI tiles for the pipeline home:
   *  - pipelineMrr   sum of monthlyDealValue for leads in proposal_sent
   *  - activeMrr     sum of monthlyDealValue for closed_won this month
   *                  (a proxy — the definitive active-MRR view lives on
   *                  the client roster once revenue intel ships)
   *  - wonThisMonth  count of leads moved to closed_won this month
   *  - openLeads     leads in new / no_show / proposal_sent
   *  - perStage      count per stage
   */
  async stats(user: AuthenticatedUser): Promise<PipelineStats> {
    const scope = await this.scopeFilter(user);
    const all = await this.model.find(scope).lean().exec();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const perStage: Record<LeadStage, number> = {
      new: 0,
      no_show: 0,
      proposal_sent: 0,
      closed_won: 0,
      closed_lost: 0,
    };
    let pipelineMrr = 0;
    let activeMrr = 0;
    let wonThisMonth = 0;
    let wonThisMonthMrr = 0;
    let openLeads = 0;
    for (const l of all) {
      perStage[l.stage as LeadStage]++;
      const mrr = l.monthlyDealValue || 0;
      if (l.stage === 'proposal_sent') pipelineMrr += mrr;
      if (l.stage === 'closed_won') {
        activeMrr += mrr;
        if (l.closedAt && new Date(l.closedAt) >= startOfMonth) {
          wonThisMonth++;
          wonThisMonthMrr += mrr;
        }
      }
      if (
        l.stage === 'new' ||
        l.stage === 'no_show' ||
        l.stage === 'proposal_sent'
      ) {
        openLeads++;
      }
    }
    return {
      pipelineMrr,
      activeMrr,
      wonThisMonth,
      wonThisMonthMrr,
      openLeads,
      perStage,
    };
  }

  private async assertAccess(
    lead: { ownerId?: Types.ObjectId | { _id?: unknown } | null },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (isAdmin(user.role)) return;
    const owner = lead.ownerId;
    const ownerId =
      owner && typeof owner === 'object' && '_id' in owner
        ? String((owner as { _id: unknown })._id)
        : owner
          ? String(owner)
          : '';
    if (ownerId !== user.userId) {
      throw new ForbiddenException('You do not have access to this lead.');
    }
  }
}
