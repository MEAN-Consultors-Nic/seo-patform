import { BadRequestException, Injectable } from '@nestjs/common';
import { GscBreakdown, ReportKpis } from '@seo/shared';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';
import { Ga4Service } from './ga4.service';
import { GscService } from './gsc.service';
import { MerchantCenterService } from './merchant-center.service';
import { GbpService } from './gbp.service';

@Injectable()
export class GoogleIntegrationsService {
  constructor(
    private readonly clients: ClientsService,
    private readonly gsc: GscService,
    private readonly ga4: Ga4Service,
    private readonly merchant: MerchantCenterService,
    private readonly gbp: GbpService,
  ) {}

  /**
   * Given a client + the caller, returns the userId whose Google OAuth
   * token should be used for downstream API calls. Prefers the client's
   * assigned owner; falls back to the caller when a legacy client has
   * no owner yet. This is the per-user OAuth resolution from
   * Core Slice 1.2 of the modularization roadmap.
   */
  private resolveTokenUserId(
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

  /**
   * Fetches GSC + GA4 KPIs for a client in the given date range and merges
   * them into the ReportKpis shape used by the reports module.
   */
  async kpisForClient(
    clientId: string,
    user: AuthenticatedUser,
    startDate: string,
    endDate: string,
  ): Promise<{
    kpis: ReportKpis;
    sources: { gsc: boolean; ga4: boolean; gbp: boolean; warnings: string[] };
  }> {
    const client = await this.clients.findOne(clientId, user);
    // Per-user OAuth (Core Slice 1.2): all client-scoped Google calls
    // authenticate as the client's assigned strategist, not the caller.
    // Falls back to the caller when a legacy client has no owner
    // assigned yet — avoids breaking flows during the migration window.
    const tokenUserId = this.resolveTokenUserId(client, user);
    const warnings: string[] = [];
    const out: ReportKpis = {};
    let gscOk = false;
    let ga4Ok = false;

    if (client.gscSiteUrl) {
      try {
        const r = await this.gsc.aggregatedKpis(
          tokenUserId,
          client.gscSiteUrl,
          startDate,
          endDate,
        );
        out.clicks = Math.round(r.clicks);
        out.impressions = Math.round(r.impressions);
        out.ctr = Number(r.ctr.toFixed(2));
        out.avgPosition = Number(r.avgPosition.toFixed(1));
        gscOk = true;
      } catch (err) {
        warnings.push(`GSC: ${(err as Error).message}`);
      }
      try {
        const pages = await this.gsc.pageInsights(
          tokenUserId,
          client.gscSiteUrl,
          startDate,
          endDate,
        );
        out.indexedPages = pages.indexedPages;
        if (typeof pages.nonIndexedPages === 'number') {
          out.nonIndexedPages = pages.nonIndexedPages;
        } else {
          warnings.push(
            'GSC: no sitemap registered — non-indexed pages could not be computed.',
          );
        }
      } catch (err) {
        warnings.push(`GSC pages: ${(err as Error).message}`);
      }
    } else {
      warnings.push('GSC site URL is not set for this client.');
    }

    if (client.ga4PropertyId) {
      try {
        const r = await this.ga4.aggregatedKpis(
          tokenUserId,
          client.ga4PropertyId,
          startDate,
          endDate,
        );
        out.organicSessions = Math.round(r.organicSessions);
        out.newUsers = Math.round(r.newUsers);
        out.engagementRate = Number(r.engagementRate.toFixed(2));
        out.avgEngagementTime = Number(r.averageEngagementTime.toFixed(1));
        out.conversions = Math.round(r.conversions);
        out.conversionRate = r.sessions > 0
          ? Number(((r.conversions / r.sessions) * 100).toFixed(2))
          : 0;
        ga4Ok = true;
      } catch (err) {
        warnings.push(`GA4: ${(err as Error).message}`);
      }
    } else {
      warnings.push('GA4 property ID is not set for this client.');
    }

    let gbpOk = false;
    const clientWithGbp = client as typeof client & {
      gbpLocationName?: string;
      gbpAccountName?: string;
    };
    if (clientWithGbp.gbpLocationName) {
      try {
        const r = await this.gbp.fetchPerformance(
          tokenUserId,
          clientWithGbp.gbpAccountName ?? '',
          clientWithGbp.gbpLocationName,
          startDate,
          endDate,
        );
        out.gbpSearches = Math.round(r.searches);
        out.gbpCalls = Math.round(r.calls);
        out.gbpDirections = Math.round(r.directions);
        out.gbpWebsiteClicks = Math.round(r.websiteClicks);
        if (typeof r.reviews === 'number') {
          out.gbpReviews = r.reviews;
        }
        for (const w of r.warnings) warnings.push(`GBP: ${w}`);
        gbpOk = true;
      } catch (err) {
        warnings.push(`GBP: ${(err as Error).message}`);
      }
    }

    return {
      kpis: out,
      sources: { gsc: gscOk, ga4: ga4Ok, gbp: gbpOk, warnings },
    };
  }

  async gscBreakdown(
    clientId: string,
    user: AuthenticatedUser,
    from: string,
    to: string,
  ): Promise<GscBreakdown> {
    const client = await this.clients.findOne(clientId, user);
    // Per-user OAuth (Core Slice 1.2): all client-scoped Google calls
    // authenticate as the client's assigned strategist, not the caller.
    // Falls back to the caller when a legacy client has no owner
    // assigned yet — avoids breaking flows during the migration window.
    const tokenUserId = this.resolveTokenUserId(client, user);
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'GSC site URL is not configured for this client.',
      );
    }
    const [topPages, byDevice, byCountry, sitemapHealth] = await Promise.all([
      this.gsc.topPages(user.userId, client.gscSiteUrl, from, to, 25),
      this.gsc.byDevice(user.userId, client.gscSiteUrl, from, to),
      this.gsc.byCountry(user.userId, client.gscSiteUrl, from, to, 15),
      this.gsc.sitemapHealth(user.userId, client.gscSiteUrl),
    ]);
    return { topPages, byDevice, byCountry, sitemapHealth, range: { from, to } };
  }

  async gscTimeseries(
    clientId: string,
    user: AuthenticatedUser,
    from: string,
    to: string,
    type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews',
    filters?: Array<{
      dimension: 'query' | 'page' | 'country' | 'device';
      operator?: 'equals' | 'contains' | 'notContains' | 'notEquals';
      expression: string;
    }>,
  ) {
    const client = await this.clients.findOne(clientId, user);
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'GSC site URL is not configured for this client.',
      );
    }
    const tokenUserId = this.resolveTokenUserId(client, user);
    const rows = await this.gsc.dailyTimeseries(
      tokenUserId,
      client.gscSiteUrl,
      from,
      to,
      type,
      filters,
    );
    // Also compute the top-line totals so the KPI cards on the frontend
    // don't need a second round-trip — cheap since we already have the
    // daily rows in memory.
    const totals = rows.reduce(
      (acc, r) => {
        acc.clicks += r.clicks;
        acc.impressions += r.impressions;
        return acc;
      },
      { clicks: 0, impressions: 0 },
    );
    const ctr =
      totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    // Average position is impressions-weighted like GSC does it.
    const weightedPos = rows.reduce(
      (acc, r) => acc + r.position * r.impressions,
      0,
    );
    const avgPosition =
      totals.impressions > 0 ? weightedPos / totals.impressions : 0;
    return {
      rows,
      totals: {
        clicks: totals.clicks,
        impressions: totals.impressions,
        ctr,
        avgPosition,
      },
      range: { from, to },
    };
  }

  async gscTopDimensionValues(
    clientId: string,
    user: AuthenticatedUser,
    from: string,
    to: string,
    dimension: 'query' | 'page' | 'country' | 'device',
    limit?: number,
  ) {
    const client = await this.clients.findOne(clientId, user);
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'GSC site URL is not configured for this client.',
      );
    }
    const tokenUserId = this.resolveTokenUserId(client, user);
    const rows = await this.gsc.topDimensionValues(
      tokenUserId,
      client.gscSiteUrl,
      from,
      to,
      dimension,
      limit,
    );
    return { rows, dimension, range: { from, to } };
  }

  async gscTopForDate(
    clientId: string,
    user: AuthenticatedUser,
    date: string,
    dimension: 'query' | 'page' | 'country' | 'device',
    type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews',
    filters?: Array<{
      dimension: 'query' | 'page' | 'country' | 'device';
      operator?: 'equals' | 'contains' | 'notContains' | 'notEquals';
      expression: string;
    }>,
  ) {
    const client = await this.clients.findOne(clientId, user);
    if (!client.gscSiteUrl) {
      throw new BadRequestException(
        'GSC site URL is not configured for this client.',
      );
    }
    const tokenUserId = this.resolveTokenUserId(client, user);
    const rows = await this.gsc.topForDate(
      tokenUserId,
      client.gscSiteUrl,
      date,
      dimension,
      type,
      filters,
    );
    return { rows, date, dimension };
  }

  async ecommerceForClient(
    clientId: string,
    user: AuthenticatedUser,
    from: string,
    to: string,
  ) {
    const client = await this.clients.findOne(clientId, user);
    // Per-user OAuth (Core Slice 1.2): all client-scoped Google calls
    // authenticate as the client's assigned strategist, not the caller.
    // Falls back to the caller when a legacy client has no owner
    // assigned yet — avoids breaking flows during the migration window.
    const tokenUserId = this.resolveTokenUserId(client, user);
    if (!client.ga4PropertyId) {
      throw new BadRequestException(
        'GA4 property ID is not configured for this client.',
      );
    }
    return this.ga4.ecommerceMetrics(
      user.userId,
      client.ga4PropertyId,
      from,
      to,
    );
  }

  async testClientConnections(clientId: string, user: AuthenticatedUser) {
    const client = await this.clients.findOne(clientId, user);
    // Per-user OAuth (Core Slice 1.2): all client-scoped Google calls
    // authenticate as the client's assigned strategist, not the caller.
    // Falls back to the caller when a legacy client has no owner
    // assigned yet — avoids breaking flows during the migration window.
    const tokenUserId = this.resolveTokenUserId(client, user);
    const result: {
      gsc: { ok: boolean; message?: string };
      ga4: { ok: boolean; message?: string };
      merchantCenter?: { ok: boolean; message?: string };
      gbp?: { ok: boolean; message?: string };
    } = {
      gsc: { ok: false },
      ga4: { ok: false },
    };

    if (!client.gscSiteUrl) {
      result.gsc.message = 'GSC site URL is not set.';
    } else {
      try {
        const today = new Date();
        const start = new Date(today);
        start.setDate(start.getDate() - 28);
        await this.gsc.aggregatedKpis(
          tokenUserId,
          client.gscSiteUrl,
          formatDate(start),
          formatDate(today),
        );
        result.gsc.ok = true;
        result.gsc.message = 'GSC connection OK.';
      } catch (err) {
        result.gsc.message = (err as Error).message;
      }
    }

    if (!client.ga4PropertyId) {
      result.ga4.message = 'GA4 property ID is not set.';
    } else {
      try {
        await this.ga4.metadata(user.userId, client.ga4PropertyId);
        result.ga4.ok = true;
        result.ga4.message = 'GA4 connection OK.';
      } catch (err) {
        result.ga4.message = (err as Error).message;
      }
    }

    if (client.isEcommerce) {
      result.merchantCenter = { ok: false };
      if (!client.merchantCenterId) {
        result.merchantCenter.message = 'Merchant Center ID is not set.';
      } else {
        try {
          const info = await this.merchant.verifyAccess(
            tokenUserId,
            client.merchantCenterId,
          );
          result.merchantCenter.ok = true;
          result.merchantCenter.message = info.name
            ? `Connected to "${info.name}".`
            : 'Merchant Center connection OK.';
        } catch (err) {
          result.merchantCenter.message = (err as Error).message;
        }
      }
    }

    const clientWithGbp = client as typeof client & {
      gbpLocationName?: string;
    };
    if (clientWithGbp.gbpLocationName) {
      result.gbp = { ok: false };
      try {
        const info = await this.gbp.verifyAccess(
          tokenUserId,
          clientWithGbp.gbpLocationName,
        );
        result.gbp.ok = true;
        result.gbp.message = info.title
          ? `Connected to "${info.title}".`
          : 'GBP connection OK.';
      } catch (err) {
        result.gbp.message = (err as Error).message;
      }
    }

    return result;
  }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
