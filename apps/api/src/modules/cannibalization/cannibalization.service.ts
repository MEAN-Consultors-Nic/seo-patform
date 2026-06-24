import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { google } from 'googleapis';
import { GoogleOAuthService } from '../google-integrations/google-oauth.service';
import { Client, ClientDocument } from '../clients/client.schema';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';
import {
  CannibalizationCache,
  CannibalizationCacheDocument,
} from './cannibalization-cache.schema';
import {
  CannibalizationDismissed,
  CannibalizationDismissedDocument,
} from './cannibalization-dismissed.schema';
import {
  PageIndexStatus,
  PageIndexStatusDocument,
} from '../indexing/page-index-status.schema';
import {
  ContentPiece,
  ContentPieceDocument,
} from '../content/content-piece.schema';

export type Severity = 'high' | 'medium' | 'low';

export interface CannibalizedPage {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface CannibalizedQuery {
  query: string;
  pages: CannibalizedPage[];
  totalClicks: number;
  totalImpressions: number;
  severity: Severity;
  /** True if the user has marked this query as intentional. */
  dismissed: boolean;
  /** Note attached at dismiss-time, if any. */
  dismissedNote?: string;
}

export interface KeywordCannibalizationResponse {
  refreshedAt: string;
  startDate: string;
  endDate: string;
  totalQueries: number;
  bySeverity: { high: number; medium: number; low: number };
  items: CannibalizedQuery[];
}

export interface CanonicalMismatchItem {
  url: string;
  userCanonical?: string;
  googleCanonical?: string;
  coverageState?: string;
  lastCheckedAt: string;
}

export interface CanonicalMismatchResponse {
  total: number;
  items: CanonicalMismatchItem[];
}

export interface InternalOverlapPiece {
  _id: string;
  title: string;
  status: string;
  publishedUrl?: string;
  briefUrl?: string;
}

export interface InternalOverlapItem {
  targetKeyword: string;
  pieces: InternalOverlapPiece[];
}

export interface InternalOverlapResponse {
  total: number;
  items: InternalOverlapItem[];
}

/**
 * Window used for the GSC pull. 28 days is the operational default — long
 * enough to dampen day-to-day query noise but short enough that cannibalization
 * patterns reflect current site state, not stale data from a removed page.
 */
const DAYS = 28;

/**
 * Minimum impressions a URL needs in the window to even be considered as
 * "ranking" for the query. Filters out the long-tail noise of queries
 * where one URL has 200 impressions and another has 1.
 */
const MIN_IMPRESSIONS_PER_URL = 10;

/**
 * Cap on rows we pull from GSC per request. The API can return up to 25k,
 * but capping at 5k keeps the call well under the 30s Heroku H12 budget
 * and is enough headroom for the largest sites we manage. If we ever hit
 * the cap consistently for a client, we can switch to paginated calls.
 */
const GSC_ROW_LIMIT = 5000;

/**
 * Cache TTL — 24 hours. GSC search analytics has a 2-day data lag anyway,
 * so re-pulling more often than once a day doesn't surface fresher data;
 * it just burns API quota and adds latency to the tab load.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CannibalizationService {
  private readonly logger = new Logger(CannibalizationService.name);

  constructor(
    private readonly oauth: GoogleOAuthService,
    private readonly clients: ClientsService,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(CannibalizationCache.name)
    private readonly cache: Model<CannibalizationCacheDocument>,
    @InjectModel(CannibalizationDismissed.name)
    private readonly dismissed: Model<CannibalizationDismissedDocument>,
    @InjectModel(PageIndexStatus.name)
    private readonly indexStatus: Model<PageIndexStatusDocument>,
    @InjectModel(ContentPiece.name)
    private readonly contentPieces: Model<ContentPieceDocument>,
  ) {}

  /**
   * Pages where Google picked a different canonical than the page
   * declared for itself — the classic duplicate-content signal. Reads
   * directly from PageIndexStatus rows already populated by the
   * Indexing pull, so no external API call is involved.
   */
  async getCanonicalMismatches(
    clientId: string,
    user: AuthenticatedUser,
  ): Promise<CanonicalMismatchResponse> {
    await this.clients.assertAccess(clientId, user);
    const rows = await this.indexStatus
      .find({
        clientId: new Types.ObjectId(clientId),
        canonicalMismatch: true,
      })
      .sort({ url: 1 })
      .lean()
      .exec();
    return {
      total: rows.length,
      items: rows.map((r) => ({
        url: r.url,
        userCanonical: r.userCanonical,
        googleCanonical: r.googleCanonical,
        coverageState: r.coverageState,
        lastCheckedAt: r.lastCheckedAt
          ? new Date(r.lastCheckedAt).toISOString()
          : '',
      })),
    };
  }

