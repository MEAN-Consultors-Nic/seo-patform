import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { RolesGuard } from '../modules/auth/roles.guard';

// --- Domain module barrels (Phase 2 modularization) ----------------------
// Each barrel is a conceptual grouping — the underlying feature modules
// keep their existing files and imports. Anything not yet covered by a
// barrel is either legacy (SeedModule) or awaits its own phase (Reports).

import { CoreModule } from '../modules/core/core.module';
import { ClientsDomainModule } from '../modules/clients-domain/clients-domain.module';
import { SeoModule } from '../modules/seo/seo.module';
import { WorkModule } from '../modules/work/work.module';
import { IntegrationsModule } from '../modules/integrations/integrations.module';
import { ToolsModule } from '../modules/tools/tools.module';
import { SalesModule } from '../modules/sales/sales.module';

// --- Feature modules not yet under a barrel ------------------------------
import { ReportsModule } from '../modules/reports/reports.module';
import { SeedModule } from '../seed/seed.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/internal-tools',
    ),
    ScheduleModule.forRoot(),

    // Platform admin — users, roles, auth, app settings, audit log,
    // supervisor multi-PIN vault.
    CoreModule,

    // Clients + everything scoped to the client: package/tier, and
    // onboarding checklist state.
    ClientsDomainModule,

    // SEO domain — keywords, competitors, backlinks, content pipeline,
    // cannibalization, indexing.
    SeoModule,

    // Work planning — tasks, task templates, cycles (legacy compat),
    // working hours, time blocks, daily priority queue.
    WorkModule,

    // Third-party integrations — Google (GSC/GA4/GBP/Docs/Drive/Gmail
    // scope), Shopify, WordPress, outbound SMTP.
    IntegrationsModule,

    // Standalone utility tools — domain lookup, schema modeller.
    ToolsModule,

    // Sales — pipeline (leads Kanban) + proposals + follow-ups +
    // reactivation + client-facing questionnaires. Wires the sub-
    // modules as they land; only Pipeline is live in the first slice.
    SalesModule,

    // Reports (multi-format + PDF/Word/share). Kept out of a barrel
    // for now because its own restructure is a follow-up slice.
    ReportsModule,

    // Legacy: initial seed data.
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
