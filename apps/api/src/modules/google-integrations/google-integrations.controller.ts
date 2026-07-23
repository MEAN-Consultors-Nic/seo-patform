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

  /**
   * Daily time series for the client's GSC site. Powers the GSC
   * console-style performance chart on the client detail tab. Filters
   * are passed as compact JSON so the client-side form can encode
   * an arbitrary combination of query / page / country / device
   * without shape gymnastics on the URL.
   */
  @Get('gsc/timeseries')
  async gscTimeseries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('type') type?: string,
    @Query('filters') filtersJson?: string,
  ) {
    if (!clientId || !from || !to)
      throw new BadRequestException('clientId, from, to are required');
    const filters = filtersJson ? this.parseFilters(filtersJson) : undefined;
    return this.svc.gscTimeseries(
      clientId,
      user,
      from,
      to,
      (type as 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews') ||
        undefined,
      filters,
    );
  }

  /**
   * Drill-down: top rows for a single day, grouped by the requested
   * dimension. Used by the click-on-a-date modal on the performance
   * chart.
   */
  @Get('gsc/top-for-date')
  async gscTopForDate(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
    @Query('date') date: string,
    @Query('dimension') dimension: string,
    @Query('type') type?: string,
    @Query('filters') filtersJson?: string,
  ) {
    if (!clientId || !date || !dimension)
      throw new BadRequestException(
        'clientId, date, dimension are required',
      );
    if (!['query', 'page', 'country', 'device'].includes(dimension)) {
      throw new BadRequestException(
        'dimension must be query / page / country / device',
      );
    }
    const filters = filtersJson ? this.parseFilters(filtersJson) : undefined;
    return this.svc.gscTopForDate(
      clientId,
      user,
      date,
      dimension as 'query' | 'page' | 'country' | 'device',
      (type as 'web' | 'image' | 'video' | 'news' | 'discover' | 'googleNews') ||
        undefined,
      filters,
    );
  }

  private parseFilters(
    raw: string,
  ):
    | Array<{
        dimension: 'query' | 'page' | 'country' | 'device';
        operator?: 'equals' | 'contains' | 'notContains' | 'notEquals';
        expression: string;
      }>
    | undefined {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return undefined;
      return parsed
        .filter(
          (f: unknown) =>
            !!f &&
            typeof f === 'object' &&
            'dimension' in (f as object) &&
            'expression' in (f as object),
        )
        .map(
          (f: {
            dimension: string;
            operator?: string;
            expression: string;
          }) => ({
            dimension: f.dimension as 'query' | 'page' | 'country' | 'device',
            operator: f.operator as
              | 'equals'
              | 'contains'
              | 'notContains'
              | 'notEquals'
              | undefined,
            expression: f.expression,
          }),
        );
    } catch {
      return undefined;
    }
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
