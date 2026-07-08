import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { SupervisorModule } from '../supervisor/supervisor.module';
import { ServicesModule } from '../services/services.module';

/**
 * Core module barrel — groups the platform-admin building blocks
 * (auth + users + roles + org settings + audit log + supervisor
 * multi-PIN vault) so AppModule imports one thing instead of five.
 *
 * The underlying feature modules keep their existing files and can
 * still be imported directly by other modules that only need one
 * piece (e.g. AuthModule for JwtModule bindings). This barrel is a
 * conceptual grouping, not a physical move — the file restructure
 * outlined in the roadmap can happen incrementally later without
 * touching consumer imports.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    AppSettingsModule,
    ActivityLogModule,
    SupervisorModule,
    ServicesModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    AppSettingsModule,
    ActivityLogModule,
    SupervisorModule,
    ServicesModule,
  ],
})
export class CoreModule {}
