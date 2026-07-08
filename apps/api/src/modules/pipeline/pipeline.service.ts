import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { CommsService } from '../comms/comms.service';
import { AiWriterService } from '../comms/ai-writer.service';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @InjectModel(Lead.name) private readonly model: Model<LeadDocument>,
    private readonly audit: ActivityLogService,
    private readonly comms: CommsService,
    private readonly ai: AiWriterService,
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

  // --- Reactivation cron (Slice 4.6) --------------------------------------

  /**
   * Weekly sweep of closed_lost leads that are 30+ days old with no
   * reactivation attempt yet. For each, AI-drafts a personalized
   * win-back email, sends it through the assigned owner's Gmail, then
   * moves the lead back to 'new' so it re-enters the pipeline.
   *
   * Fires Mondays at 9am. Skips silently when ANTHROPIC_API_KEY isn't
   * set — the drafter needs it. Any lead that already carries a
   * "reactivation-attempted" activity entry is left alone so a single
   * lead never gets re-engaged twice by this cron.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async reactivateStaleLostLeads(): Promise<void> {
    if (!this.ai.isConfigured()) {
      this.logger.debug(
        'Reactivation cron skipped — ANTHROPIC_API_KEY not set.',
      );
      return;
    }
    try {
      const cutoff = new Date(Date.now() - 30 * 86400 * 1000);
      const candidates = await this.model
        .find({
          stage: 'closed_lost',
          closedAt: { $lte: cutoff },
        })
        .populate('ownerId', 'email')
        .exec();
      const eligible = candidates.filter(
        (l) =>
          !(l.activity ?? []).some(
            (a) => a.kind === 'note' && (a.text || '').includes('reactivation-attempted'),
          ),
      );
      if (eligible.length === 0) return;
      this.logger.log(
        `Reactivating ${eligible.length} stale closed_lost lead(s).`,
      );
      for (const lead of eligible) {
        await this.attemptReactivation(lead);
      }
    } catch (e) {
      this.logger.error(
        `Reactivation cron failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
    }
  }

  private async attemptReactivation(lead: LeadDocument): Promise<void> {
    if (!lead.email) return;
    const owner = lead.ownerId as unknown as {
      _id?: Types.ObjectId;
      email?: string;
    } | null;
    const ownerUserId = owner?._id?.toString();
    if (!ownerUserId) return;

    // Draft with Claude — reuse the SEO email prompt shape as a base.
    // Reason-lost is captured on the closedReason field; feed it into
    // notes so the AI can address it explicitly.
    const daysSinceLost = Math.floor(
      (Date.now() - new Date(lead.closedAt || Date.now()).getTime()) / 86400000,
    );
    let draft: { subject: string; htmlBody: string };
    try {
      draft = await this.ai.draftSeoEmail({
        clientName: lead.businessName,
        clientDomain: lead.website,
        periodLabel: 'a light re-engagement',
        kpis: {},
        actionsCompleted: [],
        notes: [
          `This was a closed_lost lead ${daysSinceLost} days ago.`,
          lead.closedReason ? `Reason lost: ${lead.closedReason}` : '',
          'The email should be a warm, short win-back — NOT a proposal or a status update. Reference the reason politely if given. End with an easy no-pressure ask to reconnect.',
        ]
          .filter(Boolean)
          .join('\n'),
        signOff: 'Media Spearhead',
      });
    } catch (e) {
      this.logger.warn(
        `Reactivation draft failed for lead ${lead._id}: ${(e as Error).message}`,
      );
      return;
    }

    const { result } = await this.comms.send(
      { userId: ownerUserId, email: owner?.email || '', role: 'strategist' },
      {
        kind: 'lead-reactivation',
        to: [lead.email],
        subject: draft.subject,
        htmlBody: draft.htmlBody,
      },
    );
    if (!result.ok) {
      this.logger.warn(
        `Reactivation send failed for lead ${lead._id}: ${result.error}`,
      );
      return;
    }
    // Move lead back to 'new' and record the attempt so this cron
    // never touches it again.
    lead.activity.push({
      at: new Date(),
      kind: 'note',
      authorName: 'system',
      text: 'reactivation-attempted (auto)',
    } as never);
    lead.activity.push({
      at: new Date(),
      kind: 'stage-change',
      authorName: 'system',
      fromStage: 'closed_lost',
      toStage: 'new',
      text: 'Auto-reactivated by weekly cron',
    } as never);
    lead.stage = 'new';
    lead.closedAt = undefined;
    lead.closedReason = undefined;
    await lead.save();
    await this.audit.log({
      userId: ownerUserId,
      action: 'lead.reactivated',
      targetType: 'Lead',
      targetId: String(lead._id),
      details: {
        businessName: lead.businessName,
        daysSinceLost,
      },
    });
  }
}
