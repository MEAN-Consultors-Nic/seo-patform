import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { GoogleOAuthService } from './google-oauth.service';
import { GscService } from './gsc.service';
import { Ga4Service } from './ga4.service';
import { GoogleIntegrationsService } from './google-integrations.service';
import { GbpService } from './gbp.service';

@Controller('google')
export class GoogleIntegrationsController {
  constructor(
    private readonly oauth: GoogleOAuthService,
    private readonly gsc: GscService,
    private readonly ga4: Ga4Service,
    private readonly svc: GoogleIntegrationsService,
    private readonly gbp: GbpService,
  ) {}

  // --- OAuth lifecycle -----------------------------------------------------

  @Get('auth/url')
  authUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Query('returnTo') returnTo?: string,
  ) {
    return { url: this.oauth.buildAuthUrl(user.userId, returnTo) };
  }

  @Public()
  @Get('auth/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(
        `${process.env.PUBLIC_WEB_URL || 'http://localhost:4200'}/profile/integrations?google_error=${encodeURIComponent(error)}`,
      );
    }
    if (!code) throw new BadRequestException('Missing code');
    const { redirectUrl } = await this.oauth.handleCallback(code, state);
    return res.redirect(redirectUrl);
  }

  @Get('auth/status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.oauth.getStatus(user.userId);
  }

  @Post('auth/disconnect')
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.oauth.disconnect(user.userId);
  }

  // --- Data lookups --------------------------------------------------------

  @Get('gsc/sites')
  gscSites(@CurrentUser() user: AuthenticatedUser) {
    return this.gsc.listSites(user.userId);
  }

  @Get('gsc/test')
  async gscTest(
    @CurrentUser() user: AuthenticatedUser,
    @Query('siteUrl') siteUrl: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!siteUrl || !from || !to)
      throw new BadRequestException('siteUrl, from, to are required');
    return this.gsc.aggregatedKpis(user.userId, siteUrl, from, to);
  }

  @Get('ga4/test')
  async ga4Test(
    @CurrentUser() user: AuthenticatedUser,
    @Query('propertyId') propertyId: string,
  ) {
    if (!propertyId) throw new BadRequestException('propertyId is required');
    return this.ga4.metadata(user.userId, propertyId);
  }

  @Get('clients/:clientId/kpis')
  async clientKpis(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') _qsClientId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    // NestJS automatically wires the param from the URL pattern, but we read
    // it from the request body or query if needed. For now, the only place
    // calling this passes clientId as part of the path, so we use req.params.
    throw new BadRequestException('Use /google/kpis instead.');
  }

  @Get('kpis')
  async kpis(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!clientId || !from || !to)
      throw new BadRequestException('clientId, from, to are required');
    return this.svc.kpisForClient(clientId, user, from, to);
  }

  @Get('test-connections')
  async testConnections(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId is required');
    return this.svc.testClientConnections(clientId, user);
  }

  @Get('gsc/breakdown')
  async gscBreakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!clientId || !from || !to)
      throw new BadRequestException('clientId, from, to are required');
    return this.svc.gscBreakdown(clientId, user, from, to);
  }

  @Get('ga4/ecommerce')
  async ga4Ecommerce(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!clientId || !from || !to)
      throw new BadRequestException('clientId, from, to are required');
    return this.svc.ecommerceForClient(clientId, user, from, to);
  }

  // --- Google Business Profile -------------------------------------------

  @Get('gbp/accounts')
  async gbpAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.gbp.listAccounts(user.userId);
  }

  @Get('gbp/locations')
  async gbpLocations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountName') accountName: string,
  ) {
    if (!accountName)
      throw new BadRequestException('accountName is required (accounts/...)');
    return this.gbp.listLocations(user.userId, accountName);
  }

  @Get('gbp/test')
  async gbpTest(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationName') locationName: string,
  ) {
    if (!locationName)
      throw new BadRequestException('locationName is required (locations/...)');
    return this.gbp.verifyAccess(user.userId, locationName);
  }

  @Get('gbp/performance')
  async gbpPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountName') accountName: string,
    @Query('locationName') locationName: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    if (!locationName || !from || !to)
      throw new BadRequestException(
        'locationName, from, to are required',
      );
    return this.gbp.fetchPerformance(
      user.userId,
      accountName,
      locationName,
      from,
      to,
    );
  }
}
