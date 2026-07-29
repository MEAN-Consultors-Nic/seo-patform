import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../clients/client.schema';
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

/**
 * Per-user OAuth resolver (Core Slice 1.2). Returns the userId whose
 * Google token should authenticate downstream API calls for the given
 * client — always the client's assigned owner when set, with a
 * fallback to the caller for legacy data.
 */
function resolveOwnerUserId(
  client: { ownerId?: unknown },
  caller: AuthenticatedUser,
): string {
  const owner = client.ownerId;
  if (typeof owner === 'string') return owner;
  if (owner && typeof owner === 'object' && '_id' in owner) {
    return String((owner as { _id: unknown })._id);
  }
  return caller.userId;
}

@Injectable()
export class KeywordsService {
  private readonly logger = new Logger(KeywordsService.name);

  constructor(
    @InjectModel(Keyword.name) private readonly keywordModel: Model<KeywordDocument>,
    @InjectModel(KeywordRanking.name)
    private readonly rankingModel: Model<KeywordRankingDocument>,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clients: ClientsService,
    private readonly gsc: GscService,
  ) {}

  /**
   * Daily position snapshot cron. For every active client with a GSC
   * site URL configured, pull yesterday's search analytics for each
   * tracked keyword and persist a KeywordRanking row. This drives
   * the Position Tracker's historical trend line and gainers/losers
   * views. Runs at 4am UTC so it lands after GSC's overnight
   * ingest (they typically publish new data around 2-3am UTC).
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async snapshotAllClientsFromGsc(): Promise<void> {
    const clients = await this.clientModel
      .find(
        { active: { $ne: false }, gscSiteUrl: { $exists: true, $ne: '' } },
        { _id: 1, gscSiteUrl: 1, ownerId: 1, positionTrackingCountry: 1 },
      )
      .lean()
      .exec();
    if (!clients.length) return;

    // GSC data typically lags 2-3 days. Use yesterday as an
    // upper bound; take a 3-day window so keywords with sparse
    // impressions still get a datapoint.
    const to = new Date();
    to.setUTCDate(to.getUTCDate() - 2);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 2);
    const toIso = this.isoDate(to);
    const fromIso = this.isoDate(from);

    let ok = 0;
    let skipped = 0;
    for (const c of clients) {
      const owner = c.ownerId;
      const ownerId =
        typeof owner === 'string'
          ? owner
          : owner && typeof owner === 'object' && '_id' in owner
            ? String((owner as { _id: unknown })._id)
            : '';
      if (!ownerId) {
        skipped++;
        continue;
      }
      try {
        // Reuse the existing sync path — same snapshotting logic as
        // when a user hits the "Sync from GSC" button manually.
        await this.syncFromGsc(
          String(c._id),
          {
            userId: ownerId,
            email: '',
            role: 'root',
          } as AuthenticatedUser,
          { from: fromIso, to: toIso },
        );
        ok++;
      } catch (err) {
        this.logger.warn(
          `Daily position snapshot failed for client ${c._id}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `Daily position snapshot: ${ok} client(s) synced, ${skipped} skipped for missing owner.`,
    );
  }

  private isoDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

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
    // Per-user OAuth: authenticate to GSC as the client's assigned
    // strategist, not the caller. Falls back to caller for legacy
    // clients without an ownerId set.
    const tokenUserId = resolveOwnerUserId(client, user);
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const minImpressions = Math.max(opts.minImpressions ?? 0, 0);

    const rows = await this.gsc.topQueries(
      tokenUserId,
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

  /**
   * Refresh GSC metrics (position, impressions, clicks, CTR) for every
   * existing keyword of the client by querying GSC per-keyword. Unlike
   * pullFromGsc — which imports top queries as new keywords — this method
   * targets the keywords that are already in the platform regardless of
   * how popular they are in GSC.
   */
  async syncFromGsc(
    clientId: string,
    user: AuthenticatedUser,
    opts: { from: string; to: string },
  ): Promise<{
    updated: number;
    notFound: number;
    failed: number;
    totalProcessed: number;
    range: { from: string; to: string };
    country?: string;
    warnings: string[];
  }> {
    const client = await this.clients.findOne(clientId, user);
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'GSC site URL is not configured for this client. Set it in the Integrations tab first.',
      );
    }
    const tokenUserId = resolveOwnerUserId(client, user);
    const clientObjId = new Types.ObjectId(clientId);
    const keywords = await this.keywordModel
      .find({ clientId: clientObjId })
      .exec();

    // Client-configured geo filter, normalized to alpha-3 lowercase.
    // Undefined means "worldwide" (legacy behavior).
    const country = (
      client as unknown as { positionTrackingCountry?: string }
    ).positionTrackingCountry
      ?.toLowerCase()
      ?.trim() || undefined;

    const warnings: string[] = [];
    const now = new Date();
    let updated = 0;
    let notFound = 0;
    let failed = 0;

    // GSC accepts ~1200 queries/minute per site. Process in small parallel
    // batches so a client with 50+ keywords completes in a few seconds.
    const CONCURRENCY = 5;
    for (let i = 0; i < keywords.length; i += CONCURRENCY) {
      const batch = keywords.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (kw) => {
          try {
            const row = await this.gsc.queryStats(
              tokenUserId,
              client.gscSiteUrl as string,
              opts.from,
              opts.to,
              kw.text,
              country,
            );
            if (!row) {
              kw.set({
                gscPulledAt: now,
                gscClicks: 0,
                gscImpressions: 0,
                gscCtr: 0,
                gscPosition: undefined,
                lastCheckedAt: now,
              });
              await kw.save();
              notFound++;
              return;
            }
            const position = row.position
              ? Number(row.position.toFixed(1))
              : undefined;
            if (
              typeof position === 'number' &&
              kw.currentPosition !== position
            ) {
              kw.previousPosition = kw.currentPosition;
            }
            if (
              typeof position === 'number' &&
              (typeof kw.bestPosition !== 'number' || position < kw.bestPosition)
            ) {
              kw.bestPosition = position;
              kw.bestPositionAt = now;
            }
            kw.set({
              currentPosition: position,
              gscPulledAt: now,
              gscClicks: Math.round(row.clicks),
              gscImpressions: Math.round(row.impressions),
              gscCtr: Number(row.ctr.toFixed(2)),
              gscPosition: position,
              lastCheckedAt: now,
            });
            await kw.save();
            // Persist a historical snapshot so the Position Tracker
            // has a real time-series to chart. Only when we actually
            // have a position — otherwise the row would just noise
            // up the "no position" state. Tag the snapshot with the
            // country filter used for the pull so the tracker can
            // segment historical rows by geo without polluting
            // buckets.
            if (typeof position === 'number') {
              await this.rankingModel.create({
                keywordId: kw._id,
                position,
                device: 'desktop',
                country,
                recordedAt: now,
              });
            }
            updated++;
          } catch (err) {
            warnings.push(`${kw.text}: ${(err as Error).message}`);
            failed++;
          }
        }),
      );
    }

    return {
      updated,
      notFound,
      failed,
      totalProcessed: keywords.length,
      range: { from: opts.from, to: opts.to },
      country,
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

  /**
   * Time-series of keyword positions across a date range. Groups
   * ranking rows into daily buckets per keyword so the frontend
   * chart doesn't need to bucket them itself. Optional keyword
   * filter lets the drill-down view request a single keyword's
   * history.
   */
  async positionHistory(
    clientId: string,
    user: AuthenticatedUser,
    opts: {
      from: string;
      to: string;
      keywordId?: string;
      limit?: number;
      /**
       * ISO alpha-3 lowercase; when provided, restricts snapshots to
       * that country only. Sentinel value 'worldwide' explicitly
       * targets legacy untagged rows (country field missing). When
       * unset, no geo filter is applied.
       */
      country?: string;
    },
  ): Promise<
    Array<{
      keywordId: string;
      keyword: string;
      points: Array<{ date: string; position: number }>;
    }>
  > {
    await this.clients.assertAccess(clientId, user);
    const clientObjId = new Types.ObjectId(clientId);
    const kwQuery: Record<string, unknown> = { clientId: clientObjId };
    if (opts.keywordId) {
      kwQuery._id = new Types.ObjectId(opts.keywordId);
    }
    const keywords = await this.keywordModel
      .find(kwQuery, { _id: 1, text: 1 })
      .lean()
      .exec();
    if (keywords.length === 0) return [];
    const kwIds = keywords.map((k) => k._id as Types.ObjectId);
    const fromDate = new Date(`${opts.from}T00:00:00.000Z`);
    const toDate = new Date(`${opts.to}T23:59:59.999Z`);

    // Aggregate rankings by (keywordId, day) — using $group on a
    // truncated recordedAt so multiple snapshots in the same day
    // collapse to one point (average). Positions past `limit` for a
    // single keyword are dropped to keep the payload tight.
    const match: Record<string, unknown> = {
      keywordId: { $in: kwIds },
      recordedAt: { $gte: fromDate, $lte: toDate },
    };
    if (opts.country === 'worldwide') {
      // Explicit worldwide/legacy bucket — rows without a country tag.
      match.country = { $in: [null, undefined] };
    } else if (opts.country) {
      match.country = opts.country.toLowerCase();
    }
    const raw = await this.rankingModel
      .aggregate([
        {
          $match: match,
        },
        {
          $group: {
            _id: {
              keywordId: '$keywordId',
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$recordedAt',
                  timezone: 'UTC',
                },
              },
            },
            position: { $avg: '$position' },
          },
        },
        { $sort: { '_id.keywordId': 1, '_id.day': 1 } },
      ])
      .exec();

    const grouped = new Map<
      string,
      Array<{ date: string; position: number }>
    >();
    for (const r of raw as Array<{
      _id: { keywordId: Types.ObjectId; day: string };
      position: number;
    }>) {
      const key = String(r._id.keywordId);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({
        date: r._id.day,
        position: Number(r.position.toFixed(1)),
      });
    }
    return keywords.map((k) => ({
      keywordId: String(k._id),
      keyword: k.text,
      points: grouped.get(String(k._id)) || [],
    }));
  }

  /**
   * Top gainers / losers over the past N days, computed by comparing
   * each keyword's earliest ranking in the window to its latest. Also
   * returns "new" (keywords that just started appearing) and "lost"
   * (keywords that fell off the SERP) buckets so the UI can surface
   * both wins and problems.
   */
  async positionMovers(
    clientId: string,
    user: AuthenticatedUser,
    days = 7,
    limit = 10,
    /** ISO alpha-3 country filter; 'worldwide' targets legacy untagged rows. */
    country?: string,
  ): Promise<{
    gainers: Array<{
      keywordId: string;
      keyword: string;
      from: number;
      to: number;
      change: number;
    }>;
    losers: Array<{
      keywordId: string;
      keyword: string;
      from: number;
      to: number;
      change: number;
    }>;
    windowDays: number;
  }> {
    await this.clients.assertAccess(clientId, user);
    const clientObjId = new Types.ObjectId(clientId);
    const keywords = await this.keywordModel
      .find({ clientId: clientObjId }, { _id: 1, text: 1 })
      .lean()
      .exec();
    if (keywords.length === 0) {
      return { gainers: [], losers: [], windowDays: days };
    }
    const kwIds = keywords.map((k) => k._id as Types.ObjectId);
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - days);

    // For each keyword, find the earliest and latest ranking within
    // the window in a single aggregation pass.
    const moversMatch: Record<string, unknown> = {
      keywordId: { $in: kwIds },
      recordedAt: { $gte: windowStart, $lte: now },
    };
    if (country === 'worldwide') {
      moversMatch.country = { $in: [null, undefined] };
    } else if (country) {
      moversMatch.country = country.toLowerCase();
    }
    const raw = (await this.rankingModel
      .aggregate([
        {
          $match: moversMatch,
        },
        { $sort: { keywordId: 1, recordedAt: 1 } },
        {
          $group: {
            _id: '$keywordId',
            first: { $first: '$position' },
            last: { $last: '$position' },
            count: { $sum: 1 },
          },
        },
      ])
      .exec()) as Array<{
      _id: Types.ObjectId;
      first: number;
      last: number;
      count: number;
    }>;

    const kwMap = new Map(keywords.map((k) => [String(k._id), k.text]));
    const items = raw
      .filter((r) => r.count >= 2 && r.first !== r.last)
      .map((r) => {
        // Lower position = better rank, so a decrease in the number
        // is a gain. `change` is expressed as positive-is-good
        // (delta improvement in rank).
        const change = r.first - r.last;
        return {
          keywordId: String(r._id),
          keyword: kwMap.get(String(r._id)) || '(unknown)',
          from: Number(r.first.toFixed(1)),
          to: Number(r.last.toFixed(1)),
          change: Number(change.toFixed(1)),
        };
      });
    const gainers = items
      .filter((i) => i.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, limit);
    const losers = items
      .filter((i) => i.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, limit);
    return { gainers, losers, windowDays: days };
  }

  /**
   * Manual on-demand snapshot for a single client. Used by the
   * "Snapshot now" button on the Position Tracker tab when the
   * strategist wants a fresh datapoint without waiting for the
   * overnight cron.
   */
  async snapshotNow(
    clientId: string,
    user: AuthenticatedUser,
  ): Promise<{
    updated: number;
    notFound: number;
    failed: number;
    totalProcessed: number;
    range: { from: string; to: string };
    country?: string;
    warnings: string[];
  }> {
    const to = new Date();
    to.setUTCDate(to.getUTCDate() - 2);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - 2);
    return this.syncFromGsc(clientId, user, {
      from: this.isoDate(from),
      to: this.isoDate(to),
    });
  }
}
