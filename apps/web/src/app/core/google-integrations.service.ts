import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  GbpAccount,
  GbpLocation,
  GoogleConnectionStatus,
  GscBreakdown,
  ReportKpis,
} from '@seo/shared';
import { API_BASE_URL } from './api.config';

export type GscSearchType =
  | 'web'
  | 'image'
  | 'video'
  | 'news'
  | 'discover'
  | 'googleNews';

export type GscDrillDimension = 'query' | 'page' | 'country' | 'device';

export type GscFilterOperator =
  | 'equals'
  | 'contains'
  | 'notContains'
  | 'notEquals';

export interface GscFilter {
  dimension: GscDrillDimension;
  operator?: GscFilterOperator;
  expression: string;
}

export interface GscTimeseriesRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscTimeseriesResponse {
  rows: GscTimeseriesRow[];
  totals: {
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  };
  range: { from: string; to: string };
}

export interface GscTopForDateRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscTopForDateResponse {
  rows: GscTopForDateRow[];
  date: string;
  dimension: GscDrillDimension;
}

export interface GoogleKpisResult {
  kpis: ReportKpis;
  sources: { gsc: boolean; ga4: boolean; gbp?: boolean; warnings: string[] };
}

export interface GoogleConnectionTest {
  gsc: { ok: boolean; message?: string };
  ga4: { ok: boolean; message?: string };
  merchantCenter?: { ok: boolean; message?: string };
  gbp?: { ok: boolean; message?: string };
}

export interface GbpPerformanceResult {
  searches: number;
  calls: number;
  directions: number;
  websiteClicks: number;
  reviews?: number;
  range: { from: string; to: string };
  warnings: string[];
}

export interface Ga4EcommerceMetrics {
  totalRevenue: number;
  organicRevenue: number;
  organicTransactions: number;
  organicSessions: number;
  organicAov: number;
  organicConversionRate: number;
  currency?: string;
  topLandingPages: Array<{
    landingPage: string;
    sessions: number;
    transactions: number;
    revenue: number;
  }>;
  topProducts: Array<{
    itemName: string;
    quantity: number;
    revenue: number;
  }>;
  rangeFrom: string;
  rangeTo: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleIntegrationsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  status(): Observable<GoogleConnectionStatus> {
    return this.http.get<GoogleConnectionStatus>(`${this.base}/google/auth/status`);
  }

  authUrl(returnTo?: string): Observable<{ url: string }> {
    const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
    return this.http.get<{ url: string }>(`${this.base}/google/auth/url${qs}`);
  }

  disconnect() {
    return this.http.post(`${this.base}/google/auth/disconnect`, {});
  }

  listGscSites() {
    return this.http.get<Array<{ siteUrl: string; permissionLevel?: string }>>(
      `${this.base}/google/gsc/sites`,
    );
  }

  kpisForClient(clientId: string, from: string, to: string): Observable<GoogleKpisResult> {
    const qs = new URLSearchParams({ clientId, from, to });
    return this.http.get<GoogleKpisResult>(`${this.base}/google/kpis?${qs.toString()}`);
  }

  testConnections(clientId: string): Observable<GoogleConnectionTest> {
    const qs = new URLSearchParams({ clientId });
    return this.http.get<GoogleConnectionTest>(
      `${this.base}/google/test-connections?${qs.toString()}`,
    );
  }

  gscBreakdown(clientId: string, from: string, to: string): Observable<GscBreakdown> {
    const qs = new URLSearchParams({ clientId, from, to });
    return this.http.get<GscBreakdown>(
      `${this.base}/google/gsc/breakdown?${qs.toString()}`,
    );
  }

  gscTimeseries(
    clientId: string,
    from: string,
    to: string,
    type?: GscSearchType,
    filters?: GscFilter[],
  ): Observable<GscTimeseriesResponse> {
    const qs = new URLSearchParams({ clientId, from, to });
    if (type) qs.set('type', type);
    if (filters && filters.length) qs.set('filters', JSON.stringify(filters));
    return this.http.get<GscTimeseriesResponse>(
      `${this.base}/google/gsc/timeseries?${qs.toString()}`,
    );
  }

  gscTopForDate(
    clientId: string,
    date: string,
    dimension: GscDrillDimension,
    type?: GscSearchType,
    filters?: GscFilter[],
  ): Observable<GscTopForDateResponse> {
    const qs = new URLSearchParams({ clientId, date, dimension });
    if (type) qs.set('type', type);
    if (filters && filters.length) qs.set('filters', JSON.stringify(filters));
    return this.http.get<GscTopForDateResponse>(
      `${this.base}/google/gsc/top-for-date?${qs.toString()}`,
    );
  }

  ga4Ecommerce(clientId: string, from: string, to: string): Observable<Ga4EcommerceMetrics> {
    const qs = new URLSearchParams({ clientId, from, to });
    return this.http.get<Ga4EcommerceMetrics>(
      `${this.base}/google/ga4/ecommerce?${qs.toString()}`,
    );
  }

  gbpAccounts(): Observable<GbpAccount[]> {
    return this.http.get<GbpAccount[]>(`${this.base}/google/gbp/accounts`);
  }

  gbpLocations(accountName: string): Observable<GbpLocation[]> {
    const qs = new URLSearchParams({ accountName });
    return this.http.get<GbpLocation[]>(
      `${this.base}/google/gbp/locations?${qs.toString()}`,
    );
  }

  gbpTest(locationName: string): Observable<GbpLocation> {
    const qs = new URLSearchParams({ locationName });
    return this.http.get<GbpLocation>(
      `${this.base}/google/gbp/test?${qs.toString()}`,
    );
  }

  gbpPerformance(
    accountName: string,
    locationName: string,
    from: string,
    to: string,
  ): Observable<GbpPerformanceResult> {
    const qs = new URLSearchParams({ accountName, locationName, from, to });
    return this.http.get<GbpPerformanceResult>(
      `${this.base}/google/gbp/performance?${qs.toString()}`,
    );
  }
}
