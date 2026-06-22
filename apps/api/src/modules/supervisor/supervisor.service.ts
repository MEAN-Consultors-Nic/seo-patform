import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { Client, ClientDocument } from '../clients/client.schema';
import { Cycle, CycleDocument } from '../cycles/cycle.schema';
import { Task, TaskDocument } from '../tasks/task.schema';
import { Report, ReportDocument } from '../reports/report.schema';

const SUPERVISOR_TOKEN_TTL = '12h';

@Injectable()
export class SupervisorService {
  constructor(
    private readonly appSettings: AppSettingsService,
    private readonly jwt: JwtService,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Cycle.name) private readonly cycleModel: Model<CycleDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
  ) {}

  /**
   * Verifies the submitted PIN against the stored hash and issues a 12h
   * JWT with audience='supervisor'. Refusing supervisor-disabled or
   * wrong-PIN attempts with the same generic message (don't leak which
   * one failed). The token has a random `sub` so future revocation can
   * be added without changing callers.
   */
  async authenticate(pin: string): Promise<{ token: string; expiresAt: Date }> {
    if (!pin || typeof pin !== 'string') {
      throw new BadRequestException('PIN is required');
    }
    const ok = await this.appSettings.verifySupervisorPin(pin.trim());
    if (!ok) throw new ForbiddenException('Invalid PIN');
    const sessionId = randomBytes(12).toString('base64url');
    const token = this.jwt.sign(
      { sub: sessionId, kind: 'supervisor' },
      { audience: 'supervisor', expiresIn: SUPERVISOR_TOKEN_TTL },
    );
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    return { token, expiresAt };
  }

  /** List every active client. Supervisor sees all, no owner scoping. */
  async listClients() {
    return this.clientModel
      .find({ active: true })
      .sort({ tier: 1, name: 1 })
      .select(
        '_id name tier url logoUrl industry hoursPerCycle active endingDate',
      )
      .lean()
      .exec();
  }

  async getClient(clientId: string) {
    const c = await this.clientModel.findById(clientId).lean().exec();
    if (!c) throw new NotFoundException('Client not found');
    return c;
  }

  /**
   * Lists every cycle that has either a saved report OR at least one
   * task for this client. Cycles with no activity are hidden so the
   * supervisor doesn't scroll through empty periods.
   */
  async listClientCycles(clientId: string) {
    const oid = new Types.ObjectId(clientId);
    const [taskCycles, reportCycles] = await Promise.all([
      this.taskModel.distinct('cycleId', { clientId: oid }),
      this.reportModel.distinct('cycleId', { clientId: oid }),
    ]);
    const cycleIds = Array.from(
      new Set([...taskCycles, ...reportCycles].map((id) => String(id))),
    ).map((id) => new Types.ObjectId(id));
    if (!cycleIds.length) return [];
    return this.cycleModel
      .find({ _id: { $in: cycleIds } })
      .sort({ startDate: -1 })
      .lean()
      .exec();
  }

  /**
   * Bundle of everything the supervisor needs for one client/cycle: the
   * report (with KPIs), tasks (with their comments), and basic
   * keywords/backlinks summaries. Single round-trip from the frontend.
   */
  async getCycleDashboard(clientId: string, cycleId: string) {
    const cOid = new Types.ObjectId(clientId);
    const yOid = new Types.ObjectId(cycleId);
    const [client, cycle, report, tasks] = await Promise.all([
      this.clientModel.findById(cOid).lean().exec(),
      this.cycleModel.findById(yOid).lean().exec(),
      this.reportModel.findOne({ clientId: cOid, cycleId: yOid }).lean().exec(),
      this.taskModel
        .find({ clientId: cOid, cycleId: yOid })
        .sort({ priority: 1, status: 1, createdAt: -1 })
        .lean()
        .exec(),
    ]);
    if (!client) throw new NotFoundException('Client not found');
    if (!cycle) throw new NotFoundException('Cycle not found');
    return {
      client: {
        _id: client._id,
        name: client.name,
        tier: client.tier,
        url: client.url,
        logoUrl: client.logoUrl,
        endingDate: client.endingDate,
      },
      cycle: {
        _id: cycle._id,
        label: cycle.label,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
      },
      report: report
        ? {
            kpis: report.kpis,
            kpisPrevious: report.kpisPrevious,
            executiveSummary: report.executiveSummary,
            findings: report.findings,
            nextPeriodPlan: report.nextPeriodPlan,
            clientBlockers: report.clientBlockers,
            finalConsiderations: report.finalConsiderations,
            shareToken: report.shareToken,
          }
        : null,
      tasks: tasks.map((t) => ({
        _id: t._id,
        title: t.title,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        estimatedHours: t.estimatedHours,
        actualHours: t.actualHours,
        notes: t.notes,
        subtasks: t.subtasks,
        comments: t.comments ?? [],
        completedAt: t.completedAt,
      })),
    };
  }

  /**
   * Appends a supervisor-authored comment to a task. The supervisor name
   * is optional — when missing we default to "Supervisor" so the comment
   * thread always has a clear attribution.
   */
  async addSupervisorComment(
    taskId: string,
    body: { content: string; authorName?: string },
  ) {
    const content = (body.content || '').trim();
    if (!content) throw new BadRequestException('Comment is empty');
    const updated = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        {
          $push: {
            comments: {
              content,
              authorRole: 'supervisor',
              authorName: (body.authorName || '').trim() || 'Supervisor',
              createdAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Task not found');
    return updated.comments ?? [];
  }
}
