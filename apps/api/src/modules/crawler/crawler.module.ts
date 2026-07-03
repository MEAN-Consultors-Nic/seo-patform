import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule } from '../clients/clients.module';
import { CrawlJob, CrawlJobSchema } from './crawl-job.schema';
import { CrawlPage, CrawlPageSchema } from './crawl-page.schema';
import { UrlNormalizerService } from './url-normalizer.service';
import { PageFetcherService } from './page-fetcher.service';
import { HtmlAnalyzerService } from './html-analyzer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CrawlJob.name, schema: CrawlJobSchema },
      { name: CrawlPage.name, schema: CrawlPageSchema },
    ]),
    ClientsModule,
  ],
  controllers: [],
  providers: [UrlNormalizerService, PageFetcherService, HtmlAnalyzerService],
  exports: [UrlNormalizerService, PageFetcherService, HtmlAnalyzerService],
})
export class CrawlerModule {}
