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

/** Pulled out so the controller can show counts without re-querying twice. */
export interface IndexingSummary {
  total: number;
  indexed: number;
  notIndexed: number;
  neutral: number;
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
      neutral: 0,
      unknown: 0,
      newlyIndexedSinceLastPull: 0,
      byReason: [],
    };
    const reasons = new Map<string, number>();
    let lastPulled: Date | undefined;
    for (const r of rows) {
      if (r.verdict === 'PASS') summary.indexed++;
      else if (r.verdict === 'FAIL') summary.notIndexed++;
      else if (r.verdict === 'NEUTRAL') summary.neutral++;
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

    const auth = await this.oauth.getAuthorizedClient(
      (client as unknown as { ownerId?: { _id: string } }).ownerId?._id ||
        (user?.userId as string),
    );
    const sc = google.searchconsole({ version: 'v1', auth });

    // 1. List sitemaps for the property, then merge all URLs from all of them.
    const warnings: string[] = [];
    const sitemapsRes = await sc.sitemaps.list({ siteUrl: client.gscSiteUrl });
    const sitemaps = sitemapsRes.data.sitemap || [];
    if (!sitemaps.length) {
      warnings.push(
        'No sitemaps registered in Search Console for this property. Submit a sitemap first.',
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

    // 2. Inspect every URL. We do this serially to stay well clear of the
    //    2000-requests/day quota on the URL Inspection API. A faster
    //    parallel pass with a quota-aware concurrency would be a follow
    //    up if pulls become slow.
    let upserted = 0;
    let failed = 0;
    for (const url of allUrls) {
      try {
        const existing = await this.model
          .findOne({ clientId: new Types.ObjectId(clientId), url })
          .lean()
          .exec();
        const inspectionRes = await sc.urlInspection.index.inspect({
          requestBody: { inspectionUrl: url, siteUrl: client.gscSiteUrl },
        });
        const r = inspectionRes.data.inspectionResult?.indexStatusResult;
        if (!r) {
          failed++;
          continue;
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
          (!existing?.firstIndexedAt) &&
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
        // 429 means we've hit the daily quota — bail rather than burn
        // through the remaining URLs and confuse the user with partial
        // data.
        if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
          warnings.push(
            `Stopped early after hitting the daily URL Inspection quota at URL ${upserted + failed}/${allUrls.length}. Try again tomorrow.`,
          );
          break;
        }
      }
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
