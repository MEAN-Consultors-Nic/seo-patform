import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GscKeywordPullResult } from '@seo/shared';
import { Keyword, KeywordDocument } from './keyword.schema';
import {
  KeywordRanking,
  KeywordRankingDocument,
} from './keyword-ranking.schema';
import { RecordPositionDto, UpsertKeywordDto } from './dto/upsert-keyword.dto';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';
import { GscService } from '../google-integrations/gsc.service';

@Injectable()
export class KeywordsService {
  constructor(
    @InjectModel(Keyword.name) private readonly keywordModel: Model<KeywordDocument>,
    @InjectModel(KeywordRanking.name)
    private readonly rankingModel: Model<KeywordRankingDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
    private readonly gsc: GscService,
  ) {}

  private async ensureAccessToKeyword(
    id: string,
    user?: AuthenticatedUser,
  ): Promise<KeywordDocument> {
    const kw = await this.keywordModel.findById(id).exec();
    if (!kw) throw new NotFoundException(`Keyword ${id} not found`);
    if (user) await this.clients.assertAccess(kw.clientId.toString(), user);
    return kw;
  }

  byClient(clientId: string) {
    return this.keywordModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ group: 1, text: 1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToKeyword(id, user);
    return this.keywordModel.findById(id).lean().exec();
  }

  async create(dto: UpsertKeywordDto) {
    return this.keywordModel.create({
      ...dto,
      clientId: new Types.ObjectId(dto.clientId),
    });
  }

  async update(
    id: string,
    dto: Partial<UpsertKeywordDto>,
    user?: AuthenticatedUser,
  ) {
    await this.ensureAccessToKeyword(id, user);
    if (dto.clientId && user) await this.clients.assertAccess(dto.clientId, user);
    const patch: Record<string, unknown> = { ...dto };
    if (dto.clientId) patch.clientId = new Types.ObjectId(dto.clientId);
    const updated = await this.keywordModel
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException(`Keyword ${id} not found`);
    return updated;
  }

  async remove(id: string, user?: AuthenticatedUser) {
    await this.ensureAccessToKeyword(id, user);
    await this.rankingModel
      .deleteMany({ keywordId: new Types.ObjectId(id) })
      .exec();
    const deleted = await this.keywordModel.findByIdAndDelete(id).lean().exec();
    if (!deleted) throw new NotFoundException(`Keyword ${id} not found`);
    return { deleted: true };
  }

  async recordPosition(
    keywordId: string,
    dto: RecordPositionDto,
    user?: AuthenticatedUser,
  ) {
    const kw = await this.ensureAccessToKeyword(keywordId, user);

    const normalizedUrl = dto.rankingUrl?.trim() || undefined;

    await this.rankingModel.create({
      keywordId: kw._id,
      position: dto.position,
      rankingUrl: normalizedUrl,
      device: dto.device || 'desktop',
      location: dto.location,
      notes: dto.notes,
    });

    // Track URL change
    if (normalizedUrl && normalizedUrl !== kw.currentRankingUrl) {
      kw.previousRankingUrl = kw.currentRankingUrl;
      kw.currentRankingUrl = normalizedUrl;
      kw.urlChangedAt = new Date();
    }

    // Update positions
    kw.previousPosition = kw.currentPosition;
    kw.currentPosition = dto.position;
    kw.lastCheckedAt = new Date();

    // Track best position
    if (!kw.bestPosition || dto.position < kw.bestPosition) {
      kw.bestPosition = dto.position;
      kw.bestPositionAt = new Date();
    }

    await kw.save();
    return kw.toObject();
  }

