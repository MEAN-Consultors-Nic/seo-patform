import { Module } from '@nestjs/common';
import { KeywordsModule } from '../keywords/keywords.module';
import { CompetitorsModule } from '../competitors/competitors.module';
import { BacklinksModule } from '../backlinks/backlinks.module';
import { ContentModule } from '../content/content.module';
import { CannibalizationModule } from '../cannibalization/cannibalization.module';
import { IndexingModule } from '../indexing/indexing.module';

/**
 * SEO domain barrel — everything strictly about SEO work: keyword
 * position tracking, competitor list, backlink profile, content
 * pipeline, cannibalization detection, and indexing status.
 *
 * Grouped so future non-SEO modules (PPC, Sales, Ops) sit alongside
 * SeoModule at the AppModule level, making the SEO scope explicit.
 */
@Module({
  imports: [
    KeywordsModule,
    CompetitorsModule,
    BacklinksModule,
    ContentModule,
    CannibalizationModule,
    IndexingModule,
  ],
  exports: [
    KeywordsModule,
    CompetitorsModule,
    BacklinksModule,
    ContentModule,
    CannibalizationModule,
    IndexingModule,
  ],
})
export class SeoModule {}
