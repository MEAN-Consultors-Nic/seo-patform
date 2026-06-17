import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { google, Auth } from 'googleapis';
import {
  GoogleAuthToken,
  GoogleAuthTokenDocument,
} from './google-auth-token.schema';

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const MERCHANT_SCOPE = 'https://www.googleapis.com/auth/content';
const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const PROFILE_SCOPES = ['openid', 'email', 'profile'];
const SCOPES = [
  GSC_SCOPE,
  GA4_SCOPE,
  MERCHANT_SCOPE,
  GBP_SCOPE,
  CALENDAR_SCOPE,
  ...PROFILE_SCOPES,
];

interface OAuthStatePayload {
  userId: string;
  returnTo?: string;
  kind: 'google-oauth';
}

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);

  constructor(
    @InjectModel(GoogleAuthToken.name)
    private readonly model: Model<GoogleAuthTokenDocument>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  isConfigured(): boolean {
    return !!(this.clientId() && this.clientSecret() && this.redirectUri());
  }

  private clientId() {
    return this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
  }

  private clientSecret() {
    return this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');
  }

  private redirectUri() {
    return this.config.get<string>('GOOGLE_OAUTH_REDIRECT_URI');
  }

  private webBase(): string {
    return (
      this.config.get<string>('PUBLIC_WEB_URL') || 'http://localhost:4200'
    ).replace(/\/$/, '');
  }

  private buildClient(): Auth.OAuth2Client {
    if (!this.isConfigured()) {
      throw new InternalServerErrorException(
        'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI.',
      );
    }
    return new google.auth.OAuth2(
      this.clientId(),
      this.clientSecret(),
      this.redirectUri(),
    );
  }

  buildAuthUrl(userId: string, returnTo?: string): string {
    const client = this.buildClient();
    const state = this.jwt.sign(
      { userId, returnTo, kind: 'google-oauth' } satisfies OAuthStatePayload,
      { expiresIn: '10m' },
    );
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // force refresh_token even on subsequent connects
      scope: SCOPES,
      state,
      include_granted_scopes: true,
    });
  }

  async handleCallback(code: string, state: string) {
    if (!state) throw new BadRequestException('Missing state');
    let payload: OAuthStatePayload;
    try {
      payload = this.jwt.verify<OAuthStatePayload>(state);
    } catch {
      throw new UnauthorizedException('OAuth state expired or tampered.');
    }
    if (payload.kind !== 'google-oauth') {
      throw new UnauthorizedException('Invalid OAuth state.');
    }

    const client = this.buildClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      // Google only returns refresh_token on first consent; if missing, the
      // user already authorized this app. We force prompt=consent above, but
      // if it still happens we ask them to revoke and try again.
      throw new BadRequestException(
        'Google did not return a refresh token. Visit https://myaccount.google.com/permissions, remove this app, and reconnect.',
      );
    }

    // Pull the user's email so we know which Google account they connected as.
    let googleEmail: string | undefined;
    try {
      client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const info = await oauth2.userinfo.get();
      googleEmail = info.data.email || undefined;
    } catch (err) {
      this.logger.warn(`Could not fetch Google profile: ${(err as Error).message}`);
    }

    const expiry =
      tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600_000);
    await this.model
      .findOneAndUpdate(
        { userId: new Types.ObjectId(payload.userId) },
        {
          $set: {
            userId: new Types.ObjectId(payload.userId),
            refreshToken: tokens.refresh_token,
            accessToken: tokens.access_token || undefined,
            accessTokenExpiresAt: expiry,
            scopes: (tokens.scope || '').split(' ').filter(Boolean),
            googleEmail,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    const returnTo = payload.returnTo || '/settings/integrations';
    return { redirectUrl: `${this.webBase()}${returnTo}?google_connected=1` };
  }

  async getStatus(userId: string) {
    const doc = await this.model.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
    const linked = doc
      ? {
          connected: true,
          email: doc.googleEmail,
          connectedAt: (doc as unknown as { createdAt?: Date }).createdAt,
        }
      : { connected: false };
    const hasMerchantScope = !!doc?.scopes?.some((s) =>
      s.includes('auth/content'),
    );
    const hasGbpScope = !!doc?.scopes?.some((s) =>
      s.includes('auth/business.manage'),
    );
    const hasCalendarScope = !!doc?.scopes?.some((s) =>
      s.includes('auth/calendar'),
    );
    return {
      // GSC, GA4, Merchant Center, and Business Profile share the same
      // OAuth credentials — one connect grants access to all four. The
      // newer scopes can require an explicit reconnect when added to an
      // existing token.
      gsc: linked,
      ga4: linked,
      merchantCenter: doc
        ? hasMerchantScope
          ? linked
          : {
              connected: false,
              needsReconnect: true,
              email: doc.googleEmail,
            }
        : { connected: false },
      gbp: doc
        ? hasGbpScope
          ? linked
          : {
              connected: false,
              needsReconnect: true,
              email: doc.googleEmail,
            }
        : { connected: false },
      calendar: doc
        ? hasCalendarScope
          ? linked
          : {
              connected: false,
              needsReconnect: true,
              email: doc.googleEmail,
            }
        : { connected: false },
    };
  }

  async disconnect(userId: string) {
    await this.model.deleteOne({ userId: new Types.ObjectId(userId) }).exec();
    return { disconnected: true };
  }

  /**
   * Loads the stored refresh token for the user and returns an OAuth2 client
   * with credentials set. The client will auto-refresh access tokens when it
   * makes API calls.
   */
  async getAuthorizedClient(userId: string): Promise<Auth.OAuth2Client> {
    const doc = await this.model
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    if (!doc) {
      throw new UnauthorizedException(
        'No Google account connected. Connect Google in Settings → Integrations.',
      );
    }
    const client = this.buildClient();
    client.setCredentials({
      refresh_token: doc.refreshToken,
      access_token: doc.accessToken,
      expiry_date: doc.accessTokenExpiresAt?.getTime(),
    });
    // Persist refreshed access tokens silently.
    client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        doc.accessToken = tokens.access_token;
        if (tokens.expiry_date) {
          doc.accessTokenExpiresAt = new Date(tokens.expiry_date);
        }
        await doc.save();
      }
    });
    return client;
  }

  /**
   * Returns the first non-personal Google user with a stored refresh token
   * — useful for cron jobs that need to query GSC without a logged-in user.
   */
  async getAnyAuthorizedClient(): Promise<Auth.OAuth2Client | null> {
    const doc = await this.model.findOne().sort({ updatedAt: -1 }).exec();
    if (!doc) return null;
    return this.getAuthorizedClient(doc.userId.toString());
  }

  readServiceAccountEmail(): string | undefined {
    const raw = this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS_JSON');
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as { client_email?: string };
      return parsed.client_email;
    } catch {
      return undefined;
    }
  }

  readServiceAccountJson(): object | null {
    const raw = this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS_JSON');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
