import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TaskAttachment } from '@seo/shared';
import { Task, TaskDocument } from './task.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly model: Model<TaskDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
  ) {}

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

  async create(dto: CreateTaskDto, user?: AuthenticatedUser) {
    if (user) await this.clients.assertAccess(dto.clientId, user);
    return this.model.create({
      ...dto,
      clientId: new Types.ObjectId(dto.clientId),
      cycleId: new Types.ObjectId(dto.cycleId),
    });
  }

  async update(id: string, dto: UpdateTaskDto, user?: AuthenticatedUser) {
    await this.ensureAccessToTask(id, user);
    const patch: Record<string, unknown> = { ...dto };
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
    return updated;
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToTask(id, user);
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Task ${id} not found`);
    return { deleted: true };
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
        { $push: { subtasks: { title: subtask.title, done: !!subtask.done } } },
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
