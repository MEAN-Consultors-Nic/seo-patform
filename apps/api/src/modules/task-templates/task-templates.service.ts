import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ClientTier } from '@seo/shared';
import { TaskTemplate, TaskTemplateDocument } from './task-template.schema';
import { Client, ClientDocument } from '../clients/client.schema';
import { Task, TaskDocument } from '../tasks/task.schema';

const SEED_TEMPLATES = [
  // technical
  { title: 'Review Google Search Console (coverage, CWV, errors)', category: 'technical', defaultEstimatedHours: 0.5, defaultPriority: 'high', applicableTiers: ['A', 'B', 'C'] },
  { title: 'Crawl with Screaming Frog or Sitebulb', category: 'technical', defaultEstimatedHours: 1, defaultPriority: 'high', applicableTiers: ['A'] },
  { title: 'Verify indexing of new pages', category: 'technical', defaultEstimatedHours: 0.25, defaultPriority: 'medium', applicableTiers: ['A', 'B'] },
  { title: 'Validate schema/structured data on critical pages', category: 'technical', defaultEstimatedHours: 0.5, defaultPriority: 'medium', applicableTiers: ['A'] },
  // onpage
  { title: 'Optimize 2-3 pages (title, meta, headings, internal links)', category: 'onpage', defaultEstimatedHours: 2, defaultPriority: 'high', applicableTiers: ['A'] },
  { title: 'Optimize 1 target page', category: 'onpage', defaultEstimatedHours: 1.5, defaultPriority: 'high', applicableTiers: ['B'] },
  { title: 'Quick win on-page (title or meta)', category: 'onpage', defaultEstimatedHours: 0.5, defaultPriority: 'medium', applicableTiers: ['C'] },
  // content
  { title: 'Publish 1 new piece (or brief)', category: 'content', defaultEstimatedHours: 2, defaultPriority: 'medium', applicableTiers: ['A'] },
  { title: 'Refresh existing content', category: 'content', defaultEstimatedHours: 1, defaultPriority: 'medium', applicableTiers: ['B'] },
  // offpage
  { title: 'Active outreach (3-5 prospects)', category: 'offpage', defaultEstimatedHours: 1.5, defaultPriority: 'medium', applicableTiers: ['A'] },
  { title: 'Review backlink profile (toxic links)', category: 'offpage', defaultEstimatedHours: 0.5, defaultPriority: 'low', applicableTiers: ['A', 'B'] },
  { title: 'Citations / NAP consistency check', category: 'offpage', defaultEstimatedHours: 0.5, defaultPriority: 'medium', applicableTiers: ['B', 'C'] },
  // local-gbp
  { title: 'GBP: 1-2 posts for the period', category: 'local-gbp', defaultEstimatedHours: 0.5, defaultPriority: 'medium', applicableTiers: ['B', 'C'] },
  { title: 'GBP: respond to reviews + Q&A', category: 'local-gbp', defaultEstimatedHours: 0.25, defaultPriority: 'medium', applicableTiers: ['B', 'C'] },
  { title: 'GBP: new photos', category: 'local-gbp', defaultEstimatedHours: 0.25, defaultPriority: 'low', applicableTiers: ['C'] },
  // monitoring
  { title: 'Rank tracking review', category: 'monitoring', defaultEstimatedHours: 0.5, defaultPriority: 'medium', applicableTiers: ['A', 'B'] },
  { title: 'Analysis of 1 competitor', category: 'monitoring', defaultEstimatedHours: 0.5, defaultPriority: 'low', applicableTiers: ['A'] },
  // reporting
  { title: 'Write bi-weekly report', category: 'reporting', defaultEstimatedHours: 1.5, defaultPriority: 'high', applicableTiers: ['A'] },
  { title: 'Write bi-weekly report', category: 'reporting', defaultEstimatedHours: 0.75, defaultPriority: 'high', applicableTiers: ['B'] },
  { title: 'Write bi-weekly report', category: 'reporting', defaultEstimatedHours: 0.5, defaultPriority: 'high', applicableTiers: ['C'] },
];

@Injectable()
export class TaskTemplatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TaskTemplatesService.name);

  constructor(
    @InjectModel(TaskTemplate.name) private readonly model: Model<TaskTemplateDocument>,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.model.countDocuments().exec();
    if (count > 0) return;
    this.logger.log(`Seeding ${SEED_TEMPLATES.length} task templates...`);
    await this.model.insertMany(SEED_TEMPLATES.map((t) => ({ ...t, active: true })));
    this.logger.log('Task templates seeded ✔');
  }

  list(
    filters: { tier?: ClientTier; packageId?: string; active?: boolean } = {},
  ) {
    const q: Record<string, unknown> = {};
    if (filters.packageId) {
      q.applicablePackageIds = new Types.ObjectId(filters.packageId);
    } else if (filters.tier) {
      q.applicableTiers = filters.tier;
    }
    if (typeof filters.active === 'boolean') q.active = filters.active;
    return this.model.find(q).sort({ category: 1, title: 1 }).lean().exec();
  }

  create(dto: Partial<TaskTemplate>) {
    return this.model.create(dto);
  }

  async update(id: string, dto: Partial<TaskTemplate>) {
    const updated = await this.model
      .findByIdAndUpdate(id, dto, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Template ${id} not found`);
    return updated;
  }

  async remove(id: string) {
    const deleted = await this.model.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Template ${id} not found`);
    return { deleted: true };
  }

  async applyRecurring(cycleId: string) {
    const [templates, clients] = await Promise.all([
      this.model.find({ active: true }).lean().exec(),
      this.clientModel.find({ active: true }).lean().exec(),
    ]);

    let created = 0;
    let skipped = 0;

    for (const client of clients) {
      const clientPkgId = client.packageId?.toString();
      const applicable = templates.filter((t) => {
        const pkgIds = (t.applicablePackageIds ?? []).map((id) => id.toString());
        if (pkgIds.length > 0 && clientPkgId) {
          return pkgIds.includes(clientPkgId);
        }
        // Fallback for pre-migration templates that still carry tier.
        return (t.applicableTiers ?? []).includes(client.tier as ClientTier);
      });
      for (const tmpl of applicable) {
        const exists = await this.taskModel.exists({
          clientId: client._id,
          cycleId: new Types.ObjectId(cycleId),
          title: tmpl.title,
          category: tmpl.category,
        });
        if (exists) {
          skipped++;
          continue;
        }
        await this.taskModel.create({
          clientId: client._id,
          cycleId: new Types.ObjectId(cycleId),
          title: tmpl.title,
          category: tmpl.category,
          description: tmpl.description,
          estimatedHours: tmpl.defaultEstimatedHours,
          priority: tmpl.defaultPriority,
          status: 'pending',
        });
        created++;
      }
    }

    return { created, skipped, clientsProcessed: clients.length };
  }
}
