import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { WordpressSeoPlugin } from '@seo/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { WordpressService } from './wordpress.service';

@Controller('wordpress')
export class WordpressController {
  constructor(private readonly svc: WordpressService) {}

  @Get('test')
  test(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId is required');
    return this.svc.verifyAccess(clientId, user);
  }

  @Post('test-raw')
  testRaw(
    @Body()
    body: {
      siteUrl?: string;
      username?: string;
      appPassword?: string;
      seoPlugin?: WordpressSeoPlugin;
    },
  ) {
    if (!body?.siteUrl || !body?.username || !body?.appPassword) {
      throw new BadRequestException(
        'siteUrl, username, and appPassword are required',
      );
    }
    return this.svc.verifyRaw(body);
  }

  @Get('post-types')
  postTypes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId is required');
    return this.svc.listPostTypes(clientId, user);
  }

  @Get('list')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId: string,
    @Query('postType') postType: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
  ) {
    if (!clientId) throw new BadRequestException('clientId is required');
    if (!postType) throw new BadRequestException('postType is required');
    return this.svc.list(
      clientId,
      postType,
      {
        page: page ? parseInt(page, 10) : undefined,
        perPage: perPage ? parseInt(perPage, 10) : undefined,
        search,
      },
      user,
    );
  }

  @Post('seo/preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: { clientId?: string; postType?: string; csvText?: string },
  ) {
    if (!body?.clientId) throw new BadRequestException('clientId is required');
    if (!body?.postType) throw new BadRequestException('postType is required');
    if (!body?.csvText) throw new BadRequestException('csvText is required');
    return this.svc.previewBulkSeo(
      body.clientId,
      body.postType,
      body.csvText,
      user,
    );
  }

  @Post('seo/apply')
  apply(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      clientId?: string;
      postType?: string;
      rows?: Array<{
        slug: string;
        id: number;
        newSeoTitle?: string;
        newSeoDescription?: string;
      }>;
    },
  ) {
    if (!body?.clientId) throw new BadRequestException('clientId is required');
    if (!body?.postType) throw new BadRequestException('postType is required');
    if (!body?.rows || !Array.isArray(body.rows))
      throw new BadRequestException('rows array is required');
    return this.svc.applyBulkSeo(body.clientId, body.postType, body.rows, user);
  }
}
