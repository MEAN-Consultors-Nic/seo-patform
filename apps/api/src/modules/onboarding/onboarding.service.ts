import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OnboardingAutoCheck,
  OnboardingItem as OnboardingItemType,
  OnboardingItemState,
  OnboardingSnapshot,
} from '@seo/shared';
import {
  OnboardingItem,
  OnboardingItemDocument,
} from './onboarding-item.schema';
import {
  OnboardingProgress,
  OnboardingProgressDocument,
} from './onboarding-progress.schema';
import { CreateOnboardingItemDto } from './dto/create-item.dto';
import { UpdateOnboardingItemDto } from './dto/update-item.dto';
import { UpdateProgressItemDto } from './dto/update-progress.dto';
import { AppSettingsService } from '../app-settings/app-settings.service';

/**
 * Seed items — mirror the reference screenshots so a fresh install
 * boots with a sane starting checklist. Users can extend / edit them
 * from Settings → Onboarding after the seed runs.
 */
const SEED_ITEMS: Array<Omit<OnboardingItemType, '_id'>> = [
  // Accounts & Access
  { key: 'search-console-verified', label: 'Search Console verified', section: 'accounts-access', priority: 'critical', autoCheck: 'gsc-configured', order: 10, active: true },
  { key: 'ga4-connected', label: 'GA4 connected', section: 'accounts-access', priority: 'critical', autoCheck: 'ga4-configured', order: 20, active: true },
  { key: 'gtm-installed', label: 'GTM installed', section: 'accounts-access', priority: 'important', order: 30, active: true },
  { key: 'added-ahrefs', label: 'Added to Ahrefs', section: 'accounts-access', priority: 'critical', order: 40, active: true },
  { key: 'added-semrush', label: 'Added to SEMrush', section: 'accounts-access', priority: 'critical', order: 50, active: true },
  { key: 'website-cms-login', label: 'Website / CMS login stored', section: 'accounts-access', priority: 'important', order: 60, active: true },
  { key: 'gbp-access', label: 'GBP access', section: 'accounts-access', priority: 'important', autoCheck: 'gbp-configured', order: 70, active: true },
  // Local & Listings
  { key: 'gbp-claimed', label: 'GBP claimed & optimized', section: 'local-listings', priority: 'important', order: 10, active: true },
  { key: 'nap-identical', label: 'NAP identical across site + listings', section: 'local-listings', priority: 'important', order: 20, active: true },
  { key: 'local-citations-audited', label: 'Local citations / directories audited', section: 'local-listings', priority: 'nice-to-have', order: 30, active: true },
  { key: 'reviews-strategy', label: 'Reviews / ratings strategy set', section: 'local-listings', priority: 'nice-to-have', order: 40, active: true },
  // Social
  { key: 'social-profiles-identified', label: 'Social profiles identified & linked', section: 'social', priority: 'nice-to-have', order: 10, active: true },
  { key: 'profiles-consistent', label: 'Profiles consistent (name / handle / NAP)', section: 'social', priority: 'nice-to-have', order: 20, active: true },
  // Research & Strategy
  { key: 'keyword-research-done', label: 'Keyword research done', section: 'research-strategy', priority: 'critical', order: 10, active: true },
  { key: 'competitor-analysis', label: 'Competitor analysis (who + what they do)', section: 'research-strategy', priority: 'critical', order: 20, active: true },
  { key: 'target-geography', label: 'Target geography defined', section: 'research-strategy', priority: 'critical', order: 30, active: true },
  { key: 'page-content-plan', label: 'Page / content plan defined', section: 'research-strategy', priority: 'critical', order: 40, active: true },
  { key: 'focus-keywords-mapped', label: 'Focus keywords mapped to pages', section: 'research-strategy', priority: 'important', order: 50, active: true },
  { key: 'technical-crawl-audit', label: 'Technical crawl / audit done', section: 'research-strategy', priority: 'important', order: 60, active: true },
  // Technical
  { key: 'sitemap-submitted', label: 'Sitemap submitted', section: 'technical', priority: 'important', order: 10, active: true },
];

interface ClientSlim {
  _id: Types.ObjectId;
  createdAt?: Date;
  gscSiteUrl?: string;
  ga4PropertyId?: string;
  gbpAccountName?: string;
  shopifyAccessToken?: string;
  wordpressAppPassword?: string;
  googleDocId?: string;
  url?: string;
  logoUrl?: string;
}