  async history(keywordId: string, user?: AuthenticatedUser, limit = 60) {
    await this.ensureAccessToKeyword(keywordId, user);
    return this.rankingModel
      .find({ keywordId: new Types.ObjectId(keywordId) })
      .sort({ recordedAt: 1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async timeline(keywordId: string, user?: AuthenticatedUser) {
    await this.ensureAccessToKeyword(keywordId, user);
    const [keyword, rankings] = await Promise.all([
      this.keywordModel.findById(keywordId).lean().exec(),
      this.rankingModel
        .find({ keywordId: new Types.ObjectId(keywordId) })
        .sort({ recordedAt: 1 })
        .lean()
        .exec(),
    ]);
    if (!keyword) throw new NotFoundException(`Keyword ${keywordId} not found`);

    // Detect URL change events
    const urlEvents: Array<{ from?: string; to: string; date: Date }> = [];
    let lastUrl: string | undefined;
    for (const r of rankings) {
      if (r.rankingUrl && r.rankingUrl !== lastUrl) {
        urlEvents.push({ from: lastUrl, to: r.rankingUrl, date: r.recordedAt });
        lastUrl = r.rankingUrl;
      }
    }

    return { keyword, rankings, urlEvents };
  }

  async summaryByClient(clientId: string) {
    const list = await this.byClient(clientId);
    const total = list.length;
    const ranked = list.filter((k) => typeof k.currentPosition === 'number');
    const top3 = ranked.filter((k) => (k.currentPosition || 999) <= 3).length;
    const top10 = ranked.filter((k) => (k.currentPosition || 999) <= 10).length;
    const top20 = ranked.filter((k) => (k.currentPosition || 999) <= 20).length;
    const avg =
      ranked.length > 0
        ? ranked.reduce((acc, k) => acc + (k.currentPosition || 0), 0) /
          ranked.length
        : null;
    return {
      total,
      ranked: ranked.length,
      unranked: total - ranked.length,
      top3,
      top10,
      top20,
      avgPosition: avg,
    };
  }

  async movements(clientId: string) {
    const list = await this.byClient(clientId);
    const gainers: Array<{ keyword: typeof list[number]; delta: number; direction: string }> = [];
    const losers: typeof gainers = [];
    const flat: typeof gainers = [];
    const fresh: typeof gainers = [];

    for (const kw of list) {
      if (
        typeof kw.currentPosition === 'number' &&
        typeof kw.previousPosition === 'number'
      ) {
        const delta = kw.previousPosition - kw.currentPosition;
        if (delta > 0) gainers.push({ keyword: kw, delta, direction: 'up' });
        else if (delta < 0) losers.push({ keyword: kw, delta, direction: 'down' });
        else flat.push({ keyword: kw, delta: 0, direction: 'flat' });
      } else if (typeof kw.currentPosition === 'number') {
        fresh.push({ keyword: kw, delta: 0, direction: 'new' });
      }
    }

    gainers.sort((a, b) => b.delta - a.delta);
    losers.sort((a, b) => a.delta - b.delta);

    return { gainers, losers, flat, fresh };
  }

  async volatility(clientId: string) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const list = await this.byClient(clientId);
    const result: Array<{
      keyword: typeof list[number];
      uniqueUrls: number;
      urls: string[];
      changesIn90Days: number;
    }> = [];

    for (const kw of list) {
      if (!kw._id) continue;
      const rankings = await this.rankingModel
        .find({
          keywordId: kw._id,
          recordedAt: { $gte: ninetyDaysAgo },
          rankingUrl: { $exists: true, $ne: null },
        })
        .sort({ recordedAt: 1 })
        .lean()
        .exec();

      const uniqueUrls = new Set(
        rankings.map((r) => r.rankingUrl).filter(Boolean) as string[],
      );
      let changes = 0;
      let last: string | undefined;
      for (const r of rankings) {
        if (r.rankingUrl && r.rankingUrl !== last) {
          if (last) changes++;
          last = r.rankingUrl;
        }
      }
      if (uniqueUrls.size > 1) {
        result.push({
          keyword: kw,
          uniqueUrls: uniqueUrls.size,
          urls: Array.from(uniqueUrls),
          changesIn90Days: changes,
        });
      }
    }
    result.sort((a, b) => b.changesIn90Days - a.changesIn90Days);
    return result;
  }

  // --- GSC import / revert ------------------------------------------------

  async pullFromGsc(
    clientId: string,
    user: AuthenticatedUser,
    opts: {
      from: string;
      to: string;
      limit?: number;
      minImpressions?: number;
    },
  ): Promise<GscKeywordPullResult> {
    const client = await this.clients.findOne(clientId, user);
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'GSC site URL is not configured for this client. Set it in the Integrations tab first.',
      );
    }
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const minImpressions = Math.max(opts.minImpressions ?? 0, 0);

    const rows = await this.gsc.topQueries(
      user.userId,
      client.gscSiteUrl,
      opts.from,
      opts.to,
      limit,
    );

    const warnings: string[] = [];
    const clientObjId = new Types.ObjectId(clientId);
    const now = new Date();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      const text = (row.key || '').trim();
      if (!text) {
        skipped++;
        continue;
      }
      if (row.impressions < minImpressions) {
        skipped++;
        continue;
      }
      const existing = await this.keywordModel
        .findOne({ clientId: clientObjId, text })
        .exec();
      const position = row.position ? Number(row.position.toFixed(1)) : undefined;
      const gscPayload = {
        gscPulledAt: now,
        gscClicks: Math.round(row.clicks),
        gscImpressions: Math.round(row.impressions),
        gscCtr: Number(row.ctr.toFixed(2)),
        gscPosition: position,
      };
      if (existing) {
        // Capture previous position for delta tracking
        if (typeof position === 'number' && existing.currentPosition !== position) {
          existing.previousPosition = existing.currentPosition;
        }
        existing.set({
          ...gscPayload,
          currentPosition: position,
          lastCheckedAt: now,
        });
        // Promote to gsc source if it was originally manual: keep source
        // 'manual' so the clean operation never touches user-created rows.
        await existing.save();
        updated++;
      } else {
        await this.keywordModel.create({
          clientId: clientObjId,
          text,
          source: 'gsc',
          currentPosition: position,
          lastCheckedAt: now,
          ...gscPayload,
        });
        created++;
      }
    }

    if (rows.length === 0) {
      warnings.push(
        'GSC returned no queries for this range. Try widening the date range.',
      );
    }
    return {
      created,
      updated,
      skipped,
      totalReturned: rows.length,
      range: { from: opts.from, to: opts.to },
      warnings,
    };
  }

  async cleanGscPulled(clientId: string, user: AuthenticatedUser) {
    await this.clients.assertAccess(clientId, user);
    const clientObjId = new Types.ObjectId(clientId);
    const res = await this.keywordModel
      .deleteMany({ clientId: clientObjId, source: 'gsc' })
      .exec();
    return { deleted: res.deletedCount || 0 };
  }
}
