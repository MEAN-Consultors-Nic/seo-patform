import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from '../modules/auth/auth.module';
import { UsersModule } from '../modules/users/users.module';
import { MailModule } from '../modules/mail/mail.module';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { RolesGuard } from '../modules/auth/roles.guard';
import { ClientsModule } from '../modules/clients/clients.module';
import { CyclesModule } from '../modules/cycles/cycles.module';
import { TasksModule } from '../modules/tasks/tasks.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { KeywordsModule } from '../modules/keywords/keywords.module';
import { CompetitorsModule } from '../modules/competitors/competitors.module';
import { ContentModule } from '../modules/content/content.module';
import { BacklinksModule } from '../modules/backlinks/backlinks.module';
import { TaskTemplatesModule } from '../modules/task-templates/task-templates.module';
import { WorkingHoursModule } from '../modules/working-hours/working-hours.module';
import { TimeBlocksModule } from '../modules/time-blocks/time-blocks.module';
import { SeedModule } from '../seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/seo-platform',
    ),
    ScheduleModule.forRoot(),
    MailModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    CyclesModule,
    TasksModule,
    ReportsModule,
    KeywordsModule,
    CompetitorsModule,
    ContentModule,
    BacklinksModule,
    TaskTemplatesModule,
    WorkingHoursModule,
    TimeBlocksModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