@Injectable()
export class OnboardingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectModel(OnboardingItem.name)
    private readonly itemModel: Model<OnboardingItemDocument>,
    @InjectModel(OnboardingProgress.name)
    private readonly progressModel: Model<OnboardingProgressDocument>,
    @InjectModel('Client')
    private readonly clientsModel: Model<ClientSlim>,
    private readonly appSettings: AppSettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const count = await this.itemModel.countDocuments().exec();
      if (count > 0) return;
      await this.itemModel.insertMany(SEED_ITEMS);
      this.logger.log(`Seeded ${SEED_ITEMS.length} onboarding items.`);
    } catch (e) {
      this.logger.error(
        `Onboarding seed failed: ${(e as Error).message}`,
        (e as Error).stack,
      );
    }
  }

  // --- Item CRUD -------------------------------------------------------------

  listItems(includeInactive = false) {
    const q: Record<string, unknown> = {};
    if (!includeInactive) q.active = true;
    return this.itemModel
      .find(q)
      .sort({ section: 1, order: 1, label: 1 })
      .lean()
      .exec();
  }

  async createItem(dto: CreateOnboardingItemDto) {
    try {
      const doc = await this.itemModel.create(dto);
      return doc.toObject();
    } catch (e) {
      const err = e as { code?: number };
      if (err.code === 11000) {
        throw new BadRequestException(
          `Onboarding item key "${dto.key}" already exists.`,
        );
      }
      throw e;
    }
  }

  async updateItem(id: string, dto: UpdateOnboardingItemDto) {
    const doc = await this.itemModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException(`Onboarding item ${id} not found`);
    return doc;
  }

  async removeItem(id: string) {
    const res = await this.itemModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException(`Onboarding item ${id} not found`);
    return { deleted: true };
  }

  // --- Per-client snapshot / progress ----------------------------------------

  /**
   * Merged view: template items + persisted per-client state + resolved
   * auto-check flag + summary counts + "past window" boolean. This is
   * what the client Onboarding tab renders. Everything is computed on
   * read so integration status changes reflect immediately without
   * needing to poke the progress doc.
   */
  async snapshot(clientId: string): Promise<OnboardingSnapshot> {
    const clientOid = new Types.ObjectId(clientId);
    const [items, progress, client, windowDays] = await Promise.all([
      this.listItems(false),
      this.progressModel.findOne({ clientId: clientOid }).lean().exec(),
      this.clientsModel.findById(clientOid).lean().exec(),
      this.appSettings.getOnboardingWindowDays(),
    ]);
    const stateByKey = new Map<
      string,
      { state: OnboardingItemState; completedAt?: Date }
    >();
    for (const p of progress?.items ?? []) {
      stateByKey.set(p.key, { state: p.state, completedAt: p.completedAt });
    }
    const merged = items.map((it) => {
      const persisted = stateByKey.get(it.key);
      let state: OnboardingItemState = persisted?.state ?? 'pending';
      let autoResolved = false;
      if (
        !persisted &&
        it.autoCheck &&
        this.resolveAutoCheck(it.autoCheck, client)
      ) {
        state = 'done';
        autoResolved = true;
      }
      return {
        ...it,
        _id: String((it as { _id?: unknown })._id ?? ''),
        state,
        autoResolved,
        completedAt: persisted?.completedAt,
      } as OnboardingSnapshot['items'][number];
    });
    const totalRequired = merged.filter((m) => m.state !== 'na').length;
    const doneCount = merged.filter((m) => m.state === 'done').length;
    const pendingCount = merged.filter((m) => m.state === 'pending').length;
    const naCount = merged.filter((m) => m.state === 'na').length;
    const criticalPendingKeys = merged
      .filter((m) => m.priority === 'critical' && m.state === 'pending')
      .map((m) => m.key);
    const createdAt = client?.createdAt
      ? new Date(client.createdAt).getTime()
      : Date.now();
    const daysSinceCreated = Math.max(
      0,
      Math.floor((Date.now() - createdAt) / 86400000),
    );
    const pastWindow =
      daysSinceCreated >= windowDays && criticalPendingKeys.length > 0;
    return {
      items: merged,
      totalRequired,
      doneCount,
      pendingCount,
      naCount,
      criticalPendingKeys,
      windowDays,
      daysSinceCreated,
      pastWindow,
    };
  }

  async setState(
    clientId: string,
    dto: UpdateProgressItemDto,
    userId?: string,
  ): Promise<OnboardingSnapshot> {
    const clientOid = new Types.ObjectId(clientId);
    // Require the item to exist so orphan progress rows don't pile up.
    const item = await this.itemModel.findOne({ key: dto.key }).lean().exec();
    if (!item) {
      throw new NotFoundException(
        `No onboarding item with key "${dto.key}". Create it in Settings first.`,
      );
    }
    const now = new Date();
    const setPayload: Record<string, unknown> = {
      'items.$.state': dto.state,
      'items.$.notes': dto.notes,
    };
    if (dto.state === 'done') {
      setPayload['items.$.completedAt'] = now;
      if (userId) setPayload['items.$.completedBy'] = new Types.ObjectId(userId);
    } else {
      setPayload['items.$.completedAt'] = undefined;
      setPayload['items.$.completedBy'] = undefined;
    }
    const updated = await this.progressModel
      .findOneAndUpdate(
        { clientId: clientOid, 'items.key': dto.key },
        { $set: setPayload },
        { new: true },
      )
      .exec();
    if (!updated) {
      await this.progressModel
        .findOneAndUpdate(
          { clientId: clientOid },
          {
            $setOnInsert: { clientId: clientOid },
            $push: {
              items: {
                key: dto.key,
                state: dto.state,
                notes: dto.notes,
                completedAt: dto.state === 'done' ? now : undefined,
                completedBy:
                  dto.state === 'done' && userId
                    ? new Types.ObjectId(userId)
                    : undefined,
              },
            },
          },
          { upsert: true, new: true },
        )
        .exec();
    }
    return this.snapshot(clientId);
  }

  private resolveAutoCheck(
    check: OnboardingAutoCheck,
    client: ClientSlim | null,
  ): boolean {
    if (!client) return false;
    switch (check) {
      case 'gsc-configured':
        return !!client.gscSiteUrl;
      case 'ga4-configured':
        return !!client.ga4PropertyId;
      case 'gbp-configured':
        return !!client.gbpAccountName;
      case 'shopify-connected':
        return !!client.shopifyAccessToken;
      case 'wordpress-connected':
        return !!client.wordpressAppPassword;
      case 'google-doc-linked':
        return !!client.googleDocId;
      case 'website-set':
        return !!client.url;
      case 'logo-set':
        return !!client.logoUrl;
    }
    return false;
  }
}
