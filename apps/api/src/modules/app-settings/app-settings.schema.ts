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
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);
