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
