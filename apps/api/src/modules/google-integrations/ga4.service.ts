import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { google, Auth } from 'googleapis';
import { GoogleOAuthService } from './google-oauth.service';

export interface Ga4Kpis {
  sessions: number;
  organicSessions: number;
  conversions: number;
  engagedSessions: number;
  averageSessionDuration: number; // seconds
  bounceRate: number; // percentage
}

@Injectable()
export class Ga4Service {
  private readonly logger = new Logger(Ga4Service.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  private buildAuth(): Auth.GoogleAuth {
    const credentials = this.oauth.readServiceAccountJson();
    if (!credentials) {
      throw new InternalServerErrorException(
        'GA4 service account is not configured. Set GOOGLE_APPLICATION_CREDENTIALS_JSON in the API env.',
      );
    }
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
  }

  async metadata(propertyId: string) {
    if (!propertyId) throw new BadRequestException('Missing GA4 propertyId');
    const auth = this.buildAuth();
    const data = google.analyticsdata({ version: 'v1beta', auth });
    const res = await data.properties.getMetadata({
      name: `properties/${propertyId}/metadata`,
    });
    return {
      ok: true,
      dimensions: res.data.dimensions?.length || 0,
      metrics: res.data.metrics?.length || 0,
    };
  }

  /**
   * Returns aggregated metrics for the property in the given date range.
   * `organicSessions` is filtered by the default-channel-group dimension.
   */
  async aggregatedKpis(
    propertyId: string,
    startDate: string,
    endDate: string,
  ): Promise<Ga4Kpis> {
    if (!propertyId) throw new BadRequestException('Missing GA4 propertyId');
    const auth = this.buildAuth();
    const data = google.analyticsdata({ version: 'v1beta', auth });

    // Run two reports in parallel: overall + organic-only
    const [overall, organic] = await Promise.all([
      data.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          metrics: [
            { name: 'sessions' },
            { name: 'engagedSessions' },
            { name: 'conversions' },
            { name: 'averageSessionDuration' },
            { name: 'bounceRate' },
          ],
        },
      }),
      data.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: 'sessions' }],
          dimensionFilter: {
            filter: {
              fieldName: 'sessionDefaultChannelGroup',
              stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
            },
          },
        },
      }),
    ]);

    const r = overall.data.rows?.[0];
    const num = (i: number) => Number(r?.metricValues?.[i]?.value ?? 0);
    const organicRow = organic.data.rows?.[0];
    const organicSessions = Number(organicRow?.metricValues?.[0]?.value ?? 0);

    return {
      sessions: num(0),
      engagedSessions: num(1),
      conversions: num(2),
      averageSessionDuration: num(3),
      bounceRate: num(4) * 100,
      organicSessions,
    };
  }
}