  /**
   * Target-keyword collisions inside our own content pipeline: the
   * same keyword assigned to two or more ContentPiece rows for the
   * same client. Doesn't reflect what Google sees — it surfaces
   * governance issues in our own planning. Empty keyword is filtered
   * out so untagged pieces don't aggregate into a giant '' bucket.
   */
  async getInternalOverlap(
    clientId: string,
    user: AuthenticatedUser,
  ): Promise<InternalOverlapResponse> {
    await this.clients.assertAccess(clientId, user);
    const pieces = await this.contentPieces
      .find({ clientId: new Types.ObjectId(clientId) })
      .lean()
      .exec();
    const byKeyword = new Map<string, InternalOverlapPiece[]>();
    for (const p of pieces) {
      const kw = (p.targetKeyword || '').trim().toLowerCase();
      if (!kw) continue;
      const list = byKeyword.get(kw) ?? [];
      list.push({
        _id: String(p._id),
        title: p.title,
        status: p.status,
        publishedUrl: p.publishedUrl,
        briefUrl: p.briefUrl,
      });
      byKeyword.set(kw, list);
    }
    const items: InternalOverlapItem[] = [];
    for (const [targetKeyword, listOfPieces] of byKeyword.entries()) {
      if (listOfPieces.length < 2) continue;
      items.push({ targetKeyword, pieces: listOfPieces });
    }
    items.sort((a, b) => b.pieces.length - a.pieces.length);
    return { total: items.length, items };
  }

  /**
   * Returns the keyword cannibalization payload for a client. Reads from
   * the cache when fresh; only hits GSC when the cache is missing, stale,
   * or the caller requested a forced refresh.
   */
  async getKeywordCannibalization(
    clientId: string,
    user: AuthenticatedUser,
    forceRefresh = false,
  ): Promise<KeywordCannibalizationResponse> {
    await this.clients.assertAccess(clientId, user);
    const clientOid = new Types.ObjectId(clientId);

    if (!forceRefresh) {
      const cached = await this.cache
        .findOne({ clientId: clientOid, days: DAYS })
        .lean()
        .exec();
      if (cached && Date.now() - cached.refreshedAt.getTime() < CACHE_TTL_MS) {
        const payload = cached.payload as unknown as KeywordCannibalizationResponse;
        // Stamp the cached payload's dismissed flags from the live dismissed
        // collection so toggling dismiss doesn't require a re-pull.
        return this.applyDismissedFlags(clientId, payload);
      }
    }

    const client = await this.clientModel.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    const siteUrl = client.gscSiteUrl;
    if (!siteUrl) {
      throw new BadRequestException(
        'Client has no GSC site URL configured. Open the Integrations tab and link a Search Console property first.',
      );
    }

    const { startDate, endDate } = this.windowFor(DAYS);
    const rows = await this.fetchQueryPageRows(
      user.userId!,
      siteUrl,
      startDate,
      endDate,
    );

    const items = this.detectCannibalization(rows);
    const bySeverity = items.reduce(
      (acc, it) => {
        acc[it.severity]++;
        return acc;
      },
      { high: 0, medium: 0, low: 0 } as { high: number; medium: number; low: number },
    );
    const refreshedAt = new Date();
    const payload: KeywordCannibalizationResponse = {
      refreshedAt: refreshedAt.toISOString(),
      startDate,
      endDate,
      totalQueries: items.length,
      bySeverity,
      items,
    };

    await this.cache.updateOne(
      { clientId: clientOid, days: DAYS },
      {
        $set: {
          clientId: clientOid,
          days: DAYS,
          startDate,
          endDate,
          payload,
          refreshedAt,
        },
      },
      { upsert: true },
    );

    return this.applyDismissedFlags(clientId, payload);
  }

