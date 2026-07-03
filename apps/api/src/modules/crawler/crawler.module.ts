import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule } from '../clients/clients.module';
import { CrawlJob, CrawlJobSchema } from './crawl-job.schema';
import { CrawlPage, CrawlPageSchema } from './crawl-page.schema';
import { UrlNormalizerService } from './url-normalizer.service';
import { PageFetcherService } from './page-fetcher.service';
import { HtmlAnalyzerService } from './html-analyzer.service';
import { CrawlOrchestratorService } from './crawl-orchestrator.service';
import { CrawlAnalyzerService } from './crawl-analyzer.service';
import { CrawlerService } from './crawler.service';
import { CrawlerController } from './crawler.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CrawlJob.name, schema: CrawlJobSchema },
      { name: CrawlPage.name, schema: CrawlPageSchema },
    ]),
    ClientsModule,
  ],
  controllers: [CrawlerController],
  providers: [
    UrlNormalizerService,
    PageFetcherService,
    HtmlAnalyzerService,
    CrawlOrchestratorService,
    CrawlAnalyzerService,
    CrawlerService,
  ],
  exports: [CrawlOrchestratorService, CrawlAnalyzerService, CrawlerService],
})
export class CrawlerModule {}
