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
import {
  Client as ClientType,
  Cycle as CycleType,
  Report as ReportType,
  ReportKpis,
  sanitizeText,
} from '@seo/shared';
import { Report, ReportDocument } from './report.schema';
import { UpsertReportDto } from './dto/upsert-report.dto';
import { PdfService } from './pdf.service';
import { WordService } from './word.service';
import { ClientsService } from '../clients/clients.service';
import { CyclesService } from '../cycles/cycles.service';
import { TasksService } from '../tasks/tasks.service';
import { KeywordsService } from '../keywords/keywords.service';
import { BacklinksService } from '../backlinks/backlinks.service';
import { MailService } from '../mail/mail.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { ContentService } from '../content/content.service';

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
    private readonly word: WordService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly appSettings: AppSettingsService,
    private readonly content: ContentService,
    private readonly configSvc: ConfigService,
  ) {}

  private generatePin(): string {
    // 6-digit numeric PIN, leading zeros allowed.
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  // --- Shared helpers for cycle-vs-range reports ---------------------------

  /**
   * Returns a Cycle-shaped object for any report, regardless of whether
   * it's anchored to a real Cycle document or carries a customRange.
   * Custom-range reports get a synthetic Cycle with a "May 1 – May 31,
   * 2026"-style label so PdfService / WordService / cover renderers
   * work without branching on report shape.
   */
  private async cycleLikeFor(report: {
    cycleId?: Types.ObjectId | string;
    customRange?: { from: Date | string; to: Date | string };
  }): Promise<{
    _id?: string;
    startDate: Date;
    endDate: Date;
    reportDueDate: Date;
    status: 'active' | 'reporting' | 'closed';
    label: string;
  }> {
    if (report.cycleId) {
      const cycle = await this.cycles.findOne(report.cycleId.toString());
      return cycle as never;
    }
    if (report.customRange) {
      const from = new Date(report.customRange.from);
      const to = new Date(report.customRange.to);
      return {
        startDate: from,
        endDate: to,
        reportDueDate: to,
        status: 'reporting',
        label: this.formatRangeLabel(from, to),
      };
    }
    throw new BadRequestException(
      'Report has neither cycleId nor customRange — cannot resolve a period.',
    );
  }

  private formatRangeLabel(from: Date, to: Date): string {
    const fmt = (d: Date, withYear: boolean) =>
      d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: withYear ? 'numeric' : undefined,
        timeZone: 'UTC',
      });
    const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
    return sameYear
      ? `${fmt(from, false)} – ${fmt(to, true)}`
      : `${fmt(from, true)} – ${fmt(to, true)}`;
  }

  /**
   * Inclusive date range used to filter cycle-scoped queries (tasks,
   * published content). Falls through to the cycle's window when the
   * report is cycle-anchored.
   */
  private async dateRangeFor(report: {
    cycleId?: Types.ObjectId | string;
    customRange?: { from: Date | string; to: Date | string };
  }): Promise<{ from: Date; to: Date }> {
    const c = await this.cycleLikeFor(report);
    return { from: new Date(c.startDate), to: new Date(c.endDate) };
  }

  /**
   * Filter object passed to tasks.findAll to scope to the report's
   * period. Cycle-anchored reports filter by cycleId (preserves legacy
   * behavior even if tasks were re-dated); custom-range reports filter
   * by completedAt within the window.
   */
  private taskFilterFor(report: {
    clientId: Types.ObjectId | string;
    cycleId?: Types.ObjectId | string;
    customRange?: { from: Date | string; to: Date | string };
  }): {
    clientId: string;
    cycleId?: string;
    completedFrom?: string;
    completedTo?: string;
  } {
    const clientId = report.clientId.toString();
    if (report.cycleId) {
      return { clientId, cycleId: report.cycleId.toString() };
    }
    const from = new Date(report.customRange!.from);
    const to = new Date(report.customRange!.to);
    return {
      clientId,
      completedFrom: from.toISOString(),
      completedTo: to.toISOString(),
    };
  }

  /**
   * Loads the tasks that feed a report's "Actions Taken" + "Next Period
   * Plan" sections. Cycle-anchored reports pull everything for the cycle
   * (existing behavior). Custom-range reports pull completed tasks from
   * the range window PLUS pending/in-progress tasks from the current
   * cycle — those are what will actually carry into the next period,
   * regardless of the report window the user picked.
   *
   * Dedupes by _id so a task that's both in the range AND in the current
   * cycle (rare, but possible for a same-day flip) only shows up once.
   */
  private async loadTasksForReport(report: {
    clientId: Types.ObjectId | string;
    cycleId?: Types.ObjectId | string;
    customRange?: { from: Date | string; to: Date | string };
  }): Promise<Awaited<ReturnType<TasksService['findAll']>>> {
    if (report.cycleId) {
      return this.tasks.findAll(this.taskFilterFor(report));
    }
    const clientId = report.clientId.toString();
    const from = new Date(report.customRange!.from);
    const to = new Date(report.customRange!.to);
    const completedInRange = await this.tasks.findAll({
      clientId,
      completedFrom: from.toISOString(),
      completedTo: to.toISOString(),
    });
    let pendingInCurrent: typeof completedInRange = [];
    try {
      const currentCycle = await this.cycles.getCurrent();
      const currentTasks = await this.tasks.findAll({
        clientId,
        cycleId: currentCycle._id.toString(),
      });
      pendingInCurrent = currentTasks.filter(
        (t) => t.status !== 'completed',
      );
    } catch {
      // No active cycle right now — nothing to carry over.
    }
    const seen = new Set(completedInRange.map((t) => String(t._id)));
    return [
      ...completedInRange,
      ...pendingInCurrent.filter((t) => !seen.has(String(t._id))),
    ];
  }

  /**
   * Looks up a report by primary key. Used by the custom-range editor
   * flow + every byId controller endpoint. The access check is enforced
   * on the resolved clientId so contributors only see their own clients'
   * reports.
   */
  async findOneById(
    reportId: string,
    user: { userId: string; role: 'root' | 'seo-manager' | 'seo-strategist' },
  ) {
    const doc = await this.model.findById(reportId).lean().exec();
    if (!doc) throw new NotFoundException('Report not found');
    await this.clients.assertAccess(doc.clientId.toString(), user as never);
    return this.sanitizeReportRichText(doc);
  }

  /**
   * findOrCreate for a custom-range report. When the caller picks the
   * same client + from + to that already has a report, we return the
   * existing document so any text/KPIs the user previously entered
   * survive across sessions. Only creates a new doc when there's no
   * match — that avoids duplicate rows and preserves work-in-progress.
   */
  async createCustomReport(
    clientId: string,
    from: string,
    to: string,
    user: { userId: string; role: 'root' | 'seo-manager' | 'seo-strategist' },
  ) {
    await this.clients.assertAccess(clientId, user as never);
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (!(fromDate instanceof Date) || isNaN(fromDate.getTime())) {
      throw new BadRequestException('Invalid "from" date.');
    }
    if (!(toDate instanceof Date) || isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid "to" date.');
    }
    if (fromDate > toDate) {
      throw new BadRequestException('"from" must be on or before "to".');
    }
    // End-of-day so a date string like '2026-06-25' includes everything
    // that happened that day. Applied AFTER validation so the equality
    // check for findOrCreate lookup is deterministic.
    toDate.setUTCHours(23, 59, 59, 999);

    // Try to reuse an existing report with the same range first.
    const clientOid = new Types.ObjectId(clientId);
    const existing = await this.model
      .findOne({
        clientId: clientOid,
        'customRange.from': fromDate,
        'customRange.to': toDate,
      })
      .lean()
      .exec();
    if (existing) return existing;

    const doc = await this.model.create({
      clientId: clientOid,
      customRange: { from: fromDate, to: toDate },
      kpis: {},
      executiveSummary: '',
      findings: '',
      nextPeriodPlan: '',
      clientBlockers: '',
      finalConsiderations: '',
      generatedAt: new Date(),
    });
    return doc.toObject();
  }

  /** Same as previousKpisForCycle but works on a loaded report doc — handles both modes. */
  async previousKpisForReport(report: {
    clientId: Types.ObjectId | string;
    cycleId?: Types.ObjectId | string;
    customRange?: { from: Date | string; to: Date | string };
    kpisPrevious?: ReportKpis;
  }): Promise<{
    kpisPrevious: ReportKpis | null;
    kpisPreviousSource: 'previous' | 'baseline' | null;
  }> {
    const clientId = report.clientId.toString();
    const client = await this.clients.findOne(clientId).catch(() => null);
    // Custom-range reports: an explicit previous-period pull (done by
    // clicking 'Pull KPIs from Google' in the editor) writes the
    // equal-length preceding window into kpisPrevious. Honor that first
    // — the user's fresh pull beats any inferred previous-report
    // lookup. Cycle-anchored reports still auto-compute so the delta
    // tracks the live prior-cycle number, not a snapshot.
    if (report.customRange && this.hasStoredKpisPrevious(report)) {
      const baseline = client?.baselineKpis;
      const merged =
        baseline && Object.keys(baseline).length > 0
          ? { ...baseline, ...report.kpisPrevious! }
          : report.kpisPrevious!;
      return { kpisPrevious: merged, kpisPreviousSource: 'previous' };
    }
    let priorKpis: ReportKpis | null = null;
    if (report.cycleId) {
      priorKpis = await this.findPriorCycleKpis(
        clientId,
        report.cycleId.toString(),
      );
    } else if (report.customRange) {
      priorKpis = await this.findPriorReportKpisByDate(
        clientId,
        new Date(report.customRange.from),
      );
    }
    if (priorKpis) {
      const baseline = client?.baselineKpis;
      const merged =
        baseline && Object.keys(baseline).length > 0
          ? { ...baseline, ...priorKpis }
          : priorKpis;
      return { kpisPrevious: merged, kpisPreviousSource: 'previous' };
    }
    const baseline = client?.baselineKpis;
    if (baseline && Object.keys(baseline).length > 0) {
      return { kpisPrevious: baseline, kpisPreviousSource: 'baseline' };
    }
    return { kpisPrevious: null, kpisPreviousSource: null };
  }

  private hasStoredKpisPrevious(report: {
    kpisPrevious?: ReportKpis;
  }): boolean {
    const kp = report.kpisPrevious;
    if (!kp) return false;
    return Object.values(kp).some(
      (v) => typeof v === 'number' && !Number.isNaN(v),
    );
  }

  /**
   * Finds the most recent report (cycle or custom) for this client whose
   * effective end-date is before the given date. Powers custom-range
   * 'previous period' comparisons.
   */
  private async findPriorReportKpisByDate(
    clientId: string,
    before: Date,
  ): Promise<ReportKpis | null> {
    const prior = await this.model
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
        // Effective end date: cycle.endDate when cycle-anchored, customRange.to otherwise.
        {
          $addFields: {
            effectiveEnd: {
              $cond: [
                { $gt: [{ $size: '$cycle' }, 0] },
                { $arrayElemAt: ['$cycle.endDate', 0] },
                '$customRange.to',
              ],
            },
          },
        },
        { $match: { effectiveEnd: { $lt: before } } },
        { $sort: { effectiveEnd: -1 } },
        { $limit: 1 },
      ])
      .exec();
    const kpis = prior[0]?.kpis as ReportKpis | undefined;
    if (kpis && Object.keys(kpis).length > 0) return kpis;
    return null;
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
      report.sharePin = pin;
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
    report.sharePin = pin;
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
    report.sharePin = pin;
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
            sharePin: '',
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

  // --- byId variants (used by custom-range reports + by-id endpoints) ------

  async ensureShareTokenById(reportId: string) {
    const report = await this.model.findById(reportId).exec();
    if (!report) throw new NotFoundException('Report not found.');
    let pin: string | undefined;
    if (!report.shareToken) {
      report.shareToken = randomBytes(18).toString('base64url');
      report.sharedAt = new Date();
      pin = this.generatePin();
      report.sharePin = pin;
      report.sharePinHash = await bcrypt.hash(pin, 10);
      report.pinAttempts = 0;
      report.pinLockedUntil = undefined;
      await report.save();
    }
    return {
      shareToken: report.shareToken,
      sharedAt: report.sharedAt,
      pin,
      pinProtected: !!report.sharePinHash,
    };
  }

  async regeneratePinById(reportId: string) {
    const report = await this.model.findById(reportId).exec();
    if (!report || !report.shareToken)
      throw new NotFoundException('Active share link not found.');
    const pin = this.generatePin();
    report.sharePin = pin;
    report.sharePinHash = await bcrypt.hash(pin, 10);
    report.pinAttempts = 0;
    report.pinLockedUntil = undefined;
    await report.save();
    return { pin };
  }

  async revokeShareTokenById(reportId: string) {
    const result = await this.model
      .updateOne(
        { _id: new Types.ObjectId(reportId) },
        {
          $unset: {
            shareToken: '',
            sharedAt: '',
            sharePinHash: '',
            sharePin: '',
            pinLockedUntil: '',
          },
          $set: { pinAttempts: 0 },
        },
      )
      .exec();
    if (result.matchedCount === 0)
      throw new NotFoundException('Report not found.');
    return { revoked: true };
  }

  async sendNotificationById(reportId: string, recipients: string[]) {
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
    const report = await this.model.findById(reportId).exec();
    if (!report) throw new NotFoundException('Report not found.');
    if (!report.shareToken) {
      throw new BadRequestException(
        'Generate the share link first before sending the notification.',
      );
    }
    const pin = this.generatePin();
    report.sharePin = pin;
    report.sharePinHash = await bcrypt.hash(pin, 10);
    report.pinAttempts = 0;
    report.pinLockedUntil = undefined;
    await report.save();

    const [client, cycle] = await Promise.all([
      this.clients.findOne(report.clientId.toString()),
      this.cycleLikeFor(report.toObject()),
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

    return { sentTo: result.sentTo, messageId: result.messageId };
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
      this.cycleLikeFor(report),
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
    const [
      client,
      cycle,
      tasks,
      keywords,
      movements,
      backlinksSummary,
      history,
      layout,
      contentIdeas,
    ] = await Promise.all([
      this.clients.findOne(report.clientId.toString()),
      this.cycleLikeFor(report),
      this.loadTasksForReport(report),
      this.keywords.byClient(report.clientId.toString()),
      this.keywords.movements(report.clientId.toString()),
      this.backlinks.summary(report.clientId.toString()),
      this.kpiHistory(report.clientId.toString(), 12),
      this.appSettings.getReportLayout(),
      this.content.list({
        clientId: report.clientId.toString(),
        status: 'idea',
      }),
    ]);

    // Pieces published during the report's period — fed into Actions Taken.
    const contentPublished = await this.content.publishedInRange(
      report.clientId.toString(),
      new Date(cycle.startDate),
      new Date(cycle.endDate),
    );

    // Recompute the "previous" comparison series at read time so changes
    // to the client baseline (or new prior-cycle reports) are reflected
    // without re-saving this report.
    const reportOut = this.sanitizeReportRichText(
      await this.applyKpisPreviousFallback(report, client),
    );

    return {
      report: reportOut,
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
      serviceAreas: await this.buildPublicServiceAreas(report),
      layout,
      contentIdeas: (contentIdeas ?? []).map((p) => ({
        title: p.title,
        targetKeyword: p.targetKeyword,
        targetUrl: p.targetUrl,
      })),
      contentPublished: contentPublished.map((p) => ({
        title: p.title,
        targetKeyword: p.targetKeyword,
        publishedUrl: p.publishedUrl,
        publishedAt: p.publishedAt,
      })),
    };
  }

  private async buildPublicServiceAreas(report: {
    clientId: Types.ObjectId | string;
    cycleId?: Types.ObjectId | string;
    includeServiceAreas?: boolean;
    serviceAreasSnapshot?: unknown;
  }) {
    if (!report.includeServiceAreas) return undefined;
    const current = Array.isArray(report.serviceAreasSnapshot)
      ? (report.serviceAreasSnapshot as Array<Record<string, unknown>>)
      : [];
    if (current.length === 0) return [];
    // Custom-range reports skip the 'previous period delta' because
    // there's no cycle to anchor the lookup against.
    const prev = report.cycleId
      ? await this.findPreviousServiceAreasSnapshot(
          report.clientId.toString(),
          report.cycleId.toString(),
        )
      : [];
    const prevByName = new Map<string, Record<string, unknown>>();
    for (const p of prev) {
      prevByName.set(String(p.name || '').toLowerCase(), p);
    }
    return current.map((a) => {
      const p = prevByName.get(String(a.name || '').toLowerCase());
      return {
        ...a,
        previous: p
          ? {
              clicks: Number(p.clicks ?? 0),
              impressions: Number(p.impressions ?? 0),
              ctr: Number(p.ctr ?? 0),
              position: Number(p.position ?? 0),
              rangeFrom: String(p.rangeFrom ?? ''),
              rangeTo: String(p.rangeTo ?? ''),
            }
          : undefined,
      };
    });
  }

  async generatePdfByToken(token: string): Promise<Buffer> {
    const report = await this.findByShareToken(token);
    if (report.cycleId) {
      return this.generatePdf(
        report.clientId.toString(),
        report.cycleId.toString(),
      );
    }
    return this.generatePdfById(String(report._id));
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
        // Cycle-anchored reports use the cycle's canonical label.
        // Custom-range reports synthesize one from their from/to dates so
        // the history chart still has a meaningful x-axis label.
        cycleLabel: r.cycleId
          ? (r.cycleId as unknown as { label?: string })?.label
          : r.customRange
            ? this.formatRangeLabel(
                new Date(r.customRange.from),
                new Date(r.customRange.to),
              )
            : undefined,
        generatedAt: r.generatedAt,
        kpis: r.kpis,
      }));
  }

  async findOneByCycle(clientId: string, cycleId: string) {
    const doc = await this.model
      .findOne({
        clientId: new Types.ObjectId(clientId),
        cycleId: new Types.ObjectId(cycleId),
      })
      .lean()
      .exec();
    return this.sanitizeReportRichText(doc);
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
    // Clean invisible/break-trigger characters from every rich-text field
    // BEFORE writing to Mongo. Soft hyphens (U+00AD) and zero-width chars
    // sneak in from Word / Google Docs pastes and cause mid-word line
    // breaks both in the rich-text editor and in the PDF.
    if (dto.executiveSummary !== undefined)
      $set.executiveSummary = this.stripInvisibleChars(dto.executiveSummary);
    if (dto.findings !== undefined)
      $set.findings = this.stripInvisibleChars(dto.findings);
    if (dto.nextPeriodPlan !== undefined)
      $set.nextPeriodPlan = this.stripInvisibleChars(dto.nextPeriodPlan);
    if (dto.clientBlockers !== undefined)
      $set.clientBlockers = this.stripInvisibleChars(dto.clientBlockers);
    if (dto.finalConsiderations !== undefined)
      $set.finalConsiderations = this.stripInvisibleChars(
        dto.finalConsiderations,
      );
    if (dto.includeServiceAreas !== undefined) $set.includeServiceAreas = dto.includeServiceAreas;
    if (dto.comparePeriods !== undefined) $set.comparePeriods = dto.comparePeriods;
    if (dto.locationsSort !== undefined) $set.locationsSort = dto.locationsSort;
    if (dto.hiddenKpis !== undefined) $set.hiddenKpis = dto.hiddenKpis;

    // Freeze the current Service Area metrics onto the report so future
    // edits to client.serviceAreas don't retroactively change historical
    // reports. The next report's getPublicPayload will diff against this
    // snapshot to surface a "vs. previous period" delta.
    if (dto.includeServiceAreas !== undefined) {
      $set.serviceAreasSnapshot = dto.includeServiceAreas
        ? await this.buildServiceAreasSnapshot(dto.clientId)
        : undefined;
    }

    // When reportId is provided, update by primary key instead of
    // upserting by (clientId, cycleId). This is the custom-range path —
    // and also works for cycle-anchored reports if the frontend prefers
    // to route updates by id.
    if (dto.reportId) {
      const updated = await this.model
        .findByIdAndUpdate(dto.reportId, { $set }, { new: true })
        .lean()
        .exec();
      if (!updated) throw new NotFoundException('Report not found.');
      return updated;
    }

    if (!dto.cycleId) {
      throw new BadRequestException(
        'Either cycleId or reportId must be provided to upsert a report.',
      );
    }

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

  /**
   * Recomputes the "previous period" comparison series on read so it tracks
   * the live state — not whatever was snapshotted into `kpisPrevious` at the
   * time the report was first saved. Priority:
   *   1. The most recent prior cycle's report kpis (true "previous period")
   *   2. Otherwise the client's current `baselineKpis` (first-cycle case —
   *      reflects edits made to the baseline after the report was created)
   *   3. Otherwise the stored `kpisPrevious` snapshot, if any
   *   4. Otherwise null
   * Stamps `kpisPreviousSource` so the UI can label deltas correctly.
   * Field-level merge: missing fields fall back to baseline values so a
   * partial prior snapshot doesn't leave the rest of the cards blank.
   */
  private async applyKpisPreviousFallback<
    R extends {
      _id?: unknown;
      clientId?: unknown;
      cycleId?: unknown;
      customRange?: { from: Date | string; to: Date | string };
      kpis?: ReportKpis;
      kpisPrevious?: ReportKpis;
      comparePeriods?: boolean;
    },
  >(
    report: R,
    client: { baselineKpis?: ReportKpis },
  ): Promise<R & { kpisPreviousSource?: 'previous' | 'baseline' | null }> {
    const out = report as R & {
      kpisPreviousSource?: 'previous' | 'baseline' | null;
    };

    // Respect the editor toggle. Defaulting to true so legacy reports
    // without the field keep showing comparisons.
    if (report.comparePeriods === false) {
      out.kpisPrevious = undefined;
      out.kpisPreviousSource = null;
      return out;
    }

    // Custom-range reports: if the user did a fresh Pull KPIs (which
    // includes the equal-length preceding window), that stored value
    // is authoritative and wins over the auto-recompute path.
    if (
      report.customRange &&
      this.hasStoredKpisPrevious(report as { kpisPrevious?: ReportKpis })
    ) {
      out.kpisPreviousSource = 'previous';
      return out;
    }

    const clientId = report.clientId ? String(report.clientId) : '';
    const cycleId = report.cycleId ? String(report.cycleId) : '';
    let priorCycleKpis: ReportKpis | null = null;
    if (clientId && cycleId) {
      priorCycleKpis = await this.findPriorCycleKpis(clientId, cycleId);
    } else if (clientId && report.customRange) {
      priorCycleKpis = await this.findPriorReportKpisByDate(
        clientId,
        new Date(report.customRange.from),
      );
    }
    const baseline = client.baselineKpis;
    const baselineHasValues =
      !!baseline && Object.keys(baseline).length > 0;

    if (priorCycleKpis) {
      // Use the prior cycle as the primary comparison; fill any field it
      // doesn't carry from the current baseline so cards never go blank
      // when both sources have some data.
      out.kpisPrevious = baselineHasValues
        ? { ...baseline, ...priorCycleKpis }
        : priorCycleKpis;
      out.kpisPreviousSource = 'previous';
      return out;
    }

    if (baselineHasValues) {
      out.kpisPrevious = baseline;
      out.kpisPreviousSource = 'baseline';
      return out;
    }

    const stored = out.kpisPrevious;
    if (stored && Object.keys(stored).length > 0) {
      out.kpisPreviousSource = 'previous';
    } else {
      out.kpisPreviousSource = null;
    }
    return out;
  }

  /**
   * Read-side resolver used by the report editor to preview comparisons
   * before a report is actually saved. Returns the comparison series
   * (prior cycle's kpis or current baseline) plus a source tag.
   */
  async previousKpisForCycle(
    clientId: string,
    cycleId: string,
  ): Promise<{
    kpisPrevious: ReportKpis | null;
    kpisPreviousSource: 'previous' | 'baseline' | null;
  }> {
    const [priorCycleKpis, client] = await Promise.all([
      this.findPriorCycleKpis(clientId, cycleId),
      this.clients.findOne(clientId).catch(() => null),
    ]);
    if (priorCycleKpis) {
      const baseline = client?.baselineKpis;
      const merged =
        baseline && Object.keys(baseline).length > 0
          ? { ...baseline, ...priorCycleKpis }
          : priorCycleKpis;
      return { kpisPrevious: merged, kpisPreviousSource: 'previous' };
    }
    const baseline = client?.baselineKpis;
    if (baseline && Object.keys(baseline).length > 0) {
      return { kpisPrevious: baseline, kpisPreviousSource: 'baseline' };
    }
    return { kpisPrevious: null, kpisPreviousSource: null };
  }

  private static readonly RICH_TEXT_FIELDS = [
    'executiveSummary',
    'findings',
    'nextPeriodPlan',
    'clientBlockers',
    'finalConsiderations',
  ] as const;

  /**
   * Read-time normalization. Runs the same sanitizer we use at save time
   * across every rich-text field of a stored report, so legacy data with
   * lingering invisibles still renders clean without forcing a re-save.
   * Composes safely with null/undefined inputs.
   */
  private sanitizeReportRichText<T>(doc: T): T {
    if (!doc || typeof doc !== 'object') return doc;
    const obj = doc as Record<string, unknown>;
    for (const k of ReportsService.RICH_TEXT_FIELDS) {
      const v = obj[k];
      if (typeof v === 'string') obj[k] = sanitizeText(v);
    }
    return doc;
  }

  /** Thin alias kept so the upsert call sites read naturally. */
  private stripInvisibleChars(value: string): string {
    return sanitizeText(value);
  }

  private async findPriorCycleKpis(
    clientId: string,
    cycleId: string,
  ): Promise<ReportKpis | null> {
    const cycle = await this.cycles.findOne(cycleId).catch(() => null);
    if (!cycle) return null;
    const prior = await this.model
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
    const kpis = prior[0]?.kpis as ReportKpis | undefined;
    if (kpis && Object.keys(kpis).length > 0) return kpis;
    return null;
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

  /**
   * Snapshots the client's service areas (the ones with metrics) into the
   * report so the data is frozen at save time. Future tweaks to the client
   * doc never change historical reports.
   */
  private async buildServiceAreasSnapshot(clientId: string) {
    const client = await this.clients.findOne(clientId).catch(() => null);
    const areas = (client as { serviceAreas?: Array<Record<string, unknown>> } | null)
      ?.serviceAreas;
    if (!Array.isArray(areas)) return [];
    return areas
      .filter((a) => a && (a as { metrics?: unknown }).metrics)
      .map((a) => {
        const m = (a as { metrics: Record<string, unknown> }).metrics;
        return {
          name: String(a.name || ''),
          city: a.city ? String(a.city) : undefined,
          region: a.region ? String(a.region) : undefined,
          country: a.country ? String(a.country) : undefined,
          landingPageUrl: a.landingPageUrl ? String(a.landingPageUrl) : undefined,
          googleMapsUrl: a.googleMapsUrl ? String(a.googleMapsUrl) : undefined,
          isCityHub: Boolean(a.isCityHub),
          clicks: Number(m.clicks ?? 0),
          impressions: Number(m.impressions ?? 0),
          ctr: Number(m.ctr ?? 0),
          position: Number(m.position ?? 0),
          rangeFrom: String(m.rangeFrom ?? ''),
          rangeTo: String(m.rangeTo ?? ''),
        };
      });
  }

  /**
   * Finds the previous report's service-area snapshot for the same client.
   * Used by the public payload to render before/after deltas per area.
   */
  private async findPreviousServiceAreasSnapshot(
    clientId: string,
    cycleId: string,
  ) {
    const cycle = await this.cycles.findOne(cycleId).catch(() => null);
    if (!cycle) return [];
    const prev = await this.model
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
    if (!prev.length) return [];
    return (prev[0].serviceAreasSnapshot as Array<Record<string, unknown>> | undefined) || [];
  }

  /**
   * Bulk cleanup that re-runs the shared sanitizer across every report's
   * rich-text fields AND delegates the same pass to TasksService for the
   * task collection. Used after the sanitizer is upgraded so legacy
   * contamination is purged in one admin-triggered pass.
   */
  async cleanupAllText(): Promise<{
    reports: { scanned: number; cleaned: number };
    tasks: { scanned: number; cleaned: number };
  }> {
    const docs = await this.model.find({}).lean().exec();
    let cleaned = 0;
    for (const d of docs) {
      const set: Record<string, unknown> = {};
      for (const k of ReportsService.RICH_TEXT_FIELDS) {
        const v = (d as unknown as Record<string, unknown>)[k];
        if (typeof v === 'string') {
          const next = sanitizeText(v);
          if (next !== v) set[k] = next;
        }
      }
      if (Object.keys(set).length === 0) continue;
      await this.model.updateOne({ _id: d._id }, { $set: set }).exec();
      cleaned++;
    }
    const tasks = await this.tasks.cleanupAllText();
    return {
      reports: { scanned: docs.length, cleaned },
      tasks,
    };
  }

  async autoCompose(clientId: string, cycleId: string) {
    const existing = await this.findOneByCycle(clientId, cycleId);
    return this.autoComposeFromReportShape({
      existing,
      dtoFor: () => ({ clientId, cycleId }),
      taskFilter: { clientId, cycleId },
    });
  }

  async autoComposeById(reportId: string) {
    const existing = await this.model.findById(reportId).lean().exec();
    if (!existing) throw new NotFoundException('Report not found.');
    return this.autoComposeFromReportShape({
      existing,
      dtoFor: () => ({
        clientId: existing.clientId.toString(),
        reportId,
      }),
      taskFilter: this.taskFilterFor(existing),
    });
  }

  private async autoComposeFromReportShape(args: {
    existing: { executiveSummary?: string } | null;
    dtoFor: () => UpsertReportDto;
    taskFilter: Parameters<typeof this.tasks.findAll>[0];
  }) {
    const tasks = await this.tasks.findAll(args.taskFilter);
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
    if (planned.length)
      lines.push(`${planned.length} actions remain in pipeline for the next cycle`);
    const exec = lines.join('. ') + (lines.length ? '.' : '');
    const dto = args.dtoFor();
    dto.findings = findings;
    dto.nextPeriodPlan = nextPeriodPlan;
    if (
      !args.existing?.executiveSummary ||
      typeof args.existing.executiveSummary !== 'string' ||
      !args.existing.executiveSummary.trim()
    ) {
      dto.executiveSummary = exec;
    }
    return this.upsert(dto);
  }

  async generatePdf(clientId: string, cycleId: string): Promise<Buffer> {
    const report = await this.findOneByCycle(clientId, cycleId);
    if (!report)
      throw new NotFoundException(
        'Report for that client/cycle does not exist yet. Save it first.',
      );
    return this.generatePdfFromReportDoc(report as never);
  }

  async generatePdfById(reportId: string): Promise<Buffer> {
    const report = await this.model.findById(reportId).lean().exec();
    if (!report) throw new NotFoundException('Report not found.');
    return this.generatePdfFromReportDoc(
      this.sanitizeReportRichText(report) as never,
    );
  }

  private async generatePdfFromReportDoc(
    report: ReportType & {
      _id?: unknown;
      cycleId?: Types.ObjectId | string;
      customRange?: { from: Date | string; to: Date | string };
      shareToken?: string;
      sharePin?: string;
    },
  ): Promise<Buffer> {
    const clientId = report.clientId.toString();
    const [
      client,
      cycle,
      tasks,
      keywords,
      movements,
      backlinksSummary,
      layout,
      contentIdeas,
    ] = await Promise.all([
      this.clients.findOne(clientId),
      this.cycleLikeFor(report),
      this.loadTasksForReport(report),
      this.keywords.byClient(clientId),
      this.keywords.movements(clientId),
      this.backlinks.summary(clientId),
      this.appSettings.getReportLayout(),
      this.content.list({ clientId, status: 'idea' }),
    ]);
    // Content pieces published during the report's window — used by Actions
    // Taken in the PDF (parity with the web report).
    const contentPublished = await this.content.publishedInRange(
      clientId,
      new Date(cycle.startDate),
      new Date(cycle.endDate),
    );
    const reportForPdf = await this.applyKpisPreviousFallback(report, client);
    const share = await this.buildShareInfo(report);
    return this.pdf.generate(
      client as unknown as ClientType,
      cycle as unknown as CycleType,
      reportForPdf as unknown as ReportType,
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
        layout,
        contentIdeas: contentIdeas.map((p) => ({
          title: p.title,
          targetKeyword: p.targetKeyword,
        })),
        contentPublished: contentPublished.map((p) => ({
          title: p.title,
          targetKeyword: p.targetKeyword,
          publishedUrl: p.publishedUrl,
          publishedAt: p.publishedAt,
        })),
        share,
      },
    );
  }

  /**
   * Returns the public share URL + PIN to print on the PDF cover. Returns
   * undefined when the report has never been shared — the cover panel is
   * skipped in that case.
   *
   * Backfill behavior: when a report has a shareToken but no raw
   * sharePin (legacy data shared before the PDF-cover panel existed,
   * which stored only the hash), this regenerates the PIN in-place so
   * the rendered PDF can include it. This invalidates any PIN told
   * verbally to the client out-of-band — but the new PIN is what's
   * printed on the very PDF being generated, so the recipient gets a
   * working PIN as long as they have this PDF.
   */
  private async buildShareInfo(report: {
    _id?: unknown;
    shareToken?: string;
    sharePin?: string;
  }): Promise<{ url: string; pin?: string } | undefined> {
    if (!report.shareToken) return undefined;
    const webBase = (
      this.configSvc.get<string>('PUBLIC_WEB_URL') || 'http://localhost:4200'
    ).replace(/\/+$/, '');
    let pin = report.sharePin;
    if (!pin && report._id) {
      pin = this.generatePin();
      await this.model
        .updateOne(
          { _id: report._id as Types.ObjectId },
          {
            $set: {
              sharePin: pin,
              sharePinHash: await bcrypt.hash(pin, 10),
              pinAttempts: 0,
            },
            $unset: { pinLockedUntil: '' },
          },
        )
        .exec();
    }
    return {
      url: `${webBase}/r/${report.shareToken}`,
      pin,
    };
  }

  /**
   * Word (.docx) export. Honors the same Settings → Report Layout
   * (section ordering + visibility) as the PDF, so a customer's PDF
   * and Word file are structurally aligned. The cover image is embedded
   * inline at the top of the document.
   */
  async generateWord(clientId: string, cycleId: string): Promise<Buffer> {
    const report = await this.findOneByCycle(clientId, cycleId);
    if (!report)
      throw new NotFoundException(
        'Report for that client/cycle does not exist yet. Save it first.',
      );
    return this.generateWordFromReportDoc(report as never);
  }

  async generateWordById(reportId: string): Promise<Buffer> {
    const report = await this.model.findById(reportId).lean().exec();
    if (!report) throw new NotFoundException('Report not found.');
    return this.generateWordFromReportDoc(
      this.sanitizeReportRichText(report) as never,
    );
  }

  private async generateWordFromReportDoc(
    report: ReportType & {
      _id?: unknown;
      cycleId?: Types.ObjectId | string;
      customRange?: { from: Date | string; to: Date | string };
    },
  ): Promise<Buffer> {
    const clientId = report.clientId.toString();
    const [
      client,
      cycle,
      tasks,
      keywords,
      movements,
      backlinksSummary,
      layout,
      contentIdeas,
    ] = await Promise.all([
      this.clients.findOne(clientId),
      this.cycleLikeFor(report),
      this.loadTasksForReport(report),
      this.keywords.byClient(clientId),
      this.keywords.movements(clientId),
      this.backlinks.summary(clientId),
      this.appSettings.getReportLayout(),
      this.content.list({ clientId, status: 'idea' }),
    ]);
    const contentPublished = await this.content.publishedInRange(
      clientId,
      new Date(cycle.startDate),
      new Date(cycle.endDate),
    );
    const reportForWord = await this.applyKpisPreviousFallback(report, client);
    return this.word.generate(
      client as unknown as ClientType,
      cycle as unknown as CycleType,
      reportForWord as unknown as ReportType,
      {
        tasks: tasks as unknown as Array<{
          title: string;
          category: string;
          status: string;
          priority: string;
          notes?: string;
          description?: string;
        }>,
        keywords: keywords as unknown as Array<{
          text: string;
          group?: string;
          currentPosition?: number;
          previousPosition?: number;
          volume?: number;
        }>,
        gainers: movements.gainers,
        losers: movements.losers,
        backlinks: backlinksSummary,
        layout,
        contentIdeas: contentIdeas.map((p) => ({
          title: p.title,
          targetKeyword: p.targetKeyword,
        })),
        contentPublished: contentPublished.map((p) => ({
          title: p.title,
          targetKeyword: p.targetKeyword,
          publishedUrl: p.publishedUrl,
          publishedAt: p.publishedAt,
        })),
      },
    );
  }
}
