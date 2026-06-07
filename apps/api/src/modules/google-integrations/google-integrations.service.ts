import { BadRequestException, Injectable } from '@nestjs/common';
import { GscBreakdown, ReportKpis } from '@seo/shared';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';
import { Ga4Service } from './ga4.service';
import { GscService } from './gsc.service';

@Injectable()
export class GoogleIntegrationsService {
  constructor(
    private readonly clients: ClientsService,
    private readonly gsc: GscService,
    private readonly ga4: Ga4Service,
  ) {}

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
    sources: { gsc: boolean; ga4: boolean; warnings: string[] };
  }> {
    const client = await this.clients.findOne(clientId, user);
    const warnings: string[] = [];
    const out: ReportKpis = {};
    let gscOk = false;
    let ga4Ok = false;

    if (client.gscSiteUrl) {
      try {
        const r = await this.gsc.aggregatedKpis(
          user.userId,
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
          user.userId,
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
          user.userId,
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

    return { kpis: out, sources: { gsc: gscOk, ga4: ga4Ok, warnings } };
  }

  async gscBreakdown(
    clientId: string,
    user: AuthenticatedUser,
    from: string,
    to: string,
  ): Promise<GscBreakdown> {
    const client = await this.clients.findOne(clientId, user);
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

  async testClientConnections(clientId: string, user: AuthenticatedUser) {
    const client = await this.clients.findOne(clientId, user);
    const result: {
      gsc: { ok: boolean; message?: string };
      ga4: { ok: boolean; message?: string };
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
          user.userId,
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

    return result;
  }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
