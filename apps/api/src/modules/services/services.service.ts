import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PackageColor } from '@seo/shared';
import { Service, ServiceDocument } from './service.schema';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

interface DefaultServiceSeed {
  slug: string;
  name: string;
  color: PackageColor;
  icon: string;
  order: number;
}

// Baseline catalog seeded on first boot. Admin can rename / recolor /
// disable / reorder / add more from Settings → Services after.
const DEFAULT_SERVICES: DefaultServiceSeed[] = [
  { slug: 'seo', name: 'SEO', color: 'positive', icon: '🔎', order: 10 },
  { slug: 'ppc', name: 'PPC', color: 'sky', icon: '📣', order: 20 },
  { slug: 'website', name: 'Website', color: 'brand', icon: '🌐', order: 30 },
  { slug: 'tracking', name: 'Tracking', color: 'purple', icon: '📊', order: 40 },
  { slug: 'other', name: 'Other', color: 'ink', icon: '🔧', order: 90 },
];

@Injectable()
export class ServicesService implements OnModuleInit {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    @InjectModel(Service.name)
    private readonly model: Model<ServiceDocument>,
  ) {}

  /**
   * Seed the default service catalog on first boot. Idempotent per
   * slug — an existing entry with the same slug is left alone. Admin
   * edits are preserved across restarts.
   */
  async onModuleInit(): Promise<void> {
    for (const seed of DEFAULT_SERVICES) {
      const exists = await this.model.exists({ slug: seed.slug });
      if (exists) continue;
      await this.model.create({ ...seed, active: true });
      this.logger.log(`Seeded service "${seed.name}" (${seed.slug}).`);
    }
  }

  findAll() {
    return this.model.find().sort({ order: 1, name: 1 }).lean().exec();
  }

  async findOne(id: string) {
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) throw new NotFoundException(`Service ${id} not found`);
    return doc;
  }

  /** Lookup by slug — used by migrations to find the canonical SEO /
   *  PPC / … service ids for backfilling. */
  findBySlug(slug: string) {
    return this.model.findOne({ slug }).lean().exec();
  }

  async create(dto: CreateServiceDto) {
    const clash = await this.model.findOne({
      $or: [{ slug: dto.slug }, { name: dto.name }],
    });
    if (clash) throw new ConflictException('Service slug or name already in use');
    return this.model.create({
      ...dto,
      color: dto.color ?? 'sky',
      order: dto.order ?? 100,
      active: dto.active ?? true,
    });
  }

  async update(id: string, dto: UpdateServiceDto) {
    if (dto.slug || dto.name) {
      const clash = await this.model.findOne({
        _id: { $ne: id },
        $or: [
          ...(dto.slug ? [{ slug: dto.slug }] : []),
          ...(dto.name ? [{ name: dto.name }] : []),
        ],
      });
      if (clash) throw new ConflictException('Service slug or name already in use');
    }
    const doc = await this.model
      .findByIdAndUpdate(id, dto, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException(`Service ${id} not found`);
    return doc;
  }

  async remove(id: string) {
    // Soft-guard: refuse to remove a service that still has packages
    // or subscriptions tied to it. The check happens in ClientsService /
    // PackagesService before this is called (via ServiceRemovalGuard
    // usage down the road) — for now we just allow the delete and
    // trust the admin.
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Service ${id} not found`);
    if (DEFAULT_SERVICES.some((s) => s.slug === doc.slug)) {
      throw new BadRequestException(
        `Cannot delete built-in service "${doc.name}". Deactivate it instead.`,
      );
    }
    await doc.deleteOne();
    return { deleted: true };
  }
}
