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
import { randomBytes, randomInt } from 'crypto';
import { computeProposalTotals } from '@seo/shared';
import { Proposal, ProposalDocument } from './proposal.schema';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { SendProposalDto, UpdateProposalDto } from './dto/update-proposal.dto';
import {
  AuthenticatedUser,
  isAdmin,
  isManagerOrAbove,
} from '../auth/roles.guard';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { CommsService } from '../comms/comms.service';

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    @InjectModel(Proposal.name)
    private readonly model: Model<ProposalDocument>,
    private readonly audit: ActivityLogService,
    private readonly comms: CommsService,
  ) {}

  private async ownershipFilter(
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown>> {
    if (isAdmin(user.role)) return {};
    return { senderUserId: new Types.ObjectId(user.userId) };
  }

  async list(user: AuthenticatedUser, filters: { status?: string } = {}) {
    const q: Record<string, unknown> = await this.ownershipFilter(user);
    if (filters.status) q.status = filters.status;
    return this.model
      .find(q)
      .populate('senderUserId', 'name email')
      .populate('leadId', 'businessName stage')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const doc = await this.model
      .findById(id)
      .populate('senderUserId', 'name email')
      .populate('leadId', 'businessName stage')
      .lean()
      .exec();
    if (!doc) throw new NotFoundException(`Proposal ${id} not found`);
    await this.assertAccess(doc, user);
    return doc;
  }

  async create(dto: CreateProposalDto, user: AuthenticatedUser) {
    const doc = await this.model.create({
      ...dto,
      leadId: dto.leadId ? new Types.ObjectId(dto.leadId) : undefined,
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : undefined,
      senderUserId: new Types.ObjectId(user.userId),
      status: 'draft',
    });
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'proposal.created',
      targetType: 'Proposal',
      targetId: String(doc._id),
      details: { title: doc.title, businessName: doc.businessName },
    });
    return doc.toObject();
  }

  async update(id: string, dto: UpdateProposalDto, user: AuthenticatedUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Proposal ${id} not found`);
    await this.assertAccess(doc, user);
    if (doc.status !== 'draft' && !isManagerOrAbove(user.role)) {
      throw new BadRequestException(
        'Only draft proposals can be edited freely. Once sent, ask a manager to open it back up.',
      );
    }
    const patch: Record<string, unknown> = { ...dto };
    if (dto.leadId) patch.leadId = new Types.ObjectId(dto.leadId);
    if (dto.clientId) patch.clientId = new Types.ObjectId(dto.clientId);
    Object.assign(doc, patch);
    await doc.save();
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'proposal.updated',
      targetType: 'Proposal',
      targetId: id,
      details: { fields: Object.keys(patch) },
    });
    return doc.toObject();
  }

  async remove(id: string, user: AuthenticatedUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Proposal ${id} not found`);
    await this.assertAccess(doc, user);
    if (doc.status !== 'draft' && !isAdmin(user.role)) {
      throw new BadRequestException(
        'Cannot delete a proposal that has been sent. Ask an admin.',
      );
    }
    await doc.deleteOne();
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'proposal.deleted',
      targetType: 'Proposal',
      targetId: id,
      details: { title: doc.title },
    });
    return { deleted: true };
  }

  /**
   * Marks a proposal as sent, provisions a share token + PIN, and
   * dispatches an email to the recipient via the Comms module (the
   * sender's own Gmail connection). Body includes the share link and
   * a short summary; PDF attachment is a future enhancement.
   */
  async send(id: string, dto: SendProposalDto, user: AuthenticatedUser) {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Proposal ${id} not found`);
    await this.assertAccess(doc, user);
    if (!doc.items?.length) {
      throw new BadRequestException(
        'Proposal has no line items. Add at least one before sending.',
      );
    }

    // Provision share token + PIN if the proposal hasn't been sent
    // before. Re-sending keeps the same link so the client's bookmark
    // stays valid.
    const firstSend = !doc.shareToken;
    if (firstSend) {
      doc.shareToken = randomBytes(16).toString('base64url');
      doc.sharePin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    }
    doc.status = 'sent';
    doc.sentAt = new Date();
    doc.expiresAt = new Date(Date.now() + 30 * 86400 * 1000);
    // Auto follow-up schedule: 24h / 48h / 7d. Only created on the
    // first send; re-sending doesn't stack a second cadence on top.
    if (firstSend) {
      const now = Date.now();
      doc.followups = [
        {
          tier: '24h',
          scheduledAt: new Date(now + 24 * 3600 * 1000),
          status: 'pending',
        } as never,
        {
          tier: '48h',
          scheduledAt: new Date(now + 48 * 3600 * 1000),
          status: 'pending',
        } as never,
        {
          tier: '7d',
          scheduledAt: new Date(now + 7 * 24 * 3600 * 1000),
          status: 'pending',
        } as never,
      ];
    }
    await doc.save();

    const webBase =
      (process.env.PUBLIC_WEB_URL || 'http://localhost:4200').replace(/\/$/, '');
    const link = `${webBase}/p/${doc.shareToken}`;
    const totals = computeProposalTotals(doc.items as never);
    const summaryLines: string[] = [];
    if (totals.oneTime) summaryLines.push(`One-time: $${totals.oneTime.toFixed(0)}`);
    if (totals.monthly) summaryLines.push(`Monthly: $${totals.monthly.toFixed(0)}`);
    if (totals.annual) summaryLines.push(`Annual: $${totals.annual.toFixed(0)}`);

    const subject = dto.subject?.trim() || `${doc.title} — proposal`;
    const message = dto.message?.trim() || '';
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#0F172A">
      <p>Hi ${doc.contactName || 'there'},</p>
      ${message ? `<p>${this.escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
      <p>Here's your proposal from Media Spearhead:</p>
      <p><a href="${link}" style="background:#FF7A59;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:600;">View proposal</a></p>
      <p style="color:#6B7280;font-size:12px">Access PIN: <code>${doc.sharePin}</code></p>
      ${summaryLines.length ? `<hr><p style="margin-top:12px"><strong>Summary</strong><br>${summaryLines.join('<br>')}</p>` : ''}
      <hr>
      <p style="color:#94A3B8;font-size:11px">— Media Spearhead</p>
    </div>`;

    const { result } = await this.comms.send(user, {
      clientId: doc.clientId?.toString(),
      kind: 'proposal',
      to: [dto.to],
      subject,
      htmlBody: html,
      textBody: `Hi ${doc.contactName || 'there'},\n\nView your proposal: ${link}\nAccess PIN: ${doc.sharePin}\n\n— Media Spearhead`,
    });

    if (!result.ok) {
      // Roll status back so the operator can retry without a stray
      // "sent" state that never landed.
      doc.status = 'draft';
      await doc.save();
      throw new BadRequestException(
        `Send failed: ${result.error || 'Gmail rejected the message.'}`,
      );
    }
    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: 'proposal.sent',
      targetType: 'Proposal',
      targetId: id,
      details: { to: dto.to, shareToken: doc.shareToken },
    });
    return { proposal: doc.toObject(), shareUrl: link };
  }

  /** Public: token lookup for the /p/:token page. Records viewedAt. */
  async findByShareToken(token: string) {
    const doc = await this.model.findOne({ shareToken: token }).exec();
    if (!doc) throw new NotFoundException('Proposal not found or expired.');
    if (!doc.viewedAt) {
      doc.viewedAt = new Date();
      if (doc.status === 'sent') doc.status = 'viewed';
      await doc.save();
    }
    return doc.toObject();
  }

  /** Public: client marks the proposal as signed. Idempotent. */
  async publicSign(token: string, pin: string) {
    const doc = await this.model.findOne({ shareToken: token }).exec();
    if (!doc) throw new NotFoundException('Proposal not found.');
    if (doc.sharePin && pin !== doc.sharePin) {
      throw new ForbiddenException('Access PIN does not match.');
    }
    if (doc.status === 'signed') return doc.toObject();
    doc.status = 'signed';
    doc.signedAt = new Date();
    // Cancel any pending follow-ups — the deal is closed.
    for (const f of doc.followups ?? []) {
      if (f.status === 'pending') f.status = 'cancelled';
    }
    await doc.save();
    return doc.toObject();
  }

  private async assertAccess(
    doc: { senderUserId?: Types.ObjectId | null },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (isAdmin(user.role)) return;
    const owner = doc.senderUserId?.toString();
    if (owner !== user.userId) {
      throw new ForbiddenException('You do not have access to this proposal.');
    }
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Auto follow-up cron -----------------------------------------------

  /**
   * Every 30 minutes: find any proposal whose status is still sent/
   * viewed with a follow-up scheduled at or before now. Fire the
   * email, mark that follow-up sent (or failed), and move on.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async processDueFollowups(): Promise<void> {
    try {
      const now = new Date();
      const candidates = await this.model
        .find({
          status: { $in: ['sent', 'viewed'] },
          'followups.status': 'pending',
          'followups.scheduledAt': { $lte: now },
        })
        .populate('senderUserId', 'email')
        .exec();
      if (candidates.length === 0) return;
      this.logger.log(
        `Processing ${candidates.length} proposal(s) with due follow-ups.`,
      );
      for (const doc of candidates) {
        for (const f of doc.followups) {
          if (f.status !== 'pending') continue;
          if (f.scheduledAt.getTime() > now.getTime()) continue;
          await this.fireFollowup(doc, f);
        }
        await doc.save();
      }
    } catch (e) {
      this.logger.error(
        `Follow-up cron sweep failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
    }
  }

  private async fireFollowup(
    doc: ProposalDocument,
    f: {
      tier: '24h' | '48h' | '7d';
      status: string;
      sentAt?: Date;
      errorMessage?: string;
    },
  ): Promise<void> {
    if (!doc.email) {
      f.status = 'failed';
      f.errorMessage = 'No recipient email on proposal.';
      return;
    }
    const sender = doc.senderUserId as unknown as {
      _id?: Types.ObjectId;
      email?: string;
    } | null;
    const senderUserId = sender?._id?.toString();
    if (!senderUserId) {
      f.status = 'failed';
      f.errorMessage = 'Proposal has no sender assigned.';
      return;
    }
    const webBase =
      (process.env.PUBLIC_WEB_URL || 'http://localhost:4200').replace(/\/$/, '');
    const link = `${webBase}/p/${doc.shareToken}`;
    const body = this.buildFollowupBody(doc, f.tier, link);
    const subject = `Following up · ${doc.title}`;
    const { result } = await this.comms.send(
      { userId: senderUserId, email: sender?.email || '', role: 'strategist' },
      {
        clientId: doc.clientId?.toString(),
        kind: 'proposal-followup',
        to: [doc.email],
        subject,
        htmlBody: body.html,
        textBody: body.text,
      },
    );
    if (result.ok) {
      f.status = 'sent';
      f.sentAt = new Date();
      await this.audit.log({
        userId: senderUserId,
        action: 'proposal.followup-sent',
        targetType: 'Proposal',
        targetId: String(doc._id),
        details: { tier: f.tier, to: doc.email },
      });
    } else {
      f.status = 'failed';
      f.errorMessage = result.error;
      await this.audit.log({
        userId: senderUserId,
        action: 'proposal.followup-failed',
        targetType: 'Proposal',
        targetId: String(doc._id),
        details: { tier: f.tier, error: result.error },
      });
    }
  }

  private buildFollowupBody(
    doc: ProposalDocument,
    tier: '24h' | '48h' | '7d',
    link: string,
  ): { html: string; text: string } {
    const greeting = `Hi ${doc.contactName || 'there'},`;
    const tierBody: Record<string, string> = {
      '24h': `Wanted to make sure yesterday's proposal for ${doc.businessName} didn't get lost in your inbox. If you have any questions or want to jump on a quick call, just reply here.`,
      '48h': `Following up again on the proposal for ${doc.businessName}. Happy to walk you through the plan on a short call if that's easier than reading through the doc.`,
      '7d': `Checking in one more time on the proposal for ${doc.businessName}. If timing isn't right, no worries — let me know and I'll close the loop. Otherwise, here's the link one more time.`,
    };
    const closing = 'Media Spearhead';
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;line-height:1.5;color:#0F172A">
      <p>${greeting}</p>
      <p>${this.escapeHtml(tierBody[tier])}</p>
      <p><a href="${link}" style="background:#FF7A59;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:600;">View proposal</a></p>
      <hr>
      <p style="color:#94A3B8;font-size:11px">— ${closing}</p>
    </div>`;
    const text = `${greeting}\n\n${tierBody[tier]}\n\nView proposal: ${link}\n\n— ${closing}`;
    return { html, text };
  }
}
