import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from './google-oauth.service';

export interface MerchantAccountInfo {
  id: string;
  name?: string;
  websiteUrl?: string;
  adultContent?: boolean;
}

@Injectable()
export class MerchantCenterService {
  private readonly logger = new Logger(MerchantCenterService.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  /**
   * Verifies that the user has access to the given Merchant Center account by
   * fetching its public info. Throws if the account is not reachable or the
   * scope is missing — surfaces as a connection test failure.
   */
  async verifyAccess(
    userId: string,
    merchantId: string,
  ): Promise<MerchantAccountInfo> {
    if (!merchantId) throw new BadRequestException('Missing merchantCenterId');
    const auth = await this.oauth.getAuthorizedClient(userId);
    const content = google.content({ version: 'v2.1', auth });
    try {
      const res = await content.accounts.get({
        merchantId,
        accountId: merchantId,
      });
      return {
        id: String(res.data.id ?? merchantId),
        name: res.data.name || undefined,
        websiteUrl: res.data.websiteUrl || undefined,
        adultContent: res.data.adultContent ?? undefined,
      };
    } catch (err) {
      const e = err as { message?: string; code?: number };
      this.logger.warn(
        `Merchant Center access check failed for ${merchantId}: ${e.message}`,
      );
      throw new BadRequestException(
        e.message || `Could not access Merchant Center account ${merchantId}`,
      );
    }
  }
}