  /**
   * Pulls every (query, page) row from GSC for the window. Pages with
   * fewer than MIN_IMPRESSIONS_PER_URL impressions for a query are not
   * filtered here — that happens in detectCannibalization so the noise
   * floor stays explicit and tunable.
   */
  private async fetchQueryPageRows(
    userId: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<Array<{ query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }>> {
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    try {
      const res = await sc.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: ['query', 'page'],
          rowLimit: GSC_ROW_LIMIT,
        },
      });
      const rows = res.data.rows ?? [];
      return rows
        .filter((r) => (r.keys?.length ?? 0) >= 2)
        .map((r) => ({
          query: r.keys![0],
          page: r.keys![1],
          clicks: r.clicks ?? 0,
          impressions: r.impressions ?? 0,
          ctr: r.ctr ?? 0,
          position: r.position ?? 0,
        }));
    } catch (err) {
      const e = err as {
        message?: string;
        response?: { data?: { error?: { message?: string } } };
      };
      const upstream =
        e.response?.data?.error?.message || e.message || 'unknown error';
      this.logger.warn(
        `searchanalytics.query failed for site=${siteUrl}: ${upstream}`,
      );
      throw new BadRequestException(
        `Google Search Console query failed: ${upstream}`,
      );
    }
  }

  /**
   * Groups GSC rows by query, drops queries with fewer than 2 URLs above
   * the impression floor, and scores severity. Items are sorted high → low
   * severity then by total impressions descending so the highest-impact
   * items surface first in the UI.
   */
  private detectCannibalization(
    rows: Array<{
      query: string;
      page: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>,
  ): CannibalizedQuery[] {
    const byQuery = new Map<string, CannibalizedPage[]>();
    for (const r of rows) {
      if (r.impressions < MIN_IMPRESSIONS_PER_URL) continue;
      const list = byQuery.get(r.query) ?? [];
      list.push({
        url: r.page,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      });
      byQuery.set(r.query, list);
    }

    const items: CannibalizedQuery[] = [];
    for (const [query, pages] of byQuery.entries()) {
      if (pages.length < 2) continue;
      const sorted = pages.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
      const totalClicks = sorted.reduce((s, p) => s + p.clicks, 0);
      const totalImpressions = sorted.reduce((s, p) => s + p.impressions, 0);
      items.push({
        query,
        pages: sorted,
        totalClicks,
        totalImpressions,
        severity: this.scoreSeverity(sorted, totalImpressions),
        dismissed: false,
      });
    }

    const sevRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => {
      const s = sevRank[a.severity] - sevRank[b.severity];
      if (s !== 0) return s;
      return b.totalImpressions - a.totalImpressions;
    });
    return items;
  }

  /**
   * Severity is a function of how evenly clicks split between the top
   * URLs and the absolute traffic volume. The thresholds are calibrated
   * so that:
   *   - A pair of URLs sharing 30%+ of clicks AND at least 100 total
   *     impressions in 28d → HIGH (real cannibalization on a meaningful
   *     query)
   *   - Either condition relaxed → MEDIUM (worth looking at, but not on
   *     fire)
   *   - Long-tail noise where the secondary URL has <10% of the primary's
   *     clicks → LOW (background noise — typically a fallback page Google
   *     considered briefly)
   */
  private scoreSeverity(
    sorted: CannibalizedPage[],
    totalImpressions: number,
  ): Severity {
    const [primary, secondary] = sorted;
    if (!secondary) return 'low';
    const share = secondary.clicks / Math.max(primary.clicks, 1);
    if (share >= 0.3 && totalImpressions >= 100) return 'high';
    if (share >= 0.1) return 'medium';
    return 'low';
  }

  /**
   * Stamps the dismissed flag + note onto each item from the dismissed
   * collection. Kept separate from the GSC pull so toggling dismiss
   * doesn't invalidate the (expensive) GSC cache.
   */
  private async applyDismissedFlags(
    clientId: string,
    payload: KeywordCannibalizationResponse,
  ): Promise<KeywordCannibalizationResponse> {
    const dismissedRows = await this.dismissed
      .find({ clientId: new Types.ObjectId(clientId) })
      .lean()
      .exec();
    const byQuery = new Map(dismissedRows.map((d) => [d.query, d.note]));
    return {
      ...payload,
      items: payload.items.map((it) => ({
        ...it,
        dismissed: byQuery.has(it.query),
        dismissedNote: byQuery.get(it.query),
      })),
    };
  }

  /**
   * Inclusive UTC date range string pair, ending at "yesterday" because
   * GSC search analytics for "today" is almost always empty and "today-1"
   * is partial. Yesterday is the earliest reliable end date.
   */
  private windowFor(days: number): { startDate: string; endDate: string } {
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    return {
      startDate: this.iso(start),
      endDate: this.iso(end),
    };
  }

  private iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // --- Dismiss/undismiss ----------------------------------------------------

  async dismissQuery(
    clientId: string,
    query: string,
    note: string | undefined,
    user: AuthenticatedUser,
  ): Promise<{ dismissed: true }> {
    await this.clients.assertAccess(clientId, user);
    await this.dismissed.updateOne(
      { clientId: new Types.ObjectId(clientId), query },
      { $set: { note } },
      { upsert: true },
    );
    return { dismissed: true };
  }

  async undismissQuery(
    clientId: string,
    query: string,
    user: AuthenticatedUser,
  ): Promise<{ dismissed: false }> {
    await this.clients.assertAccess(clientId, user);
    await this.dismissed
      .deleteOne({ clientId: new Types.ObjectId(clientId), query })
      .exec();
    return { dismissed: false };
  }
}
