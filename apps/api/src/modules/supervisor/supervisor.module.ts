import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { Client, ClientSchema } from '../clients/client.schema';
import { Cycle, CycleSchema } from '../cycles/cycle.schema';
import { Task, TaskSchema } from '../tasks/task.schema';
import { Report, ReportSchema } from '../reports/report.schema';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { SupervisorService } from './supervisor.service';
import { SupervisorController } from './supervisor.controller';
import { SupervisorGuard } from './supervisor.guard';

@Module({
  imports: [
    AppSettingsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret-change-me',
      }),
    }),
    MongooseModule.forFeature([
      { name: Client.name, schema: ClientSchema },
      { name: Cycle.name, schema: CycleSchema },
      { name: Task.name, schema: TaskSchema },
      { name: Report.name, schema: ReportSchema },
    ]),
  ],
  controllers: [SupervisorController],
  providers: [SupervisorService, SupervisorGuard],
  exports: [SupervisorService],
})
export class SupervisorModule {}
