import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Backlink, BacklinkDocument } from './backlink.schema';
import { UpsertBacklinkDto } from './dto/upsert-backlink.dto';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

@Injectable()
export class BacklinksService {
  constructor(
    @InjectModel(Backlink.name)
    private readonly model: Model<BacklinkDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
  ) {}

  private async ensureAccessToBacklink(
    id: string,
    user?: AuthenticatedUser,
  ): Promise<BacklinkDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Backlink ${id} not found`);
    if (user) await this.clients.assertAccess(doc.clientId.toString(), user);
    return doc;
  }

  byClient(clientId: string, status?: string) {
    const q: Record<string, unknown> = {
      clientId: new Types.ObjectId(clientId),
    };
    if (status) q.status = status;
    return this.model.find(q).sort({ acquiredAt: -1, createdAt: -1 }).lean().exec();
  }

  create(dto: UpsertBacklinkDto) {
    return this.model.create({
      ...dto,
      clientId: new Types.ObjectId(dto.clientId),
      sourceDomain: extractDomain(dto.sourceUrl),
      acquiredAt: new Date(),
    });
  }

  async update(
    id: string,
    dto: Partial<UpsertBacklinkDto>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToBacklink(id, user);
    if (dto.clientId && user) await this.clients.assertAccess(dto.clientId, user);
    const patch: Record<string, unknown> = { ...dto };
    if (dto.clientId) patch.clientId = new Types.ObjectId(dto.clientId);
    if (dto.sourceUrl) patch.sourceDomain = extractDomain(dto.sourceUrl);
    const updated = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Backlink ${id} not found`);
    return updated;
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToBacklink(id, user);
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Backlink ${id} not found`);
    return { deleted: true };
  }

  async summary(clientId: string) {
    const grouped = await this.model.aggregate([
      { $match: { clientId: new Types.ObjectId(clientId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgDr: { $avg: '$domainRating' },
        },
      },
    ]);
    const dofollow = await this.model.countDocuments({
      clientId: new Types.ObjectId(clientId),
      linkType: 'dofollow',
    });
    const total = await this.model.countDocuments({
      clientId: new Types.ObjectId(clientId),
    });
    return { perStatus: grouped, total, dofollow };
  }
}
