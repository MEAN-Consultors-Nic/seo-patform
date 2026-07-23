import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Competitor, CompetitorDocument } from './competitor.schema';
import { UpsertCompetitorDto } from './dto/upsert-competitor.dto';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';

@Injectable()
export class CompetitorsService {
  constructor(
    @InjectModel(Competitor.name)
    private readonly model: Model<CompetitorDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
  ) {}

  private async ensureAccessToCompetitor(
    id: string,
    user?: AuthenticatedUser,
  ): Promise<CompetitorDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Competitor ${id} not found`);
    if (user) await this.clients.assertAccess(doc.clientId.toString(), user);
    return doc;
  }

  byClient(clientId: string) {
    return this.model
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  create(dto: UpsertCompetitorDto) {
    return this.model.create({
      ...dto,
      clientId: new Types.ObjectId(dto.clientId),
    });
  }

  async update(
    id: string,
    dto: Partial<UpsertCompetitorDto>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToCompetitor(id, user);
    if (dto.clientId && user) await this.clients.assertAccess(dto.clientId, user);
    const patch: Record<string, unknown> = { ...dto };
    if (dto.clientId) patch.clientId = new Types.ObjectId(dto.clientId);
    const updated = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Competitor ${id} not found`);
    return updated;
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToCompetitor(id, user);
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Competitor ${id} not found`);
    return { deleted: true };
  }

  // --- Keyword tracking --------------------------------------------------

  /**
   * Associate a client's tracked keyword with this competitor and
   * optionally seed an initial observed position. Refuses duplicates
   * — one entry per (competitor, keyword) pair.
   */
  async addKeyword(
    competitorId: string,
    payload: {
      keywordId: string;
      position?: number;
      rankingUrl?: string;
      notes?: string;
    },
    user?: AuthenticatedUser,
  ) {
    const doc = await this.ensureAccessToCompetitor(competitorId, user);
    const kwOid = new Types.ObjectId(payload.keywordId);
    const dup = (doc.keywords ?? []).some(
      (k) => k.keywordId?.toString() === kwOid.toString(),
    );
    if (dup) {
      throw new BadRequestException(
        'This keyword is already tracked for this competitor. Edit the existing row.',
      );
    }
    doc.keywords = [
      ...(doc.keywords ?? []),
      {
        keywordId: kwOid,
        position: payload.position,
        rankingUrl: payload.rankingUrl,
        notes: payload.notes,
        lastCheckedAt: payload.position !== undefined ? new Date() : undefined,
      },
    ];
    await doc.save();
    return doc.toObject();
  }

  async updateKeyword(
    competitorId: string,
    entryId: string,
    patch: {
      position?: number;
      rankingUrl?: string;
      notes?: string;
    },
    user?: AuthenticatedUser,
  ) {
    const doc = await this.ensureAccessToCompetitor(competitorId, user);
    const entry = (doc.keywords ?? []).find(
      (k) => k._id?.toString() === entryId,
    );
    if (!entry) {
      throw new NotFoundException(`Competitor keyword ${entryId} not found`);
    }
    // Preserve the current position as previous when a new position
    // is being set — same pattern as the client Keyword schema so
    // the movement arrow renders correctly.
    if (
      patch.position !== undefined &&
      entry.position !== undefined &&
      patch.position !== entry.position
    ) {
      entry.previousPosition = entry.position;
    }
    if (patch.position !== undefined) {
      entry.position = patch.position;
      entry.lastCheckedAt = new Date();
    }
    if (patch.rankingUrl !== undefined) entry.rankingUrl = patch.rankingUrl;
    if (patch.notes !== undefined) entry.notes = patch.notes;
    await doc.save();
    return doc.toObject();
  }

  async removeKeyword(
    competitorId: string,
    entryId: string,
    user?: AuthenticatedUser,
  ) {
    const doc = await this.ensureAccessToCompetitor(competitorId, user);
    const before = (doc.keywords ?? []).length;
    doc.keywords = (doc.keywords ?? []).filter(
      (k) => k._id?.toString() !== entryId,
    );
    if (doc.keywords.length === before) {
      throw new NotFoundException(`Competitor keyword ${entryId} not found`);
    }
    await doc.save();
    return { deleted: true };
  }
}
