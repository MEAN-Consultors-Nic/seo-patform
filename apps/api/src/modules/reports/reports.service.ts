import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Client as ClientType, Cycle as CycleType, Report as ReportType } from '@seo/shared';
import { Report, ReportDocument } from './report.schema';
import { UpsertReportDto } from './dto/upsert-report.dto';
import { PdfService } from './pdf.service';
import { ClientsService } from '../clients/clients.service';
import { CyclesService } from '../cycles/cycles.service';
import { TasksService } from '../tasks/tasks.service';
import { KeywordsService } from '../keywords/keywords.service';
import { BacklinksService } from '../backlinks/backlinks.service';
import { MailService } from '../mail/mail.service';

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const PDF_UNLOCK_TTL = '5m';
const SESSION_TTL = '24h';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private readonly model: Model<ReportDocument>,
    private readonly clients: ClientsService,
    private readonly cycles: CyclesService,
    private readonly tasks: TasksService,
    private readonly keywords: KeywordsService,
    private readonly backlinks: BacklinksService,
    private readonly pdf: PdfService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly configSvc: ConfigService,
  ) {}

  private generatePin(): string {
    // 6-digit numeric PIN, leading zeros allowed.
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  async findByClient(clientId: string) {
    return this.model
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ generatedAt: -1 })
      .lean()
      .exec();
  }

  async ensureShareToken(clientId: string, cycleId: string) {
    const report = await this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        cycleId: new Types.ObjectId(cycleId),
      })
      .exec();
    if (!report)
      throw new NotFoundException(
        'Report does not exist. Save it before sharing.',
      );
    let pin: string | undefined;
    if (!report.shareToken) {
      report.shareToken = randomBytes(18).toString('base64url');
      report.sharedAt = new Date();
      pin = this.generatePin();
      report.sharePinHash = await bcrypt.hash(pin, 10);
      report.pinAttempts = 0;
      report.pinLockedUntil = undefined;
      await report.save();
    }
    return {
      shareToken: report.shareToken,
      sharedAt: report.sharedAt,
      pin, // Only present when the token was just created. Show ONCE.
      pinProtected: !!report.sharePinHash,
    };
  }

  async sendNotification(
    clientId: string,
    cycleId: string,
    recipients: string[],
  ) {
    if (!this.mail.isReady()) {
      throw new BadRequestException(
        'Email service is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in the API .env file.',
      );
    }
    const cleanRecipients = Array.from(
      new Set(
        recipients
          .map((r) => r.trim().toLowerCase())
          .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)),
      ),
    );
    if (!cleanRecipients.length) {
      throw new BadRequestException(
        'No valid recipients provided. Add at least one email address.',
      );
    }
    const report = await this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        cycleId: new Types.ObjectId(cycleId),
      })
      .exec();
    if (!report) throw new NotFoundException('Report not found');
    if (!report.shareToken) {
      throw new BadRequestException(
        'Generate the share link first before sending the notification.',
      );
    }

    // Always regenerate the PIN on send.
    const pin = this.generatePin();
    report.sharePinHash = await bcrypt.hash(pin, 10);
    report.pinAttempts = 0;
    report.pinLockedUntil = undefined;
    await report.save();

    const [client, cycle] = await Promise.all([
      this.clients.findOne(clientId),
      this.cycles.findOne(cycleId),
    ]);
    const webBase = (
      this.configSvc.get<string>('PUBLIC_WEB_URL') || 'http://localhost:4200'
    ).replace(/\/+$/, '');
    const reportUrl = `${webBase}/r/${report.shareToken}`;

    const result = await this.mail.sendReportNotification({
      recipients: cleanRecipients,
      clientName: client.name,
      cycleLabel: cycle.label,
      cycleStart: new Date(cycle.startDate),
      cycleEnd: new Date(cycle.endDate),
      reportUrl,
      pin,
      preparedBy:
        this.configSvc.get<string>('SMTP_FROM_NAME') || 'Media Spearhead',
    });

    return {
      sentTo: result.sentTo,
      messageId: result.messageId,
    };
  }

  async regeneratePin(clientId: string, cycleId: string) {
    const report = await this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        cycleId: new Types.ObjectId(cycleId),
      })
      .exec();
    if (!report || !report.shareToken)
      throw new NotFoundException('Active share link not found.');
    const pin = this.generatePin();
    report.sharePinHash = await bcrypt.hash(pin, 10);
    report.pinAttempts = 0;
    report.pinLockedUntil = undefined;
    await report.save();
    return { pin };
  }

  async revokeShareToken(clientId: string, cycleId: string) {
    const result = await this.model
      .updateOne(
        {
          clientId: new Types.ObjectId(clientId),
          cycleId: new Types.ObjectId(cycleId),
        },
        {
          $unset: {
            shareToken: '',
            sharedAt: '',
            sharePinHash: '',
            pinLockedUntil: '',
          },
          $set: { pinAttempts: 0 },
        },
      )
      .exec();
    if (result.matchedCount === 0)
      throw new NotFoundException('Report not found');
    return { revoked: true };
  }

  async findByShareToken(token: string) {
    const report = await this.model.findOne({ shareToken: token }).lean().exec();
    if (!report)
      throw new NotFoundException('Share link not found or has been revoked');
    return report;
  }

  async getPublicMeta(token: string) {
    const report = await this.findByShareToken(token);
    const [client, cycle] = await Promise.all([
      this.clients.findOne(report.clientId.toString()),
      this.cycles.findOne(report.cycleId.toString()),
    ]);
    return {
      locked: !!report.sharePinHash,
      client: { name: client.name, url: client.url, industry: client.industry },
      cycle: {
        label: cycle.label,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      },
    };
  }

  async verifyPin(token: string, pin: string) {
    const doc = await this.model.findOne({ shareToken: token }).exec();
    if (!doc) throw new NotFoundException('Share link not found');
    if (!doc.sharePinHash) {
      // No PIN configured — treat as legacy link, no unlock required.
      return {
        pdfUnlockToken: this.signPdfUnlock(token),
        sessionToken: this.signSession(token),
        payload: await this.getPublicPayload(token),
      };
    }
    if (doc.pinLockedUntil && doc.pinLockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil(
        (doc.pinLockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Too many wrong attempts. Try again in ${minutes} minute(s).`,
      );
    }
    const ok = await bcrypt.compare(pin, doc.sharePinHash);
    if (!ok) {
      doc.pinAttempts = (doc.pinAttempts || 0) + 1;
      if (doc.pinAttempts >= MAX_PIN_ATTEMPTS) {
        doc.pinLockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60_000);
        doc.pinAttempts = 0;
        await doc.save();
        throw new ForbiddenException(
          `Too many wrong attempts. Locked for ${PIN_LOCK_MINUTES} minutes.`,
        );
      }
      await doc.save();
      const remaining = MAX_PIN_ATTEMPTS - doc.pinAttempts;
      throw new UnauthorizedException(
        `Incorrect PIN. ${remaining} attempt(s) remaining.`,
      );
    }
    // Success: reset counters
    doc.pinAttempts = 0;
    doc.pinLockedUntil = undefined;
    await doc.save();
    const payload = await this.getPublicPayload(token);
    return {
      pdfUnlockToken: this.signPdfUnlock(token),
      sessionToken: this.signSession(token),
      payload,
    };
  }

  async resumeWithSession(token: string, session: string) {
    this.verifySession(session, token);
    return {
      pdfUnlockToken: this.signPdfUnlock(token),
      sessionToken: session,
      payload: await this.getPublicPayload(token),
    };
  }

  async previewByShareToken(
    token: string,
    user: { userId: string; role: 'root' | 'seo-manager' | 'seo-strategist' },
  ) {
    const report = await this.model
      .findOne({ shareToken: token })
      .lean()
      .exec();
    if (!report)
      throw new NotFoundException('Share link not found or has been revoked');
    // Verifies role-based / owner-based access (throws Forbidden otherwise).
    await this.clients.assertAccess(report.clientId.toString(), user as never);
    return {
      pdfUnlockToken: this.signPdfUnlock(token),
      sessionToken: this.signSession(token),
      payload: await this.getPublicPayload(token),
    };
  }

  private signPdfUnlock(token: string): string {
    return this.jwt.sign(
      { shareToken: token, kind: 'pdf-unlock' },
      { expiresIn: PDF_UNLOCK_TTL },
    );
  }

  private signSession(token: string): string {
    return this.jwt.sign(
      { shareToken: token, kind: 'report-session' },
      { expiresIn: SESSION_TTL },
    );
  }

  verifyPdfUnlock(unlock: string, token: string): void {
    try {
      const decoded = this.jwt.verify<{ shareToken: string; kind: string }>(unlock);
      if (decoded.kind !== 'pdf-unlock' || decoded.shareToken !== token) {
        throw new Error('Mismatched token');
      }
    } catch {
      throw new UnauthorizedException(
        'PDF download link expired or invalid. Re-enter PIN.',
      );
    }
  }

  private verifySession(session: string, token: string): void {
    try {
      const decoded = this.jwt.verify<{ shareToken: string; kind: string }>(session);
      if (decoded.kind !== 'report-session' || decoded.shareToken !== token) {
        throw new Error('Mismatched session');
      }
    } catch {
      throw new UnauthorizedException(
        'Report session expired. Re-enter PIN.',
      );
    }
  }

  async getPublicPayload(token: string) {
    const report = await this.findByShareToken(token);
    const [client, cycle, tasks, keywords, movements, backlinksSummary, history] =
      await Promise.all([
        this.clients.findOne(report.clientId.toString()),
        this.cycles.findOne(report.cycleId.toString()),
        this.tasks.findAll({
          clientId: report.clientId.toString(),
          cycleId: report.cycleId.toString(),
        }),
        this.keywords.byClient(report.clientId.toString()),
        this.keywords.movements(report.clientId.toString()),
        this.backlinks.summary(report.clientId.toString()),
        this.kpiHistory(report.clientId.toString(), 12),
      ]);
    return {
      report,
      client: {
        name: client.name,
        tier: client.tier,
        url: client.url,
        logoUrl: client.logoUrl,
        industry: client.industry,
      },
      cycle: {
        label: cycle.label,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      },
      tasks: tasks.map((t) => ({
        title: t.title,
        category: t.category,
        priority: t.priority,
        status: t.status,
        notes: t.notes,
        description: t.description,
        attachments: t.attachments,
      })),
      keywords: keywords.map((k) => ({
        text: k.text,
        group: k.group,
        volume: k.volume,
        currentPosition: k.currentPosition,
        previousPosition: k.previousPosition,
        bestPosition: k.bestPosition,
        currentRankingUrl: k.currentRankingUrl,
      })),
      movements: {
        gainers: movements.gainers.slice(0, 10).map((m) => ({
          keyword: {
            text: m.keyword.text,
            currentPosition: m.keyword.currentPosition,
          },
          delta: m.delta,
        })),
        losers: movements.losers.slice(0, 10).map((m) => ({
          keyword: {
            text: m.keyword.text,
            currentPosition: m.keyword.currentPosition,
          },
          delta: m.delta,
        })),
        fresh: movements.fresh.slice(0, 10).map((m) => ({
          keyword: {
            text: m.keyword.text,
            currentPosition: m.keyword.currentPosition,
          },
          delta: m.delta,
        })),
      },
      backlinks: backlinksSummary,
      kpiHistory: history,
    };
  }

  async generatePdfByToken(token: string): Promise<Buffer> {
    const report = await this.findByShareToken(token);
    return this.generatePdf(report.clientId.toString(), report.cycleId.toString());
  }

  async kpiHistory(clientId: string, limit = 6) {
    const reports = await this.model
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ generatedAt: -1 })
      .limit(limit)
      .populate('cycleId', 'label startDate endDate')
      .lean()
      .exec();
    return reports
      .reverse()
      .map((r) => ({
        cycleLabel: (r.cycleId as unknown as { label?: string })?.label,
        generatedAt: r.generatedAt,
        kpis: r.kpis,
      }));
  }

  async findOneByCycle(clientId: string, cycleId: string) {
    return this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        cycleId: new Types.ObjectId(cycleId),
      })
      .lean()
      .exec();
  }

  async upsert(dto: UpsertReportDto) {
    // Build $set with only the fields that are explicitly provided
    // so partial updates (e.g. auto-compose only sets text fields) don't wipe KPIs.
    const $set: Record<string, unknown> = { generatedAt: new Date() };
    if (dto.kpis !== undefined) {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(dto.kpis)) {
        if (typeof v === 'number' && !Number.isNaN(v)) cleaned[k] = v;
      }
      $set.kpis = cleaned;
    }
    if (dto.kpisPrevious !== undefined) $set.kpisPrevious = dto.kpisPrevious;
    if (dto.coverImageUrl !== undefined) $set.coverImageUrl = dto.coverImageUrl;
    if (dto.executiveSummary !== undefined) $set.executiveSummary = dto.executiveSummary;
    if (dto.findings !== undefined) $set.findings = dto.findings;
    if (dto.nextPeriodPlan !== undefined) $set.nextPeriodPlan = dto.nextPeriodPlan;
    if (dto.clientBlockers !== undefined) $set.clientBlockers = dto.clientBlockers;
    if (dto.finalConsiderations !== undefined) $set.finalConsiderations = dto.finalConsiderations;

    // Determine kpisPrevious for $setOnInsert (only used when creating new doc):
    // - First try: KPIs from the previous cycle's report
    // - Fallback: client baseline KPIs
    const setOnInsert: Record<string, unknown> = {
      clientId: new Types.ObjectId(dto.clientId),
      cycleId: new Types.ObjectId(dto.cycleId),
    };
    if (dto.kpisPrevious === undefined) {
      const previousKpis = await this.derivePreviousKpis(dto.clientId, dto.cycleId);
      if (previousKpis) setOnInsert.kpisPrevious = previousKpis;
    }

    return this.model
      .findOneAndUpdate(
        {
          clientId: new Types.ObjectId(dto.clientId),
          cycleId: new Types.ObjectId(dto.cycleId),
        },
        {
          $set,
          $setOnInsert: setOnInsert,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
  }

  private async derivePreviousKpis(
    clientId: string,
    cycleId: string,
  ): Promise<Record<string, number> | null> {
    // Find the cycle to know its startDate
    const cycle = await this.cycles.findOne(cycleId).catch(() => null);
    if (!cycle) return null;

    // Look for the most recent report from THIS client with a cycle that starts BEFORE current
    const prevReport = await this.model
      .aggregate([
        { $match: { clientId: new Types.ObjectId(clientId) } },
        {
          $lookup: {
            from: 'cycles',
            localField: 'cycleId',
            foreignField: '_id',
            as: 'cycle',
          },
        },
        { $unwind: '$cycle' },
        { $match: { 'cycle.startDate': { $lt: cycle.startDate } } },
        { $sort: { 'cycle.startDate': -1 } },
        { $limit: 1 },
      ])
      .exec();

    if (prevReport.length && prevReport[0].kpis && Object.keys(prevReport[0].kpis).length) {
      return prevReport[0].kpis;
    }

    // No prior report — fall back to client baseline
    const client = await this.clients.findOne(clientId).catch(() => null);
    const baseline = client?.baselineKpis;
    if (baseline && Object.keys(baseline).length) {
      return baseline as Record<string, number>;
    }
    return null;
  }

  async autoCompose(clientId: string, cycleId: string) {
    const tasks = await this.tasks.findAll({ clientId, cycleId });
    const completed = tasks.filter((t) => t.status === 'completed');
    const planned = tasks.filter((t) => t.status !== 'completed');
    const findings = completed.length
      ? completed
          .map((t) => `• ${t.title}${t.notes ? ` — ${t.notes}` : ''}`)
          .join('\n')
      : 'No actions closed in this period.';
    const nextPeriodPlan = planned.length
      ? planned.map((t) => `• [${t.priority}] ${t.title}`).join('\n')
      : 'No pending tasks registered.';
    const lines: string[] = [];
    if (completed.length) {
      lines.push(`${completed.length} SEO actions executed during the period`);
    }
    if (planned.length) lines.push(`${planned.length} actions remain in pipeline for the next cycle`);
    const exec = lines.join('. ') + (lines.length ? '.' : '');
    // Only set executiveSummary if there's no existing one (don't overwrite user-written intro)
    const existing = await this.findOneByCycle(clientId, cycleId);
    const dto: Parameters<typeof this.upsert>[0] = {
      clientId,
      cycleId,
      findings,
      nextPeriodPlan,
    };
    if (!existing?.executiveSummary || typeof existing.executiveSummary !== 'string' || !existing.executiveSummary.trim()) {
      dto.executiveSummary = exec;
    }
    return this.upsert(dto);
  }

  async generatePdf(clientId: string, cycleId: string): Promise<Buffer> {
    const [client, cycle, report, tasks, keywords, movements, backlinksSummary] =
      await Promise.all([
        this.clients.findOne(clientId),
        this.cycles.findOne(cycleId),
        this.findOneByCycle(clientId, cycleId),
        this.tasks.findAll({ clientId, cycleId }),
        this.keywords.byClient(clientId),
        this.keywords.movements(clientId),
        this.backlinks.summary(clientId),
      ]);
    if (!report)
      throw new NotFoundException(
        'Report for that client/cycle does not exist yet. Save it first.',
      );
    return this.pdf.generate(
      client as unknown as ClientType,
      cycle as unknown as CycleType,
      report as unknown as ReportType,
      {
        tasks: tasks as unknown as Array<{
          title: string;
          category: string;
          status: string;
          priority: string;
          estimatedHours?: number;
          actualHours?: number;
          notes?: string;
          description?: string;
        }>,
        keywords: keywords as unknown as Array<{
          text: string;
          group?: string;
          currentPosition?: number;
          previousPosition?: number;
          currentRankingUrl?: string;
          volume?: number;
        }>,
        gainers: movements.gainers,
        losers: movements.losers,
        backlinks: backlinksSummary,
      },
    );
  }
}
