import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { SchemaToolsService } from './schema-tools.service';

@Controller('schema-tools')
export class SchemaToolsController {
  constructor(private readonly svc: SchemaToolsService) {}

  @Post('crawl')
  crawl(@Body() body: { url?: string; maxPages?: number }) {
    if (!body?.url) throw new BadRequestException('url is required');
    return this.svc.crawl(body.url, body.maxPages);
  }
}
