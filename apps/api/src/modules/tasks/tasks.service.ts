import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskAttachment, sanitizeText } from '@seo/shared';
import { Task, TaskDocument } from './task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ClientsService } from '../clients/clients.service';
import { GoogleDocsService } from '../google-integrations/google-docs.service';
import { AuthenticatedUser } from '../auth/roles.guard';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly model: Model<TaskDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
    private readonly docs: GoogleDocsService,
  ) {}

  /**
   * Same shared sanitizer used by ReportsService and PdfService. Strips
   * the family of invisible/space-variant characters that travel with
   * Word / Google Docs / Claude Desktop pastes and fuse adjacent words in
   * the rendered report. See libs/shared/src/lib/text-sanitizer.ts.
   */
  private cleanText<T extends string | undefined | null>(value: T): T {
    return sanitizeText(value);
  }

  /**
   * Applies cleanText to every free-text field on a task DTO/patch:
   * title, description, notes, and subtask titles. Returns a shallow
   * clone so the caller's DTO isn't mutated.
   */
  private sanitizeTaskFields<T extends Partial<CreateTaskDto>>(dto: T): T {
    const out: T = { ...dto };
    if (typeof out.title === 'string') out.title = this.cleanText(out.title);
    if (typeof out.description === 'string')
      out.description = this.cleanText(out.description);
    if (typeof out.notes === 'string') out.notes = this.cleanText(out.notes);
    if (Array.isArray(out.subtasks)) {
      out.subtasks = out.subtasks.map((s) => ({
        ...s,
        title: this.cleanText(s.title) as string,
      }));
    }
    return out;
  }

  private async ensureAccessToTask(
    id: string,
    user?: AuthenticatedUser,
  ): Promise<TaskDocument> {
    const task = await this.model.findById(id).exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    if (user) await this.clients.assertAccess(task.clientId.toString(), user);
    return task;
  }

  async findAll(
    filters: {
      clientId?: string;
      cycleId?: string;
      status?: string;
      category?: string;
      /** Inclusive lower bound on completedAt — used by custom-range reports. */
      completedFrom?: string;
      /** Inclusive upper bound on completedAt. */
      completedTo?: string;
    },
    user?: AuthenticatedUser,
  ) {
    const q: Record<string, unknown> = {};
    if (filters.clientId) {
      if (user) await this.clients.assertAccess(filters.clientId, user);
      q.clientId = new Types.ObjectId(filters.clientId);
    } else if (user) {
      const accessibleIds = await this.clients.listAccessibleIds(user);
      if (accessibleIds !== null) q.clientId = { $in: accessibleIds };
    }
    if (filters.cycleId) q.cycleId = new Types.ObjectId(filters.cycleId);
    if (filters.status) q.status = filters.status;
    if (filters.category) q.category = filters.category;
    if (filters.completedFrom || filters.completedTo) {
      const completedAt: Record<string, Date> = {};
      if (filters.completedFrom) completedAt.$gte = new Date(filters.completedFrom);
      if (filters.completedTo) {
        const to = new Date(filters.completedTo);
        // Promote to end-of-day so a date string like '2026-06-25' includes
        // everything completed that day, not just midnight UTC.
        to.setUTCHours(23, 59, 59, 999);
        completedAt.$lte = to;
      }
      q.completedAt = completedAt;
    }
    return this.model
      .find(q)
      .sort({ priority: 1, status: 1, createdAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToTask(id, user);
    const task = await this.model.findById(id).lean().exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  /**
   * One-shot bulk cleanup: walks every task, re-runs the shared sanitizer
   * over title/description/notes/subtask titles, and writes back only the
   * docs that actually changed. Returns a summary so the caller can show
   * "X tasks scanned, Y cleaned" to the admin.
   *
   * Safe to re-run — a task whose fields are already clean stays untouched.
   */
  async cleanupAllText(): Promise<{ scanned: number; cleaned: number }> {
    const tasks = await this.model.find({}).lean().exec();
    let cleaned = 0;
    for (const t of tasks) {
      const set: Record<string, unknown> = {};
      const title = sanitizeText(t.title || '');
      if (title !== t.title) set.title = title;
      if (typeof t.description === 'string') {
        const d = sanitizeText(t.description);
        if (d !== t.description) set.description = d;
      }
      if (typeof t.notes === 'string') {
        const n = sanitizeText(t.notes);
        if (n !== t.notes) set.notes = n;
      }
      if (Array.isArray(t.subtasks)) {
        const next = t.subtasks.map((s) => ({
          ...s,
          title: sanitizeText(s.title || ''),
        }));
        const changed = next.some((s, i) => s.title !== t.subtasks![i].title);
        if (changed) set.subtasks = next;
      }
      if (Object.keys(set).length === 0) continue;
      await this.model.updateOne({ _id: t._id }, { $set: set }).exec();
      cleaned++;
    }
    return { scanned: tasks.length, cleaned };
  }

  async create(dto: CreateTaskDto, user?: AuthenticatedUser) {
    if (user) await this.clients.assertAccess(dto.clientId, user);
    const clean = this.sanitizeTaskFields(dto);
    return this.model.create({
      ...clean,
      clientId: new Types.ObjectId(dto.clientId),
      cycleId: new Types.ObjectId(dto.cycleId),
    });
  }

  async update(id: string, dto: UpdateTaskDto, user?: AuthenticatedUser) {
    await this.ensureAccessToTask(id, user);
    // skipImages is a transient hint for the doc-sync side-effect — it
    // travels with the completion request but must NOT be persisted on
    // the task document. Pluck it out before building the Mongo patch.
    const skipImages = !!(dto as UpdateTaskDto & { skipImages?: boolean })
      .skipImages;
    const clean = this.sanitizeTaskFields(dto);
    const patch: Record<string, unknown> = { ...clean };
    delete (patch as { skipImages?: unknown }).skipImages;
    if (dto.clientId) patch.clientId = new Types.ObjectId(dto.clientId);
    if (dto.cycleId) patch.cycleId = new Types.ObjectId(dto.cycleId);
    if (dto.status === 'completed') {
      // Block completion if there are unchecked subtasks. We must consider
      // both the existing subtasks and any new ones included in this PATCH.
      const existing = await this.model.findById(id).lean().exec();
      if (!existing) throw new NotFoundException(`Task ${id} not found`);
      const subtasks = dto.subtasks ?? existing.subtasks ?? [];
      const pending = subtasks.filter((s) => !s.done).length;
      if (pending > 0) {
        throw new BadRequestException(
          `Cannot mark task as completed — ${pending} subtask${pending === 1 ? '' : 's'} still pending.`,
        );
      }
      patch.completedAt = new Date();
    }
    const updated = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Task ${id} not found`);

    // Mirror into the client's Google Doc when status just flipped
    // to 'completed'. The await is intentional — we want any failure
    // to make it back to the client as part of the response so the
    // UI can show a toast. Failure here NEVER throws — the task
    // update has already persisted at this point and the doc step
    // is informational.
    let docSync: { ok: boolean; message?: string } | undefined;
    if (dto.status === 'completed' && user?.userId) {
      docSync = await this.mirrorCompletionToGoogleDoc(
        updated,
        user.userId,
        skipImages,
      );
    }

    return docSync
      ? ({ ...updated, _docSync: docSync } as typeof updated & {
          _docSync: typeof docSync;
        })
      : updated;
  }

  /**
   * Looks up the client's linked googleDocId, resolves (or creates)
   * the monthly tab matching the task's completedAt date, and appends
   * a heading + description + image-attachment block. Returns a
   * status so the caller can surface success / failure to the UI.
   * Skipped (returns ok=true, no message) when the client isn't
   * linked to a doc.
   */
  private async mirrorCompletionToGoogleDoc(
    task: {
      _id?: unknown;
      clientId?: unknown;
      title: string;
      description?: string;
      category?: string;
      priority?: string;
      completedAt?: Date;
      attachments?: Array<{ url: string; resourceType?: string }>;
    },
    userId: string,
    skipImages = false,
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      const client = await this.clients.findOne(String(task.clientId));
      const docId = (client as unknown as { googleDocId?: string })
        .googleDocId;
      if (!docId) return { ok: true };
      const when = task.completedAt ?? new Date();
      const tabId = await this.docs.findMonthlyTab(userId, docId, when);
      const imageAttachments = skipImages
        ? []
        : (task.attachments ?? [])
            .filter((a) => a.resourceType !== 'raw')
            .map((a) => a.url)
            .filter((u): u is string => !!u);
      await this.docs.appendTaskToTab(userId, docId, tabId, {
        title: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        completedAt: when,
        imageAttachments,
      });
      return { ok: true, message: 'Task synced to Google Doc.' };
    } catch (err) {
      return {
        ok: false,
        message:
          (err as Error).message ||
          'Unknown error while syncing to Google Doc.',
      };
    }
  }

  /**
   * Manually triggers a Google Doc sync for an already-completed task.
   * Used by the kanban menu's "Send to Doc" action — handy when the
   * original auto-sync failed (no doc linked yet, GSC tab missing,
   * token expired) or when the user wants to re-emit the entry into a
   * different month tab. The task is NOT modified; this is purely a
   * side-effect call. Refuses anything that isn't already completed
   * because the doc layout assumes a completedAt timestamp.
   */
  async sendToDoc(
    id: string,
    skipImages: boolean,
    user: AuthenticatedUser,
  ): Promise<{ ok: boolean; message?: string }> {
    await this.ensureAccessToTask(id, user);
    const task = await this.model.findById(id).lean().exec();
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    if (task.status !== 'completed') {
      throw new BadRequestException(
        'Only completed tasks can be sent to the Google Doc.',
      );
    }
    return this.mirrorCompletionToGoogleDoc(task, user.userId, skipImages);
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToTask(id, user);
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Task ${id} not found`);
    return { deleted: true };
  }

  /**
   * Appends a team-authored comment to a task. The supervisor uses a
   * parallel SupervisorService.addSupervisorComment writing to the
   * same embedded `comments` array so both sides see the full thread.
   */
  async addTeamComment(
    taskId: string,
    content: string,
    user: AuthenticatedUser,
  ) {
    await this.ensureAccessToTask(taskId, user);
    const updated = await this.model
      .findByIdAndUpdate(
        taskId,
        {
          $push: {
            comments: {
              content,
              authorRole: 'team',
              authorName: user.email,
              createdAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Task ${taskId} not found`);
    return updated.comments ?? [];
  }

  async addSubtask(
    id: string,
    subtask: { title: string; done?: boolean },
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToTask(id, user);
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          $push: {
            subtasks: {
              title: this.cleanText(subtask.title) ?? '',
              done: !!subtask.done,
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Task ${id} not found`);
    return updated;
  }

  async addAttachment(
    id: string,
    attachment: Partial<TaskAttachment>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToTask(id, user);
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          $push: {
            attachments: {
              ...attachment,
              uploadedAt: new Date(),
            },
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Task ${id} not found`);
    return updated;
  }

  async removeAttachment(id: string, publicId: string, user?: AuthenticatedUser) {
    await this.ensureAccessToTask(id, user);
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { $pull: { attachments: { publicId } } },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Task ${id} not found`);
    return updated;
  }

  async updateAttachment(
    id: string,
    publicId: string,
    patch: Partial<TaskAttachment>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToTask(id, user);
    const $set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      $set[`attachments.$.${k}`] = v;
    }
    const updated = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), 'attachments.publicId': publicId },
        { $set },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Task or attachment not found`);
    return updated;
  }

  async summaryByClient(cycleId: string, user?: AuthenticatedUser) {
    const match: Record<string, unknown> = { cycleId: new Types.ObjectId(cycleId) };
    if (user) {
      const accessibleIds = await this.clients.listAccessibleIds(user);
      if (accessibleIds !== null) match.clientId = { $in: accessibleIds };
    }
    return this.model.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$clientId',
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          actualHours: { $sum: '$actualHours' },
          estimatedHours: { $sum: '$estimatedHours' },
        },
      },
    ]);
  }
}
