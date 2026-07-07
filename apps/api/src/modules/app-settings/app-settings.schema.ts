import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ReportSectionConfig, ReportSectionKey } from '@seo/shared';

export type AppSettingsDocument = HydratedDocument<AppSettings>;

@Schema({ _id: false })
class ReportSectionConfigSubSchema implements ReportSectionConfig {
  @Prop({ required: true, type: String }) key!: ReportSectionKey;
  @Prop({ required: true, default: true }) visible!: boolean;
}

const ReportSectionConfigSchemaDef = SchemaFactory.createForClass(
  ReportSectionConfigSubSchema,
);

/**
 * Singleton-style settings doc — one record per workspace. Currently the
 * platform isn't multi-tenant so we look up the first doc; if none exists
 * the service returns the shared defaults.
 */
@Schema({ timestamps: true, collection: 'app-settings' })
export class AppSettings {
  @Prop({ type: [ReportSectionConfigSchemaDef], default: undefined })
  reportLayout?: ReportSectionConfig[];

  /**
   * Plain-text PIN used by the supervisor portal at /supervisor.
   * Stored plain so the admin Settings page can display it once after
   * generation — there's only ever one PIN active at a time and it
   * never gets shown to the supervisor (they enter it on the auth
   * page). The hashed copy below is what's actually checked against
   * incoming auth attempts.
   */
  @Prop()
  supervisorPin?: string;

  @Prop()
  supervisorPinHash?: string;

  /** Flag that gates the entire /supervisor portal. False / missing = disabled. */
  @Prop({ default: false })
  supervisorEnabled?: boolean;

  /** Days from client creation before the onboarding warning kicks in. */
  @Prop({ type: Number })
  onboardingWindowDays?: number;

  /**
   * Org-level branding surfaced in the shell, outbound emails, and
   * generated PDFs. Configurable from Settings once the Platform tab
   * ships in Phase 2 — for now they're reachable via the app-settings
   * REST endpoints for future modules to consume.
   */
  @Prop({ type: String }) organizationName?: string;
  @Prop({ type: String }) organizationColor?: string;

  /** Default cadence for automated digests (Phase 5 ops modules). */
  @Prop({ type: String, enum: ['weekly', 'biweekly', 'monthly'] })
  digestFrequency?: 'weekly' | 'biweekly' | 'monthly';
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);
