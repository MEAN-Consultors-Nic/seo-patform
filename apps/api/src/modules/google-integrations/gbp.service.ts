import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GoogleOAuthService } from './google-oauth.service';

/**
 * Google Business Profile integration. Uses raw fetch against the four
 * GBP host endpoints because the typed googleapis client lags behind the
 * REST API. Requires the `https://www.googleapis.com/auth/business.manage`
 * scope on the OAuth token AND an approved Cloud project (Google ships
 * quota=0 to new projects until they're manually approved — apply via the
 * "Application for Basic API Access" form).
 */

export interface GbpAccount {
  /** Full resource name, e.g. `accounts/123456789`. */
  name: string;
  /** Numeric account id parsed from `name`. */
  accountId: string;
  accountName?: string;
  type?: string;
  role?: string;
  verificationState?: string;
  organizationInfo?: { registeredDomain?: string };
}

export interface GbpLocation {
  /** Full resource name, e.g. `locations/987654321`. */
  name: string;
  /** Numeric location id parsed from `name`. */
  locationId: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  primaryPhone?: string;
  websiteUri?: string;
}

export interface GbpPerformance {
  searches: number;
  calls: number;
  directions: number;
  websiteClicks: number;
  reviews?: number;
  range: { from: string; to: string };
  warnings: string[];
}

const PERF_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
];

interface DailyMetricSeries {
  dailyMetric: string;
  timeSeries: {
    datedValues?: Array<{
      date: { year: number; month: number; day: number };
      value?: string | number;
    }>;
  };
}

