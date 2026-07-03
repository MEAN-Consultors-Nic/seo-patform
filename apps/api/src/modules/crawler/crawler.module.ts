import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClientsModule } from '../clients/clients.module';
import { CrawlJob, CrawlJobSchema } from './crawl-job.schema';
import { CrawlPage, CrawlPageSchema } from './crawl-page.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CrawlJob.name, schema: CrawlJobSchema },
      { name: CrawlPage.name, schema: CrawlPageSchema },
    ]),
    ClientsModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class CrawlerModule {}
