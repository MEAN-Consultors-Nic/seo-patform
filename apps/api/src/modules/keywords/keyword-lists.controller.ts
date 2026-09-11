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
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/roles.guard';
import {
  KeywordListsService,
  ParsedKeywordRow,
} from './keyword-lists.service';

@Controller('keyword-lists')
export class KeywordListsController {
  constructor(private readonly lists: KeywordListsService) {}

  @Get()
  byClient(
    @Query('clientId') clientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lists.findByClient(clientId, user);
  }

  @Post()
  create(
    @Body() dto: { clientId: string; name: string; description?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lists.create(dto.clientId, dto, user);
  }

  /**
   * Commits parsed rows into the client's keyword pool, optionally
   * filing them into a list. Declared before the ':id' routes so
   * 'import' isn't swallowed as a list id.
   */
  @Post('import')
  import(
    @Body()
    dto: {
      clientId: string;
      listId?: string;
      rows: ParsedKeywordRow[];
      tracked?: boolean;
      overwrite?: boolean;
    },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lists.importRows(
      dto?.clientId,
      dto?.rows ?? [],
      {
        listId: dto?.listId,
        tracked: dto?.tracked,
        overwrite: dto?.overwrite,
      },
      user,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lists.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lists.remove(id, user);
  }

  @Get(':id/keywords')
  keywords(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.lists.keywords(id, user);
  }

  /**
   * Preview endpoint for the paste box: parses without writing, so the
   * UI can show the mapped columns and let the user fix the paste
   * before anything lands in the database.
   */
  @Post('parse')
  parse(@Body() dto: { text: string }) {
    return this.lists.parseBlock(dto?.text ?? '');
  }

  /** Adds keywords that already exist in the client's pool. */
  @Post(':id/keywords')
  addExisting(
    @Param('id') id: string,
    @Body() dto: { keywordIds: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lists.addExisting(id, dto?.keywordIds ?? [], user);
  }

  @Delete(':id/keywords/:keywordId')
  removeKeyword(
    @Param('id') id: string,
    @Param('keywordId') keywordId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.lists.removeKeyword(id, keywordId, user);
  }
}
