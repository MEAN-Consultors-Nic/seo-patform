import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ContentService } from './content.service';
import { UpsertContentDto } from './dto/upsert-content.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';

@Controller('content')
export class ContentController {
  constructor(
    private readonly svc: ContentService,
    private readonly clients: ClientsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list({ clientId, status }, user);
  }

  @Post()
  async create(
    @Body() dto: UpsertContentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(dto.clientId, user);
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<UpsertContentDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.remove(id, user);
  }

  @Post(':id/attachments')
  addAttachment(
    @Param('id') id: string,
    @Body() body: {
      publicId: string;
      url: string;
      thumbnailUrl?: string;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      resourceType?: 'image' | 'raw' | 'video';
      originalFilename?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.addAttachment(id, body, user);
  }

  @Delete(':id/attachments')
  removeAttachment(
    @Param('id') id: string,
    @Body() body: { publicId: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.removeAttachment(id, body.publicId, user);
  }

  @Post(':id/indexation/check')
  checkIndexation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.checkIndexation(id, user);
  }

  @Post(':id/indexation/request')
  requestIndexing(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.requestIndexing(id, user);
  }
}
