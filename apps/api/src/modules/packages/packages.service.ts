import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Package, PackageDocument } from './package.schema';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { ClientTier, HOURS_PER_TIER, PackageColor } from '@seo/shared';

/**
 * Package management + one-shot migration from the legacy ClientTier
 * enum (A/B/C) to explicit Package documents. See onModuleInit for the
 * migration details — it runs idempotently at every boot.
 */
@Injectable()
export class PackagesService implements OnModuleInit {
  private readonly logger = new Logger(PackagesService.name);

  constructor(
    @InjectModel(Package.name)
    private readonly model: Model<PackageDocument>,
    @InjectModel('Client')
    private readonly clientsModel: Model<{
      _id: Types.ObjectId;
      tier?: ClientTier;
      packageId?: Types.ObjectId;
    }>,
    @InjectModel('TaskTemplate')
    private readonly templatesModel: Model<{
      _id: Types.ObjectId;
      applicableTiers?: ClientTier[];
      applicablePackageIds?: Types.ObjectId[];
    }>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedDefaultPackagesIfEmpty();
      await this.backfillClientPackages();
      await this.backfillTaskTemplatePackages();
    } catch (e) {
      this.logger.error(
        `Package migration failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
    }
  }

  /**
   * Creates the three baseline packages (Tier A/B/C) on the first boot
   * that finds an empty packages collection. Users can rename, recolor,
   * add deliverables, or delete these after — the seed only runs once.
   */
  private async seedDefaultPackagesIfEmpty(): Promise<void> {
    const count = await this.model.countDocuments().exec();
    if (count > 0) return;
    const defaults: Array<{
      name: string;
      description: string;
      color: PackageColor;
      hoursPerPeriod: number;
      legacyTier: ClientTier;
    }> = [
      {
        name: 'Tier A',
        description: 'Migrated from legacy Tier A — rename in Settings → Packages.',
        color: 'ink',
        hoursPerPeriod: HOURS_PER_TIER.A,
        legacyTier: 'A',
      },
      {
        name: 'Tier B',
        description: 'Migrated from legacy Tier B — rename in Settings → Packages.',
        color: 'sky',
        hoursPerPeriod: HOURS_PER_TIER.B,
        legacyTier: 'B',
      },
      {
        name: 'Tier C',
        description: 'Migrated from legacy Tier C — rename in Settings → Packages.',
        color: 'brand',
        hoursPerPeriod: HOURS_PER_TIER.C,
        legacyTier: 'C',
      },
    ];
    for (const d of defaults) {
      await this.model.create({
        name: d.name,
        description: d.description,
        color: d.color,
        hoursPerPeriod: d.hoursPerPeriod,
        deliverables: [],
      });
    }
    this.logger.log('Seeded 3 default packages from legacy tier values.');
  }

  /**
   * Assigns packageId to any client that still only has the legacy tier
   * field, mapping A→Tier A doc, B→Tier B, C→Tier C. Skips clients that
   * already have packageId set.
   */
  private async backfillClientPackages(): Promise<void> {
    const packagesByLegacyTier = await this.legacyTierMap();
    if (packagesByLegacyTier.size === 0) return;
    let migrated = 0;
    const cursor = this.clientsModel
      .find({ packageId: { $exists: false } })
      .cursor();
    for await (const client of cursor) {
      const tier = client.tier;
      const pkg = tier ? packagesByLegacyTier.get(tier) : undefined;
      if (!pkg) continue;
      await this.clientsModel.updateOne(
        { _id: client._id },
        { $set: { packageId: pkg } },
      );
      migrated++;
    }
    if (migrated > 0) {
      this.logger.log(`Assigned packageId to ${migrated} legacy client(s).`);
    }
  }

  /**
   * Converts each task template's applicableTiers into applicablePackageIds
   * using the same A/B/C → Tier A/B/C mapping. Leaves the original
   * applicableTiers array in place so nothing that still reads it breaks
   * mid-migration.
   */
  private async backfillTaskTemplatePackages(): Promise<void> {
    const packagesByLegacyTier = await this.legacyTierMap();
    if (packagesByLegacyTier.size === 0) return;
    let migrated = 0;
    const cursor = this.templatesModel
      .find({
        $or: [
          { applicablePackageIds: { $exists: false } },
          { applicablePackageIds: { $size: 0 } },
        ],
      })
      .cursor();
    for await (const tpl of cursor) {
      const tiers = tpl.applicableTiers ?? [];
      const ids = tiers
        .map((t) => packagesByLegacyTier.get(t))
        .filter((v): v is Types.ObjectId => !!v);
      if (ids.length === 0) continue;
      await this.templatesModel.updateOne(
        { _id: tpl._id },
        { $set: { applicablePackageIds: ids } },
      );
      migrated++;
    }
    if (migrated > 0) {
      this.logger.log(
        `Migrated applicableTiers → applicablePackageIds on ${migrated} template(s).`,
      );
    }
  }

  /**
   * Returns a map from legacy Tier letter to the ObjectId of the seeded
   * Tier A/B/C package. Empty when the seed packages have been renamed
   * (matching by name), which means the migration is already done.
   */
  private async legacyTierMap(): Promise<Map<ClientTier, Types.ObjectId>> {
    const docs = await this.model
      .find({ name: { $in: ['Tier A', 'Tier B', 'Tier C'] } })
      .lean()
      .exec();
    const map = new Map<ClientTier, Types.ObjectId>();
    for (const d of docs) {
      const suffix = d.name.split(' ').pop() as ClientTier | undefined;
      if (suffix === 'A' || suffix === 'B' || suffix === 'C') {
        map.set(suffix, d._id as Types.ObjectId);
      }
    }
    return map;
  }

  // --- CRUD ------------------------------------------------------------------

  async list(): Promise<PackageDocument[]> {
    return this.model.find().sort({ name: 1 }).lean().exec() as never;
  }

  async findOne(id: string): Promise<PackageDocument> {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException(`Package ${id} not found`);
    return doc as never;
  }

  async create(dto: CreatePackageDto): Promise<PackageDocument> {
    const deliverables = dto.deliverables ?? [];
    this.assertUniqueDeliverableKeys(deliverables);
    try {
      const payload: Partial<Package> = {
        name: dto.name.trim(),
        description: dto.description,
        color: dto.color,
        hoursPerPeriod: dto.hoursPerPeriod,
        deliverables: deliverables as unknown as Package['deliverables'],
      };
      const doc = await this.model.create(payload as Package);
      return (doc as unknown as PackageDocument).toObject() as never;
    } catch (e) {
      const err = e as {
        code?: number;
        message?: string;
        name?: string;
        errors?: Record<string, { message: string }>;
      };
      if (err.code === 11000) {
        throw new BadRequestException(
          `A package named "${dto.name}" already exists.`,
        );
      }
      if (err.name === 'ValidationError' && err.errors) {
        const details = Object.entries(err.errors)
          .map(([field, e]) => `${field}: ${e.message}`)
          .join('; ');
        this.logger.warn(`Package create validation failed: ${details}`);
        throw new BadRequestException(`Package validation failed: ${details}`);
      }
      this.logger.error(
        `Package create failed: ${err.message}`,
        (e as Error).stack,
      );
      throw e;
    }
  }

  async update(id: string, dto: UpdatePackageDto): Promise<PackageDocument> {
    if (dto.deliverables) this.assertUniqueDeliverableKeys(dto.deliverables);
    try {
      const payload: Partial<Package> = {};
      if (dto.name !== undefined) payload.name = dto.name.trim();
      if (dto.description !== undefined) payload.description = dto.description;
      if (dto.color !== undefined) payload.color = dto.color;
      if (dto.hoursPerPeriod !== undefined)
        payload.hoursPerPeriod = dto.hoursPerPeriod;
      if (dto.deliverables !== undefined)
        payload.deliverables = dto.deliverables as unknown as Package['deliverables'];
      const doc = await this.model
        .findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true })
        .lean()
        .exec();
      if (!doc) throw new NotFoundException(`Package ${id} not found`);
      return doc as never;
    } catch (e) {
      const err = e as {
        code?: number;
        message?: string;
        name?: string;
        errors?: Record<string, { message: string }>;
      };
      if (err.code === 11000) {
        throw new BadRequestException(`Another package already uses that name.`);
      }
      if (err.name === 'ValidationError' && err.errors) {
        const details = Object.entries(err.errors)
          .map(([field, e]) => `${field}: ${e.message}`)
          .join('; ');
        this.logger.warn(`Package update validation failed: ${details}`);
        throw new BadRequestException(`Package validation failed: ${details}`);
      }
      this.logger.error(
        `Package update failed: ${err.message}`,
        (e as Error).stack,
      );
      throw e;
    }
  }

  async remove(id: string): Promise<{ deleted: true }> {
    // Refuse deletion when any client still references the package —
    // silent orphaning is worse than a clear error the operator can act
    // on (reassign the clients, then delete).
    const inUse = await this.clientsModel
      .countDocuments({ packageId: new Types.ObjectId(id) })
      .exec();
    if (inUse > 0) {
      throw new BadRequestException(
        `Package is still assigned to ${inUse} client${inUse === 1 ? '' : 's'}. Reassign them before deleting.`,
      );
    }
    const res = await this.model.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException(`Package ${id} not found`);
    return { deleted: true };
  }

  private assertUniqueDeliverableKeys(
    deliverables: Array<{ key: string }>,
  ): void {
    const seen = new Set<string>();
    for (const d of deliverables) {
      if (seen.has(d.key)) {
        throw new BadRequestException(
          `Duplicate deliverable key "${d.key}" — keys must be unique within a package.`,
        );
      }
      seen.add(d.key);
    }
  }
}
