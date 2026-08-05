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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from './dto/subscription.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tier') tier?: string,
    @Query('active') active?: string,
  ) {
    const activeBool =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.clients.findAll({ tier, active: activeBool }, user);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.clients.stats(user);
  }

  /**
   * Roster-level tiles for the Clients page: total active, per-service
   * counts (SEO / PPC / Website / combo), at-risk count, expansion
   * count (multi-service clients), canceled count. Scoped to the
   * caller.
   */
  @Get('roster-stats')
  rosterStats(@CurrentUser() user: AuthenticatedUser) {
    return this.clients.rosterStats(user);
  }

  @Get('with-stats')
  findAllWithStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tier') tier?: string,
    @Query('active') active?: string,
  ) {
    const activeBool =
      active === 'true' ? true : active === 'false' ? false : undefined;
    return this.clients.findAllWithStats({ tier, active: activeBool }, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clients.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clients.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clients.remove(id, user);
  }

  @Post(':id/subscriptions')
  addSubscription(
    @Param('id') id: string,
    @Body() dto: CreateSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.addSubscription(id, dto, user);
  }

  @Patch(':id/subscriptions/:subId')
  updateSubscription(
    @Param('id') id: string,
    @Param('subId') subId: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.updateSubscription(id, subId, dto, user);
  }

  @Delete(':id/subscriptions/:subId')
  removeSubscription(
    @Param('id') id: string,
    @Param('subId') subId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.removeSubscription(id, subId, user);
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
      label?: string;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.addAttachment(id, body, user);
  }

  @Patch(':id/attachments/:publicId')
  updateAttachment(
    @Param('id') id: string,
    @Param('publicId') publicId: string,
    @Body() body: { label?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.updateAttachment(id, publicId, body, user);
  }

  @Delete(':id/attachments/:publicId')
  removeAttachment(
    @Param('id') id: string,
    @Param('publicId') publicId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.removeAttachment(id, publicId, user);
  }

  // --- Notes ----------------------------------------------------------

  @Post(':id/notes')
  addNote(
    @Param('id') id: string,
    @Body() body: { content: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.addNote(id, body?.content, user);
  }

  @Patch(':id/notes/:noteId')
  updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() body: { content: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.updateNote(id, noteId, body?.content, user);
  }

  @Delete(':id/notes/:noteId')
  removeNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.removeNote(id, noteId, user);
  }

  @Post(':id/notes/:noteId/attachments')
  addNoteAttachment(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body()
    body: {
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
    return this.clients.addNoteAttachment(id, noteId, body, user);
  }

  @Delete(':id/notes/:noteId/attachments/:publicId')
  removeNoteAttachment(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Param('publicId') publicId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clients.removeNoteAttachment(id, noteId, publicId, user);
  }
}
