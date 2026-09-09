import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

/**
 * Core module barrel — groups the platform-admin building blocks
 * (auth + users + roles + org settings + audit log) so AppModule
 * imports one thing instead of four.
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
  ],
  exports: [
    AuthModule,
    UsersModule,
    AppSettingsModule,
    ActivityLogModule,
  ],
})
export class CoreModule {}
