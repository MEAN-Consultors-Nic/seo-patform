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
  PageIndexStatus,
  PageIndexStatusDocument,
} from './page-index-status.schema';

/**
 * Pulled out so the controller can show counts without re-querying twice.
 *
 * Important: Google buckets verdicts as PASS / FAIL / NEUTRAL /
 * VERDICT_UNSPECIFIED. The "Why pages aren't indexed" report in GSC
 * lumps both FAIL and NEUTRAL together — anything that isn't indexed
 * today, regardless of whether it's intentional (noindex, robots.txt
 * blocked) or circumstantial (discovered-but-not-yet-indexed). We
 * match that mental model: notIndexed = FAIL + NEUTRAL.
 */
export interface IndexingSummary {
  total: number;
  indexed: number;
  notIndexed: number;
  unknown: number;
  newlyIndexedSinceLastPull: number;
  lastPulledAt?: Date;
  byReason: Array<{ coverageState: string; count: number }>;
}

@Injectable()
export class IndexingService {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly oauth: GoogleOAuthService,
    private readonly clients: ClientsService,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(PageIndexStatus.name)
    private readonly model: Model<PageIndexStatusDocument>,
  ) {}

  async listForClient(clientId: string, user?: AuthenticatedUser) {
    if (user) await this.clients.assertAccess(clientId, user);
    return this.model
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ verdict: 1, url: 1 })
      .lean()
      .exec();
  }

  async getSummary(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<IndexingSummary> {
    if (user) await this.clients.assertAccess(clientId, user);
    const rows = await this.model
      .find({ clientId: new Types.ObjectId(clientId) })
      .lean()
      .exec();
    const summary: IndexingSummary = {
      total: rows.length,
      indexed: 0,
      notIndexed: 0,
      unknown: 0,
      newlyIndexedSinceLastPull: 0,
      byReason: [],
    };
    const reasons = new Map<string, number>();
    let lastPulled: Date | undefined;
    for (const r of rows) {
      if (r.verdict === 'PASS') summary.indexed++;
      else if (r.verdict === 'FAIL' || r.verdict === 'NEUTRAL')
        summary.notIndexed++;
      else summary.unknown++;
      if (r.previousVerdict && r.previousVerdict !== 'PASS' && r.verdict === 'PASS') {
        summary.newlyIndexedSinceLastPull++;
      }
      const key = r.coverageState || '(unknown)';
      reasons.set(key, (reasons.get(key) || 0) + 1);
      if (!lastPulled || (r.lastCheckedAt && r.lastCheckedAt > lastPulled)) {
        lastPulled = r.lastCheckedAt;
      }
    }
    summary.byReason = Array.from(reasons.entries())
      .map(([coverageState, count]) => ({ coverageState, count }))
      .sort((a, b) => b.count - a.count);
    summary.lastPulledAt = lastPulled;
    return summary;
  }

  /**
   * Pulls fresh indexing data for every URL discovered in the client's
   * registered sitemaps. For each URL it calls the URL Inspection API
   * and upserts a PageIndexStatus row, preserving firstIndexedAt across
   * pulls. Returns a summary with counts + how many URLs newly became
   * indexed since the previous pull. Bails out cleanly if the client
   * hasn't configured a gscSiteUrl.
   */
  async pullForClient(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<{
    inspected: number;
    upserted: number;
    failed: number;
    durationMs: number;
    warnings: string[];
    summary: IndexingSummary;
  }> {
    if (user) await this.clients.assertAccess(clientId, user);
    const started = Date.now();
    const client = await this.clientModel.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException('Client not found');
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'Client has no gscSiteUrl configured. Set it from Edit client → Integrations.',
      );
    }
    if (!user?.userId) {
      throw new BadRequestException(
        'No authenticated user — cannot resolve Google OAuth credentials.',
      );
    }

    // Use the calling user's Google OAuth tokens. They authenticated to
    // hit this endpoint, and the existing GSC integration test on the
    // client confirms their credentials work against this site URL.
    let sc;
    try {
      const auth = await this.oauth.getAuthorizedClient(user.userId);
      sc = google.searchconsole({ version: 'v1', auth });
    } catch (err) {
      throw new BadRequestException(
        `Google OAuth not available for your account: ${(err as Error).message}. Reconnect Google in Settings → Integrations.`,
      );
    }

    // 1. List sitemaps for the property, then merge all URLs from all of them.
    const warnings: string[] = [];
    let sitemaps: Array<{ path?: string | null }>;
    try {
      const sitemapsRes = await sc.sitemaps.list({
        siteUrl: client.gscSiteUrl,
      });
      sitemaps = sitemapsRes.data.sitemap || [];
    } catch (err) {
      const e = err as {
        code?: number;
        message?: string;
        response?: { data?: { error?: { message?: string } } };
      };
      const upstream =
        e.response?.data?.error?.message || e.message || 'unknown error';
      throw new BadRequestException(
        `Search Console rejected the sitemaps.list call for "${client.gscSiteUrl}": ${upstream}. Check that the site URL exactly matches what's registered in GSC (URL-prefix properties need the trailing slash; domain properties look like "sc-domain:example.com").`,
      );
    }
    if (!sitemaps.length) {
      warnings.push(
        `No sitemaps registered in Search Console for "${client.gscSiteUrl}". Submit a sitemap to GSC first, then re-run this pull.`,
      );
    }
    const urlToSitemaps = new Map<string, Set<string>>();
    for (const sm of sitemaps) {
      if (!sm.path) continue;
      const urls = await this.fetchSitemapUrls(sm.path);
      for (const u of urls) {
        const set = urlToSitemaps.get(u) || new Set<string>();
        set.add(sm.path);
        urlToSitemaps.set(u, set);
      }
    }
    const allUrls = Array.from(urlToSitemaps.keys());

    // 2. Inspect URLs in parallel with a small concurrency budget. Two
    //    constraints push us to a relatively small number:
    //      - Heroku's H12 30-second request timeout. A serial loop on
    //        anything past ~20 URLs would have already H12'd.
    //      - The 2000-requests/day URL Inspection quota — we want to
    //        respect it, so a burst of 50 concurrent is overkill.
    //    Parallel 5 with a hard 100-URL cap per pull keeps wall-clock
    //    time well under 30s on average sites and never blows through
    //    more than 5% of the daily quota per pull.
    const MAX_PER_PULL = 100;
    const CONCURRENCY = 5;
    const urlsToProcess = allUrls.slice(0, MAX_PER_PULL);
    if (allUrls.length > MAX_PER_PULL) {
      warnings.push(
        `Sitemap has ${allUrls.length} URLs — inspecting the first ${MAX_PER_PULL} this pull. Run the pull again to continue with the rest.`,
      );
    }

    let upserted = 0;
    let failed = 0;
    let quotaHit = false;

    const inspectOne = async (url: string) => {
      if (quotaHit) return;
      try {
        const existing = await this.model
          .findOne({ clientId: new Types.ObjectId(clientId), url })
          .lean()
          .exec();
        const inspectionRes = await sc!.urlInspection.index.inspect({
          requestBody: { inspectionUrl: url, siteUrl: client.gscSiteUrl },
        });
        const r = inspectionRes.data.inspectionResult?.indexStatusResult;
        if (!r) {
          failed++;
          return;
        }
        const newVerdict =
          (r.verdict as
            | 'PASS'
            | 'NEUTRAL'
            | 'FAIL'
            | 'VERDICT_UNSPECIFIED') || 'VERDICT_UNSPECIFIED';
        const lastCrawlTime = r.lastCrawlTime
          ? new Date(r.lastCrawlTime)
          : undefined;
        const transitionToIndexed =
          newVerdict === 'PASS' &&
          !existing?.firstIndexedAt &&
          (!existing?.previousVerdict || existing.previousVerdict !== 'PASS');
        await this.model
          .updateOne(
            { clientId: new Types.ObjectId(clientId), url },
            {
              $set: {
                clientId: new Types.ObjectId(clientId),
                url,
                verdict: newVerdict,
                coverageState: r.coverageState || undefined,
                robotsTxtState: r.robotsTxtState || undefined,
                indexingState: r.indexingState || undefined,
                pageFetchState: r.pageFetchState || undefined,
                lastCrawlTime,
                googleCanonical: r.googleCanonical || undefined,
                userCanonical: r.userCanonical || undefined,
                canonicalMismatch:
                  !!r.googleCanonical &&
                  !!r.userCanonical &&
                  r.googleCanonical !== r.userCanonical,
                sitemaps: Array.from(urlToSitemaps.get(url) || []),
                referringUrls: r.referringUrls || [],
                previousVerdict: existing?.verdict,
                lastCheckedAt: new Date(),
                ...(transitionToIndexed
                  ? { firstIndexedAt: new Date() }
                  : {}),
              },
            },
            { upsert: true },
          )
          .exec();
        upserted++;
      } catch (err) {
        const msg = (err as Error).message || 'inspection failed';
        this.logger.warn(`URL inspection failed for ${url}: ${msg}`);
        failed++;
        if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
          quotaHit = true;
        }
      }
    };

    // Worker pool: each worker pulls the next URL off a shared cursor.
    let cursor = 0;
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (cursor < urlsToProcess.length && !quotaHit) {
        const i = cursor++;
        await inspectOne(urlsToProcess[i]);
      }
    });
    await Promise.all(workers);

    if (quotaHit) {
      warnings.push(
        `Stopped early after hitting the daily URL Inspection quota (${upserted} stored, ${failed} failed). Try again tomorrow.`,
      );
    }

    return {
      inspected: upserted + failed,
      upserted,
      failed,
      durationMs: Date.now() - started,
      warnings,
      summary: await this.getSummary(clientId),
    };
  }

  /**
   * Notifies Google's Indexing API that a URL has been updated, then
   * immediately re-inspects the same URL via the URL Inspection API so
   * the platform row reflects whatever Google sees right after the
   * notification was accepted.
   *
   * Caveat (worth surfacing in the UI): the Indexing API is OFFICIALLY
   * documented as supporting only pages with JobPosting or
   * BroadcastEvent structured data. For other page types it generally
   * works in practice but Google may rate-limit or reject the request.
   * Daily quota is 200 requests per project by default.
   */
  /**
   * Re-inspects a single URL via the URL Inspection API without
   * touching the Indexing API. Use when the user wants to confirm
   * whether a page that was previously 'discovered - currently not
   * indexed' has flipped to indexed in Google's view — Google often
   * picks pages up minutes-to-hours after we first see them not
   * indexed, but the platform's row only updates on a full pull.
   *
   * Reuses the same upsert path as the bulk pull so firstIndexedAt
   * gets stamped when a row transitions to PASS for the first time.
   */
  async recheckUrl(
    clientId: string,
    url: string,
    user: AuthenticatedUser,
  ): Promise<{ row: PageIndexStatus | null }> {
    await this.clients.assertAccess(clientId, user);
    if (!url) throw new BadRequestException('URL is required');

    const client = await this.clientModel.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException('Client not found');
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'Client has no gscSiteUrl configured. Set it in Edit client → Integrations.',
      );
    }

    let inspectionRes;
    try {
      const auth = await this.oauth.getAuthorizedClient(user.userId);
      const sc = google.searchconsole({ version: 'v1', auth });
      inspectionRes = await sc.urlInspection.index.inspect({
        requestBody: { inspectionUrl: url, siteUrl: client.gscSiteUrl },
      });
    } catch (err) {
      const e = err as {
        code?: number;
        message?: string;
        response?: { data?: { error?: { message?: string } } };
      };
      const upstream =
        e.response?.data?.error?.message || e.message || 'unknown error';
      throw new BadRequestException(
        `URL Inspection rejected the recheck for ${url}: ${upstream}.`,
      );
    }

    const r = inspectionRes.data.inspectionResult?.indexStatusResult;
    if (!r) {
      throw new BadRequestException(
        'Google returned no inspection result for that URL.',
      );
    }

    const newVerdict =
      (r.verdict as
        | 'PASS'
        | 'NEUTRAL'
        | 'FAIL'
        | 'VERDICT_UNSPECIFIED') || 'VERDICT_UNSPECIFIED';
    const lastCrawlTime = r.lastCrawlTime
      ? new Date(r.lastCrawlTime)
      : undefined;
    const existing = await this.model
      .findOne({ clientId: new Types.ObjectId(clientId), url })
      .lean()
      .exec();
    const transitionToIndexed =
      newVerdict === 'PASS' &&
      !existing?.firstIndexedAt &&
      (!existing?.previousVerdict || existing.previousVerdict !== 'PASS');
    await this.model
      .updateOne(
        { clientId: new Types.ObjectId(clientId), url },
        {
          $set: {
            clientId: new Types.ObjectId(clientId),
            url,
            verdict: newVerdict,
            coverageState: r.coverageState || undefined,
            robotsTxtState: r.robotsTxtState || undefined,
            indexingState: r.indexingState || undefined,
            pageFetchState: r.pageFetchState || undefined,
            lastCrawlTime,
            googleCanonical: r.googleCanonical || undefined,
            userCanonical: r.userCanonical || undefined,
            canonicalMismatch:
              !!r.googleCanonical &&
              !!r.userCanonical &&
              r.googleCanonical !== r.userCanonical,
            previousVerdict: existing?.verdict,
            lastCheckedAt: new Date(),
            ...(transitionToIndexed ? { firstIndexedAt: new Date() } : {}),
          },
        },
        { upsert: true },
      )
      .exec();
    const row = await this.model
      .findOne({ clientId: new Types.ObjectId(clientId), url })
      .lean()
      .exec();
    return { row: row as PageIndexStatus | null };
  }

  async requestIndexing(
    clientId: string,
    url: string,
    user: AuthenticatedUser,
  ): Promise<{
    notified: boolean;
    notifiedAt?: string;
    inspection?: {
      verdict: string;
      coverageState?: string;
      lastCrawlTime?: Date;
    };
    warning?: string;
  }> {
    await this.clients.assertAccess(clientId, user);
    if (!url) throw new BadRequestException('URL is required');

    const client = await this.clientModel.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException('Client not found');

    const auth = await this.oauth.getAuthorizedClient(user.userId);

    // 1. Publish the URL_UPDATED notification via the Indexing API.
    let notifiedAt: string | undefined;
    let notifyWarning: string | undefined;
    try {
      const indexing = google.indexing({ version: 'v3', auth });
      const res = await indexing.urlNotifications.publish({
        requestBody: { url, type: 'URL_UPDATED' },
      });
      notifiedAt =
        res.data.urlNotificationMetadata?.latestUpdate?.notifyTime ||
        new Date().toISOString();
    } catch (err) {
      const e = err as {
        code?: number;
        message?: string;
        response?: { data?: { error?: { message?: string } } };
      };
      const upstream =
        e.response?.data?.error?.message || e.message || 'unknown error';
      // 403 from indexing API usually means the user hasn't granted the
      // indexing scope OR doesn't own the property in Search Console.
      // Surface a useful hint instead of a generic 500.
      if (e.code === 403 || upstream.toLowerCase().includes('forbidden')) {
        throw new BadRequestException(
          `Google rejected the indexing request: ${upstream}. Two common causes: (1) the indexing scope wasn't granted — disconnect Google in Settings → Integrations and reconnect; (2) the Google account doesn't own this property in Search Console.`,
        );
      }
      throw new BadRequestException(
        `Indexing API error: ${upstream}. Note that the Indexing API officially supports only JobPosting and BroadcastEvent pages.`,
      );
    }

    // 2. Re-inspect the URL so the local row reflects current state.
    let inspection;
    if (client.gscSiteUrl) {
      try {
        const sc = google.searchconsole({ version: 'v1', auth });
        const inspectionRes = await sc.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl: url,
            siteUrl: client.gscSiteUrl,
          },
        });
        const r = inspectionRes.data.inspectionResult?.indexStatusResult;
        if (r) {
          const verdict =
            (r.verdict as
              | 'PASS'
              | 'NEUTRAL'
              | 'FAIL'
              | 'VERDICT_UNSPECIFIED') || 'VERDICT_UNSPECIFIED';
          const lastCrawlTime = r.lastCrawlTime
            ? new Date(r.lastCrawlTime)
            : undefined;
          const existing = await this.model
            .findOne({ clientId: new Types.ObjectId(clientId), url })
            .lean()
            .exec();
          const transitionToIndexed =
            verdict === 'PASS' &&
            !existing?.firstIndexedAt &&
            (!existing?.previousVerdict || existing.previousVerdict !== 'PASS');
          await this.model
            .updateOne(
              { clientId: new Types.ObjectId(clientId), url },
              {
                $set: {
                  clientId: new Types.ObjectId(clientId),
                  url,
                  verdict,
                  coverageState: r.coverageState || undefined,
                  robotsTxtState: r.robotsTxtState || undefined,
                  indexingState: r.indexingState || undefined,
                  pageFetchState: r.pageFetchState || undefined,
                  lastCrawlTime,
                  googleCanonical: r.googleCanonical || undefined,
                  userCanonical: r.userCanonical || undefined,
                  canonicalMismatch:
                    !!r.googleCanonical &&
                    !!r.userCanonical &&
                    r.googleCanonical !== r.userCanonical,
                  previousVerdict: existing?.verdict,
                  lastCheckedAt: new Date(),
                  ...(transitionToIndexed
                    ? { firstIndexedAt: new Date() }
                    : {}),
                },
              },
              { upsert: true },
            )
            .exec();
          inspection = {
            verdict,
            coverageState: r.coverageState || undefined,
            lastCrawlTime,
          };
        }
      } catch (err) {
        // Inspection refresh is best-effort — don't fail the whole
        // request if it can't get a fresh status. The indexing
        // notification still went through.
        notifyWarning = `Inspection refresh failed: ${(err as Error).message}. The indexing notification was accepted, but the row status was not updated.`;
      }
    }

    return {
      notified: true,
      notifiedAt,
      inspection,
      warning: notifyWarning,
    };
  }

  /**
   * Downloads a sitemap XML (handles a single sitemap index by recursing
   * one level deep) and returns the list of <loc> URLs inside it. The
   * parser is intentionally simple regex-based to avoid pulling in a
   * full XML parser for this read-only use case.
   */
  private async fetchSitemapUrls(
    sitemapUrl: string,
    depth = 0,
  ): Promise<string[]> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(sitemapUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      const xml = await res.text();
      const isIndex = /<sitemapindex[\s>]/i.test(xml);
      const locs = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi))
        .map((m) => m[1].trim())
        .filter(Boolean);
      if (isIndex && depth === 0) {
        const nested = await Promise.all(
          locs.map((sm) => this.fetchSitemapUrls(sm, depth + 1)),
        );
        return Array.from(new Set(nested.flat()));
      }
      return Array.from(new Set(locs));
    } catch (err) {
      this.logger.warn(
        `Failed to fetch sitemap ${sitemapUrl}: ${(err as Error).message}`,
      );
      return [];
    }
  }
}
