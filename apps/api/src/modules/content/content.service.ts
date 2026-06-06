import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentPiece, ContentPieceDocument } from './content-piece.schema';
import { UpsertContentDto } from './dto/upsert-content.dto';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(ContentPiece.name)
    private readonly model: Model<ContentPieceDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
  ) {}

  private async ensureAccessToContent(
    id: string,
    user?: AuthenticatedUser,
  ): Promise<ContentPieceDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Content ${id} not found`);
    if (user) await this.clients.assertAccess(doc.clientId.toString(), user);
    return doc;
  }

  async list(
    filters: { clientId?: string; status?: string } = {},
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
    if (filters.status) q.status = filters.status;
    return this.model.find(q).sort({ updatedAt: -1 }).lean().exec();
  }

  create(dto: UpsertContentDto) {
    return this.model.create({
      ...dto,
      clientId: new Types.ObjectId(dto.clientId),
    });
  }

  async update(
    id: string,
    dto: Partial<UpsertContentDto>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToContent(id, user);
    if (dto.clientId && user) await this.clients.assertAccess(dto.clientId, user);
    const patch: Record<string, unknown> = { ...dto };
    if (dto.clientId) patch.clientId = new Types.ObjectId(dto.clientId);
    if (dto.status === 'published') patch.publishedAt = new Date();
    const updated = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return updated;
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToContent(id, user);
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Content ${id} not found`);
    return { deleted: true };
  }
}
