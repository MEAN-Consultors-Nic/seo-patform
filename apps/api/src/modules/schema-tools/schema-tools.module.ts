import { Module } from '@nestjs/common';
import { CrawlerService } from './crawler.service';
import { GraphBuilderService } from './graph-builder.service';
import { SchemaExtractorService } from './schema-extractor.service';
import { SchemaToolsController } from './schema-tools.controller';
import { SchemaToolsService } from './schema-tools.service';

@Module({
  controllers: [SchemaToolsController],
  providers: [
    CrawlerService,
    SchemaExtractorService,
    GraphBuilderService,
    SchemaToolsService,
  ],
})
export class SchemaToolsModule {}
