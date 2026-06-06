import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
}
