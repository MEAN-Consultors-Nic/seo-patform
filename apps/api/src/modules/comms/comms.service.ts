import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GmailService, GmailSendResult } from './gmail.service';
import { SentEmail, SentEmailDocument } from './sent-email.schema';
import { SendEmailDto } from './dto/send-email.dto';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { AuthenticatedUser } from '../auth/roles.guard';

/**
 * Business logic wrapper around Gmail send: enforces admin BCC for
 * audit, persists the archive row, emits an activity-log event on
 * both success and failure.
 */
@Injectable()
export class CommsService {
  private readonly logger = new Logger(CommsService.name);

  constructor(
    private readonly gmail: GmailService,
    @InjectModel(SentEmail.name)
    private readonly archive: Model<SentEmailDocument>,
    private readonly audit: ActivityLogService,
  ) {}

  async send(
    user: AuthenticatedUser,
    dto: SendEmailDto,
  ): Promise<{ archive: SentEmail; result: GmailSendResult }> {
    // Always BCC admin@ so we retain an audit copy of every outbound
    // email. Configurable via env override once we outgrow the single
    // admin address.
    const auditBcc = (process.env.ADMIN_AUDIT_EMAIL || '').trim();
    const bcc = [...(dto.bcc ?? [])];
    if (auditBcc && !bcc.includes(auditBcc)) bcc.push(auditBcc);

    const result = await this.gmail.send({
      userId: user.userId,
      to: dto.to,
      cc: dto.cc,
      bcc,
      subject: dto.subject,
      htmlBody: dto.htmlBody,
      textBody: dto.textBody,
      attachments: dto.attachments,
      replyTo: dto.replyTo,
    });

    const doc = await this.archive.create({
      senderUserId: new Types.ObjectId(user.userId),
      senderEmail: user.email,
      clientId: dto.clientId ? new Types.ObjectId(dto.clientId) : undefined,
      kind: dto.kind || 'general',
      subject: dto.subject,
      to: dto.to,
      cc: dto.cc || [],
      bcc,
      htmlBody: dto.htmlBody,
      textBody: dto.textBody,
      attachmentNames: (dto.attachments ?? []).map((a) => a.filename),
      gmailMessageId: result.messageId,
      ok: result.ok,
      errorMessage: result.error,
    });

    await this.audit.log({
      userId: user.userId,
      userEmail: user.email,
      action: result.ok ? 'email.sent' : 'email.failed',
      targetType: 'SentEmail',
      targetId: String(doc._id),
      details: {
        clientId: dto.clientId,
        kind: dto.kind || 'general',
        subject: dto.subject,
        recipientCount: dto.to.length,
        error: result.error,
      },
    });

    return { archive: doc.toObject(), result };
  }

  /**
   * Bulk-send roster (Slice 3.4). Returns the strategist's clients
   * with the last-sent-email timestamp joined in — sorted so clients
   * without any email (or with the oldest send) surface first. Powers
   * the "who needs an email today?" screen.
   */
  async bulkRoster(user: AuthenticatedUser, clientIds: Types.ObjectId[] | null) {
    const match: Record<string, unknown> = { ok: true };
    if (clientIds !== null) {
      match.clientId = { $in: clientIds };
    }
    const grouped = await this.archive.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$clientId',
          lastSentAt: { $max: '$createdAt' },
          lastSubject: { $last: '$subject' },
          lastKind: { $last: '$kind' },
          count: { $sum: 1 },
        },
      },
    ]);
    const byClient = new Map<
      string,
      {
        lastSentAt?: Date;
        lastSubject?: string;
        lastKind?: string;
        count: number;
      }
    >();
    for (const g of grouped) {
      if (!g._id) continue;
      byClient.set(String(g._id), {
        lastSentAt: g.lastSentAt,
        lastSubject: g.lastSubject,
        lastKind: g.lastKind,
        count: g.count,
      });
    }
    return { byClient: Object.fromEntries(byClient) };
  }

  /**
   * Archive listing. Filters by client, kind, or sender. Sorted by
   * most-recent first. Default limit 50, capped at 200 per request.
   */
  async list(filters: {
    clientId?: string;
    kind?: string;
    senderUserId?: string;
    limit?: number;
  }): Promise<SentEmail[]> {
    const q: Record<string, unknown> = {};
    if (filters.clientId) q.clientId = new Types.ObjectId(filters.clientId);
    if (filters.kind) q.kind = filters.kind;
    if (filters.senderUserId)
      q.senderUserId = new Types.ObjectId(filters.senderUserId);
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    return this.archive
      .find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderUserId', 'name email')
      .populate('clientId', 'name url')
      .lean()
      .exec() as never;
  }
}
