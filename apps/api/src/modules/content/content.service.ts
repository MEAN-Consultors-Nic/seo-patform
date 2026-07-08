import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentAttachment, ContentStatus } from '@seo/shared';
import { ContentPiece, ContentPieceDocument } from './content-piece.schema';
import { UpsertContentDto } from './dto/upsert-content.dto';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';

// Legacy statuses retired (brief / review / archived) get mapped to the
// nearest active bucket so historic documents keep showing up in the new
// 3-column kanban. Writes are restricted to the new 3 values via the DTO.
const LEGACY_STATUS_MAP: Record<string, ContentStatus> = {
  brief: 'draft',
  review: 'draft',
  archived: 'published',
};

function normalizeStatus<T extends { status?: string }>(piece: T): T {
  if (piece.status && LEGACY_STATUS_MAP[piece.status]) {
    piece.status = LEGACY_STATUS_MAP[piece.status];
  }
  return piece;
}

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
    if (filters.status) {
      // Expand the filter to also match legacy statuses that map to it,
      // so e.g. filter status=draft also returns docs still stored as
      // 'brief' or 'review'.
      const legacyEquivalents = Object.entries(LEGACY_STATUS_MAP)
        .filter(([, v]) => v === filters.status)
        .map(([k]) => k);
      q.status =
        legacyEquivalents.length > 0
          ? { $in: [filters.status, ...legacyEquivalents] }
          : filters.status;
    }
    const docs = await this.model.find(q).sort({ updatedAt: -1 }).lean().exec();
    return docs.map((d) => normalizeStatus(d));
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
    return normalizeStatus(updated);
  }

  /**
   * Pieces published during a date range. Used by the public report's
   * Actions Taken section to highlight what content went live in the
   * current cycle.
   */
  async publishedInRange(
    clientId: string,
    from: Date,
    to: Date,
  ): Promise<ContentPiece[]> {
    const docs = await this.model
      .find({
        clientId: new Types.ObjectId(clientId),
        status: 'published',
        publishedAt: { $gte: from, $lte: to },
      })
      .sort({ publishedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) => normalizeStatus(d));
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToContent(id, user);
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Content ${id} not found`);
    return { deleted: true };
  }

  async addAttachment(
    id: string,
    attachment: Partial<ContentAttachment>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToContent(id, user);
    if (!attachment.publicId || !attachment.url) {
      throw new NotFoundException('Attachment missing publicId or url');
    }
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
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return normalizeStatus(updated);
  }

  async removeAttachment(
    id: string,
    publicId: string,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToContent(id, user);
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { $pull: { attachments: { publicId } } },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Content ${id} not found`);
    return normalizeStatus(updated);
  }
}
