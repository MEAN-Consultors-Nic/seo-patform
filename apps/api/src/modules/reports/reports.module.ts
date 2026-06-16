import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { Report, ReportSchema } from './report.schema';
import { ReportsService } from './reports.service';
import { ReportsController, PublicReportsController } from './reports.controller';
import { PdfService } from './pdf.service';
import { WordService } from './word.service';
import { ClientsModule } from '../clients/clients.module';
import { CyclesModule } from '../cycles/cycles.module';
import { TasksModule } from '../tasks/tasks.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { BacklinksModule } from '../backlinks/backlinks.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    }),
    ClientsModule,
    CyclesModule,
    TasksModule,
    KeywordsModule,
    BacklinksModule,
    AppSettingsModule,
    ContentModule,
  ],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService, PdfService, WordService],
})
export class ReportsModule {}