@Injectable()
export class GbpService {
  private readonly logger = new Logger(GbpService.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  private async accessToken(userId: string): Promise<string> {
    const client = await this.oauth.getAuthorizedClient(userId);
    const t = await client.getAccessToken();
    if (!t.token) {
      throw new BadRequestException(
        'Could not obtain a Google access token. Reconnect Google in Settings → Integrations.',
      );
    }
    return t.token;
  }

  private async gApi<T>(
    userId: string,
    url: string,
    init?: RequestInit,
  ): Promise<T> {
    const token = await this.accessToken(userId);
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `GBP network error: ${(err as Error).message}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException(
          `Google Business Profile ${res.status}. Reconnect Google with the business.manage scope and confirm the API is enabled + approved (Cloud project starts at 0 QPM until Google approves your access request).`,
        );
      }
      if (res.status === 429) {
        throw new BadRequestException(
          'Google Business Profile rate-limited the request (429). Quota may be 0 — your Cloud project still needs Google approval.',
        );
      }
      throw new InternalServerErrorException(
        `GBP HTTP ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new InternalServerErrorException(
        `GBP returned non-JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  // --- Accounts + locations ---------------------------------------------

  async listAccounts(userId: string): Promise<GbpAccount[]> {
    const data = await this.gApi<{
      accounts?: Array<{
        name: string;
        accountName?: string;
        type?: string;
        role?: string;
        verificationState?: string;
        organizationInfo?: { registeredDomain?: string };
      }>;
    }>(userId, 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
    return (data.accounts ?? []).map((a) => ({
      name: a.name,
      accountId: a.name.replace(/^accounts\//, ''),
      accountName: a.accountName,
      type: a.type,
      role: a.role,
      verificationState: a.verificationState,
      organizationInfo: a.organizationInfo,
    }));
  }

  async listLocations(
    userId: string,
    accountName: string,
  ): Promise<GbpLocation[]> {
    if (!accountName) {
      throw new BadRequestException('accountName is required');
    }
    const readMask =
      'name,title,storefrontAddress,primaryPhone,websiteUri,storeCode';
    const all: GbpLocation[] = [];
    let pageToken: string | undefined;
    // GBP returns 100 locations per page max — paginate until exhausted.
    do {
      const qs = new URLSearchParams({
        readMask,
        pageSize: '100',
        ...(pageToken ? { pageToken } : {}),
      });
      const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${qs.toString()}`;
      const data = await this.gApi<{
        locations?: Array<{
          name: string;
          title?: string;
          storefrontAddress?: GbpLocation['storefrontAddress'];
          primaryPhone?: string;
          websiteUri?: string;
        }>;
        nextPageToken?: string;
      }>(userId, url);
      for (const l of data.locations ?? []) {
        all.push({
          name: l.name,
          locationId: l.name.replace(/^locations\//, ''),
          title: l.title,
          storefrontAddress: l.storefrontAddress,
          primaryPhone: l.primaryPhone,
          websiteUri: l.websiteUri,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return all;
  }

  // --- Connection test --------------------------------------------------

  async verifyAccess(
    userId: string,
    locationName: string,
  ): Promise<GbpLocation> {
    if (!locationName) {
      throw new BadRequestException('locationName is required');
    }
    const readMask =
      'name,title,storefrontAddress,primaryPhone,websiteUri,storeCode';
    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=${encodeURIComponent(readMask)}`;
    const l = await this.gApi<{
      name: string;
      title?: string;
      storefrontAddress?: GbpLocation['storefrontAddress'];
      primaryPhone?: string;
      websiteUri?: string;
    }>(userId, url);
    return {
      name: l.name,
      locationId: l.name.replace(/^locations\//, ''),
      title: l.title,
      storefrontAddress: l.storefrontAddress,
      primaryPhone: l.primaryPhone,
      websiteUri: l.websiteUri,
    };
  }

  // --- Performance metrics ----------------------------------------------

  /**
   * Pulls aggregated GBP performance metrics for the given location and
   * date range. Returns the totals shaped for the platform's ReportKpis.
   * `locationName` should look like `locations/12345`. The accountName is
   * needed for reviews (separate v4 endpoint).
   */
  async fetchPerformance(
    userId: string,
    accountName: string,
    locationName: string,
    from: string,
    to: string,
  ): Promise<GbpPerformance> {
    if (!locationName) {
      throw new BadRequestException('locationName is required');
    }
    const startParts = from.split('-').map((n) => Number(n));
    const endParts = to.split('-').map((n) => Number(n));
    if (startParts.length !== 3 || endParts.length !== 3) {
      throw new BadRequestException('from and to must be YYYY-MM-DD');
    }
    const qs = new URLSearchParams();
    qs.set('dailyRange.startDate.year', String(startParts[0]));
    qs.set('dailyRange.startDate.month', String(startParts[1]));
    qs.set('dailyRange.startDate.day', String(startParts[2]));
    qs.set('dailyRange.endDate.year', String(endParts[0]));
    qs.set('dailyRange.endDate.month', String(endParts[1]));
    qs.set('dailyRange.endDate.day', String(endParts[2]));
    for (const m of PERF_METRICS) qs.append('dailyMetrics', m);

    const url = `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${qs.toString()}`;
    const data = await this.gApi<{
      multiDailyMetricTimeSeries?: Array<{
        dailyMetricTimeSeries?: DailyMetricSeries[];
      }>;
    }>(userId, url);

    const totals: Record<string, number> = {};
    for (const m of PERF_METRICS) totals[m] = 0;
    for (const wrap of data.multiDailyMetricTimeSeries ?? []) {
      for (const series of wrap.dailyMetricTimeSeries ?? []) {
        const sum = (series.timeSeries.datedValues ?? []).reduce(
          (acc, dv) => acc + Number(dv.value ?? 0),
          0,
        );
        totals[series.dailyMetric] =
          (totals[series.dailyMetric] ?? 0) + sum;
      }
    }

    const warnings: string[] = [];
    let reviewCount: number | undefined;
    if (accountName) {
      try {
        reviewCount = await this.fetchReviewCount(
          userId,
          accountName,
          locationName,
        );
      } catch (err) {
        warnings.push(`Reviews: ${(err as Error).message}`);
      }
    } else {
      warnings.push(
        'gbpAccountName is not set for this client — review count cannot be pulled.',
      );
    }

    const searches =
      (totals['BUSINESS_IMPRESSIONS_DESKTOP_MAPS'] ?? 0) +
      (totals['BUSINESS_IMPRESSIONS_DESKTOP_SEARCH'] ?? 0) +
      (totals['BUSINESS_IMPRESSIONS_MOBILE_MAPS'] ?? 0) +
      (totals['BUSINESS_IMPRESSIONS_MOBILE_SEARCH'] ?? 0);

    return {
      searches,
      calls: totals['CALL_CLICKS'] ?? 0,
      directions: totals['BUSINESS_DIRECTION_REQUESTS'] ?? 0,
      websiteClicks: totals['WEBSITE_CLICKS'] ?? 0,
      reviews: reviewCount,
      range: { from, to },
      warnings,
    };
  }

  /**
   * Total review count for the location. Reviews still live on the legacy
   * v4 endpoint — Google has not yet migrated them to a new host. Returns
   * `totalReviewCount` from the first page (no need to paginate).
   */
  private async fetchReviewCount(
    userId: string,
    accountName: string,
    locationName: string,
  ): Promise<number> {
    // accountName: `accounts/123`, locationName: `locations/456`
    const url = `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews?pageSize=1`;
    const data = await this.gApi<{
      totalReviewCount?: number;
      averageRating?: number;
    }>(userId, url);
    return Number(data.totalReviewCount ?? 0);
  }
}
