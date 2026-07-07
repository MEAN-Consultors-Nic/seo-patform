import { Module } from '@nestjs/common';
import { DomainToolsModule } from '../domain-tools/domain-tools.module';
import { SchemaToolsModule } from '../schema-tools/schema-tools.module';

/**
 * Utility tools barrel — one-shot SEO helpers that aren't scoped to
 * a specific client: domain lookup and structured-data / schema
 * modeller. Grouped so the sidebar of the shell can offer a "Tools"
 * dropdown that maps 1:1 with this module.
 */
@Module({
  imports: [DomainToolsModule, SchemaToolsModule],
  exports: [DomainToolsModule, SchemaToolsModule],
})
export class ToolsModule {}
