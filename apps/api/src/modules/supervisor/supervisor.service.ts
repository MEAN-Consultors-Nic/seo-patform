import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Client, ClientDocument } from '../clients/client.schema';
import { Cycle, CycleDocument } from '../cycles/cycle.schema';
import { Task, TaskDocument } from '../tasks/task.schema';
import { Report, ReportDocument } from '../reports/report.schema';
import { Supervisor, SupervisorDocument } from './supervisor.schema';

const SUPERVISOR_TOKEN_TTL = '12h';

@Injectable()
export class SupervisorService {
  constructor(
    private readonly jwt: JwtService,
    @InjectModel(Supervisor.name)
    private readonly supervisorModel: Model<SupervisorDocument>,
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
  /**
   * Resolves the entered PIN to a registered supervisor by brute-force
   * bcrypt-comparing against every active supervisor's hash. Linear in
   * the number of supervisors but each compare is the same cost so for
   * the small numbers expected (a handful) this is fine. Returning the
   * supervisor's id + name inside the token lets downstream code stamp
   * comments with the right author and greet the user in the UI.
   */
  async authenticate(
    pin: string,
  ): Promise<{ token: string; expiresAt: Date; name: string }> {
    if (!pin || typeof pin !== 'string') {
      throw new BadRequestException('PIN is required');
    }
    const trimmed = pin.trim();
    const active = await this.supervisorModel
      .find({ active: true })
      .select('_id name pinHash')
      .lean()
      .exec();
    let matched: { _id: unknown; name: string } | null = null;
    for (const s of active) {
      const ok = await bcrypt.compare(trimmed, s.pinHash);
      if (ok) {
        matched = { _id: s._id, name: s.name };
        break;
      }
    }
    if (!matched) throw new ForbiddenException('Invalid PIN');
    const supervisorId = String(matched._id);
    await this.supervisorModel
      .updateOne({ _id: matched._id }, { $set: { lastSeenAt: new Date() } })
      .exec();
    const token = this.jwt.sign(
      { sub: supervisorId, kind: 'supervisor', name: matched.name },
      { audience: 'supervisor', expiresIn: SUPERVISOR_TOKEN_TTL },
    );
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
    return { token, expiresAt, name: matched.name };
  }

  // --- Admin CRUD (mounted on /app-settings/supervisors) ----------------

  async listSupervisors() {
    const docs = await this.supervisorModel
      .find({})
      .sort({ active: -1, name: 1 })
      .lean()
      .exec();
    return docs.map((s) => ({
      _id: s._id,
      name: s.name,
      active: s.active,
      lastSeenAt: s.lastSeenAt,
      createdAt: (s as unknown as { createdAt?: Date }).createdAt,
    }));
  }

  async createSupervisor(name: string): Promise<{ _id: string; pin: string }> {
    const cleanName = (name || '').trim();
    if (!cleanName) throw new BadRequestException('Supervisor name is required');
    const pin = this.generatePin();
    const doc = await this.supervisorModel.create({
      name: cleanName,
      pinHash: await bcrypt.hash(pin, 10),
      active: true,
    });
    return { _id: String(doc._id), pin };
  }

  async regenerateSupervisorPin(id: string): Promise<{ pin: string }> {
    const pin = this.generatePin();
    const updated = await this.supervisorModel
      .findByIdAndUpdate(id, { $set: { pinHash: await bcrypt.hash(pin, 10) } })
      .exec();
    if (!updated) throw new NotFoundException('Supervisor not found');
    return { pin };
  }

  async updateSupervisor(
    id: string,
    patch: { name?: string; active?: boolean },
  ) {
    const set: Record<string, unknown> = {};
    if (typeof patch.name === 'string' && patch.name.trim())
      set.name = patch.name.trim();
    if (typeof patch.active === 'boolean') set.active = patch.active;
    if (!Object.keys(set).length) throw new BadRequestException('Nothing to update');
    const updated = await this.supervisorModel
      .findByIdAndUpdate(id, { $set: set }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Supervisor not found');
    return updated;
  }

  async deleteSupervisor(id: string) {
    const res = await this.supervisorModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Supervisor not found');
    return { deleted: true };
  }

  private generatePin(): string {
    return String(randomInt(100000, 1000000));
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
   * Appends a supervisor-authored comment to a task. The author name is
   * taken from the JWT principal (set by SupervisorGuard) so the
   * supervisor cannot impersonate someone else by passing a different
   * name in the body. Falls back to "Supervisor" if for some reason the
   * principal didn't carry a name (shouldn't happen post-refactor).
   */
  async addSupervisorComment(
    taskId: string,
    body: { content: string },
    authorName: string,
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
              authorName: (authorName || '').trim() || 'Supervisor',
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
