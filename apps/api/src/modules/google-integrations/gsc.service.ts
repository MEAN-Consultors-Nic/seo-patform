import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from './google-oauth.service';

export interface GscDataPoint {
  clicks: number;
  impressions: number;
  ctr: number; // 0-1 as returned by GSC; we expose as percentage below
  position: number;
}

export interface GscAggregatedKpis {
  clicks: number;
  impressions: number;
  ctr: number; // percentage (clicks/impressions * 100)
  avgPosition: number;
}

export interface GscTopRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

@Injectable()
export class GscService {
  private readonly logger = new Logger(GscService.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  /**
   * Lists the verified sites available to the connected user.
   */
  async listSites(userId: string) {
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const res = await sc.sites.list();
    return (res.data.siteEntry || [])
      .map((s) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
      }))
      .filter((s) => !!s.siteUrl);
  }

  /**
   * Returns aggregated KPIs for a site between two dates (inclusive).
   * Both dates as YYYY-MM-DD.
   */
  async aggregatedKpis(
    userId: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GscAggregatedKpis> {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: [],
        rowLimit: 1,
      },
    });
    const row = res.data.rows?.[0];
    if (!row) {
      return { clicks: 0, impressions: 0, ctr: 0, avgPosition: 0 };
    }
    return {
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: ((row.ctr ?? 0) * 100),
      avgPosition: row.position ?? 0,
    };
  }

  /**
   * Approximates indexed vs non-indexed page counts for a site.
   *
   *  - `indexedPages`: distinct URLs that received at least one impression
   *    in the date range (proxy for "pages currently surfaced in Search").
   *  - `sitemapPages`: total URLs submitted through the registered sitemaps.
   *  - `nonIndexedPages`: max(0, sitemapPages - indexedPages). Returned as
   *    undefined when there are no submitted sitemaps so we don't display a
   *    misleading zero.
   */
  async pageInsights(
    userId: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    indexedPages: number;
    sitemapPages?: number;
    nonIndexedPages?: number;
  }> {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });

    // 1. Pages that actually surfaced in search during the range
    const analyticsRes = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page'],
        rowLimit: 25000,
      },
    });
    const indexedPages = analyticsRes.data.rows?.length ?? 0;

    // 2. Sum of submitted URLs across all sitemaps. Best-effort: if the
    //    sitemaps endpoint fails (404, no access, sitemap not registered)
    //    we just skip the non-indexed calculation.
    let sitemapPages: number | undefined;
    try {
      const sitemapsRes = await sc.sitemaps.list({ siteUrl });
      const entries = sitemapsRes.data.sitemap || [];
      let total = 0;
      let found = false;
      for (const sm of entries) {
        for (const c of sm.contents || []) {
          const submitted = Number(c.submitted ?? 0);
          if (submitted > 0) {
            total += submitted;
            found = true;
          }
        }
      }
      if (found) sitemapPages = total;
    } catch (err) {
      this.logger.warn(`Could not read sitemaps for ${siteUrl}: ${(err as Error).message}`);
    }

    const nonIndexedPages =
      typeof sitemapPages === 'number'
        ? Math.max(0, sitemapPages - indexedPages)
        : undefined;

    return { indexedPages, sitemapPages, nonIndexedPages };
  }

  /**
   * Returns top queries for a site between two dates.
   */
  async topQueries(
    userId: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    limit = 25,
  ): Promise<GscTopRow[]> {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: limit,
      },
    });
    return (res.data.rows || []).map((r) => ({
      key: r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: ((r.ctr ?? 0) * 100),
      position: r.position ?? 0,
    }));
  }
}
