import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { ShopifyResource } from '@seo/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ShopifyService } from './shopify.service';

const ALLOWED_RESOURCES: ShopifyResource[] = [
  'product',
  'collection',
  'page',
  'article',
];

function assertResource(r: string | undefined): ShopifyResource {
  if (!r || !ALLOWED_RESOURCES.includes(r as ShopifyResource)) {
    throw new BadRequestException(
      `resource must be one of: ${ALLOWED_RESOURCES.join(', ')}`,
    );
  }
  return r as ShopifyResource;
}

@Controller('shopify')
export class ShopifyController {
  constructor(private readonly svc: ShopifyService) {}

  @Get('test')
  test(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId is required');
    return this.svc.verifyAccess(clientId, user);
  }

  @Post('test-raw')
  testRaw(@Body() body: { shopDomain?: string; accessToken?: string }) {
    if (!body?.shopDomain || !body?.accessToken) {
      throw new BadRequestException('shopDomain and accessToken are required');
    }
    return this.svc.verifyRaw(body.shopDomain, body.accessToken);
  }

  @Get('list')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
    @Query('resource') resource: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId is required');
    const r = assertResource(resource);
    return this.svc.list(
      clientId,
      r,
      {
        cursor,
        limit: limit ? parseInt(limit, 10) : undefined,
        query: q,
      },
      user,
    );
  }

  @Post('seo/preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: { clientId?: string; resource?: string; csvText?: string },
  ) {
    if (!body?.clientId)
      throw new BadRequestException('clientId is required');
    if (!body?.csvText)
      throw new BadRequestException('csvText is required');
    const r = assertResource(body.resource);
    return this.svc.previewBulkSeo(body.clientId, r, body.csvText, user);
  }

  @Post('seo/apply')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      clientId?: string;
      resource?: string;
      rows?: Array<{
        handle: string;
        id: string;
        newSeoTitle?: string;
        newSeoDescription?: string;
      }>;
    },
  ) {
    if (!body?.clientId)
      throw new BadRequestException('clientId is required');
    if (!body?.rows || !Array.isArray(body.rows))
      throw new BadRequestException('rows array is required');
    const r = assertResource(body.resource);
    return this.svc.applyBulkSeo(body.clientId, r, body.rows, user);
  }
}
