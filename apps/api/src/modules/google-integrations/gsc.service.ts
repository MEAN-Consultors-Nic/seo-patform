import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GscBreakdownRow, GscSitemapHealth } from '@seo/shared';
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

  /** Generic breakdown by a single dimension. */
  private async breakdown(
    userId: string,
    siteUrl: string,
    dimension: 'page' | 'device' | 'country',
    startDate: string,
    endDate: string,
    limit = 25,
  ): Promise<GscBreakdownRow[]> {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: [dimension],
        rowLimit: limit,
      },
    });
    return (res.data.rows || []).map((r) => ({
      key: r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: (r.ctr ?? 0) * 100,
      position: r.position ?? 0,
    }));
  }

  topPages(userId: string, siteUrl: string, from: string, to: string, limit = 25) {
    return this.breakdown(userId, siteUrl, 'page', from, to, limit);
  }

  byDevice(userId: string, siteUrl: string, from: string, to: string) {
    return this.breakdown(userId, siteUrl, 'device', from, to, 10);
  }

  byCountry(userId: string, siteUrl: string, from: string, to: string, limit = 15) {
    return this.breakdown(userId, siteUrl, 'country', from, to, limit);
  }

  /** Sitemap health: counts of sitemaps, submitted URLs, errors, warnings. */
  async sitemapHealth(userId: string, siteUrl: string): Promise<GscSitemapHealth> {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    try {
      const res = await sc.sitemaps.list({ siteUrl });
      const entries = res.data.sitemap || [];
      let totalSubmitted = 0;
      let totalErrors = 0;
      let totalWarnings = 0;
      const sitemaps = entries.map((sm) => {
        const submitted = (sm.contents || []).reduce(
          (acc, c) => acc + Number(c.submitted ?? 0),
          0,
        );
        const errors = Number(sm.errors ?? 0);
        const warnings = Number(sm.warnings ?? 0);
        totalSubmitted += submitted;
        totalErrors += errors;
        totalWarnings += warnings;
        return {
          path: sm.path ?? '',
          submitted,
          errors,
          warnings,
          lastSubmitted: sm.lastSubmitted ?? undefined,
        };
      });
      return {
        totalSitemaps: entries.length,
        totalSubmittedUrls: totalSubmitted,
        totalErrors,
        totalWarnings,
        sitemaps,
      };
    } catch (err) {
      this.logger.warn(`Could not read sitemap health for ${siteUrl}: ${(err as Error).message}`);
      return {
        totalSitemaps: 0,
        totalSubmittedUrls: 0,
        totalErrors: 0,
        totalWarnings: 0,
        sitemaps: [],
      };
    }
  }

  /**
   * Returns top queries for a site between two dates.
   */
  /**
   * Aggregated metrics for a single search query within a date range.
   * Uses dimensionFilterGroups so we don't need to paginate top-queries to
   * find low-traffic keywords. Returns null when the query has no rows in
   * the period (i.e. zero impressions).
   */
  async queryStats(
    userId: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    query: string,
    country?: string,
  ): Promise<GscTopRow | null> {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const filters = [
      {
        dimension: 'query',
        operator: 'equals',
        expression: query,
      },
    ];
    // GSC's country dimension is ISO 3166-1 alpha-3 lowercase (usa,
    // mex, gbr…). Adding this filter restricts the aggregated
    // position/impressions/clicks to searches from that country. It's
    // the finest geo granularity GSC exposes — no city/state.
    if (country) {
      filters.push({
        dimension: 'country',
        operator: 'equals',
        expression: country.toLowerCase(),
      });
    }
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 1,
        dimensionFilterGroups: [{ filters }],
      },
    });
    const r = res.data.rows?.[0];
    if (!r) return null;
    return {
      key: r.keys?.[0] ?? query,
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: (r.ctr ?? 0) * 100,
      position: r.position ?? 0,
    };
  }

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

  /**
   * Daily time series between two dates. Powers the performance
   * chart on GSC Insights — mirrors the top-of-dashboard clicks /
   * impressions / CTR / avg position curves in the GSC console.
   *
   * `type` maps to Google's search-type buckets (web / image / video
   * / news / discover / googleNews). `filters` is a compact list
   * translated into GSC dimensionFilterGroups so the caller can
   * narrow to a specific query, page, country, or device.
   */
  async dailyTimeseries(
    userId: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews',
    filters?: Array<{
      dimension: 'query' | 'page' | 'country' | 'device';
      operator?: 'equals' | 'contains' | 'notContains' | 'notEquals';
      expression: string;
    }>,
  ): Promise<
    Array<{
      date: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>
  > {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['date'],
        rowLimit: 25000,
        type: type ?? undefined,
        dimensionFilterGroups: this.buildFilterGroups(filters),
      },
    });
    return (res.data.rows || [])
      .map((r) => ({
        date: r.keys?.[0] ?? '',
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: (r.ctr ?? 0) * 100,
        position: r.position ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Top rows for a single day, grouped by the requested dimension
   * (query / page / country / device). Used by the drill-down modal
   * that opens when the user clicks a point on the daily chart.
   */
  async topForDate(
    userId: string,
    siteUrl: string,
    date: string,
    dimension: 'query' | 'page' | 'country' | 'device',
    type?: 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews',
    filters?: Array<{
      dimension: 'query' | 'page' | 'country' | 'device';
      operator?: 'equals' | 'contains' | 'notContains' | 'notEquals';
      expression: string;
    }>,
    limit = 25,
  ): Promise<
    Array<{
      key: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>
  > {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: date,
        endDate: date,
        dimensions: [dimension],
        rowLimit: limit,
        type: type ?? undefined,
        dimensionFilterGroups: this.buildFilterGroups(filters),
      },
    });
    return (res.data.rows || []).map((r) => ({
      key: r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: (r.ctr ?? 0) * 100,
      position: r.position ?? 0,
    }));
  }

  /**
   * Top values for a single dimension across a date range. Used by the
   * performance chart's "Add filter" modal to populate a Country
   * picker (or any other enumerable dimension) with only the values
   * that actually show up in the client's data — mirrors GSC
   * console's Country filter which lists just the countries that
   * received impressions for the site.
   */
  async topDimensionValues(
    userId: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimension: 'query' | 'page' | 'country' | 'device',
    limit = 50,
  ): Promise<Array<{ key: string; clicks: number; impressions: number }>> {
    if (!siteUrl) throw new BadRequestException('Missing siteUrl');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const sc = google.searchconsole({ version: 'v1', auth });
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: [dimension],
        rowLimit: limit,
      },
    });
    return (res.data.rows || []).map((r) => ({
      key: r.keys?.[0] ?? '',
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
    }));
  }

  private buildFilterGroups(
    filters?: Array<{
      dimension: 'query' | 'page' | 'country' | 'device';
      operator?: 'equals' | 'contains' | 'notContains' | 'notEquals';
      expression: string;
    }>,
  ): Array<{ filters: Array<{ dimension: string; operator: string; expression: string }> }> | undefined {
    if (!filters?.length) return undefined;
    // Combine all filters into a single AND group. GSC treats each
    // group as OR and the entries inside as AND — we always want AND
    // across the filter chips the user set.
    return [
      {
        filters: filters.map((f) => ({
          dimension: f.dimension,
          operator: f.operator ?? 'contains',
          expression: f.expression,
        })),
      },
    ];
  }
}
