import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { Report, ReportSchema } from './report.schema';
import { ReportsService } from './reports.service';
import { ReportsController, PublicReportsController } from './reports.controller';
import { PdfService } from './pdf.service';
import { ClientsModule } from '../clients/clients.module';
import { CyclesModule } from '../cycles/cycles.module';
import { TasksModule } from '../tasks/tasks.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { BacklinksModule } from '../backlinks/backlinks.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

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
  ],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService, PdfService],
})
export class ReportsModule {}
