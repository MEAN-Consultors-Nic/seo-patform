import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
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
    if (!doc.shareToken) {
      doc.shareToken = randomBytes(16).toString('base64url');
      doc.sharePin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    }
    doc.status = 'sent';
    doc.sentAt = new Date();
    doc.expiresAt = new Date(Date.now() + 30 * 86400 * 1000);
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
}
