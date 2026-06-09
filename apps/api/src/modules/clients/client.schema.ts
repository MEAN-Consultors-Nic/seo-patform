import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ClientAccess,
  ClientContact,
  ClientCredential,
  ClientKnowledge,
  ClientTier,
  CredentialCategory,
  HOURS_PER_TIER,
  ReportKpis,
  ServiceArea,
  ServiceAreaMetrics,
} from '@seo/shared';

export type ClientDocument = HydratedDocument<Client>;

@Schema({ _id: false })
class ContactSubSchema implements ClientContact {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) email!: string;
  @Prop() role?: string;
}

@Schema({ _id: false })
class AccessSubSchema implements ClientAccess {
  @Prop() gsc?: boolean;
  @Prop() ga4?: boolean;
  @Prop() gbp?: boolean;
  @Prop() cms?: boolean;
  @Prop() ahrefs?: boolean;
  @Prop() semrush?: boolean;
  @Prop() notes?: string;
}

@Schema({ timestamps: { createdAt: false, updatedAt: true }, _id: true })
class CredentialSubSchema implements ClientCredential {
  @Prop({ required: true }) label!: string;
  @Prop({
    required: true,
    type: String,
    enum: ['website', 'booking', 'social', 'email', 'other'],
  })
  category!: CredentialCategory;
  @Prop() url?: string;
  @Prop() username?: string;
  @Prop() password?: string;
  @Prop() notes?: string;
}

const CredentialSchemaDef = SchemaFactory.createForClass(CredentialSubSchema);

@Schema({ _id: false })
class KnowledgeSubSchema implements ClientKnowledge {
  @Prop() brandVoice?: string;
  @Prop() targetPersona?: string;
  @Prop() anchorRules?: string;
  @Prop() internalLinkingStrategy?: string;
  @Prop() internalNotes?: string;
}

@Schema({ _id: false })
class ServiceAreaMetricsSubSchema implements ServiceAreaMetrics {
  @Prop({ default: 0 }) clicks!: number;
  @Prop({ default: 0 }) impressions!: number;
  @Prop({ default: 0 }) ctr!: number;
  @Prop({ default: 0 }) position!: number;
  @Prop({ required: true }) rangeFrom!: string;
  @Prop({ required: true }) rangeTo!: string;
  @Prop({ required: true, type: Date }) refreshedAt!: Date;
}

const ServiceAreaMetricsSchemaDef = SchemaFactory.createForClass(
  ServiceAreaMetricsSubSchema,
);

@Schema({ _id: false })
class ServiceAreaSubSchema implements ServiceArea {
  @Prop({ required: true }) name!: string;
  @Prop() city?: string;
  @Prop() region?: string;
  @Prop() country?: string;
  @Prop() postalCode?: string;
  @Prop() landingPageUrl?: string;
  @Prop() googleMapsUrl?: string;
  @Prop() primaryKeyword?: string;
  @Prop() notes?: string;
  @Prop({ type: ServiceAreaMetricsSchemaDef })
  metrics?: ServiceAreaMetrics;
}

const ServiceAreaSchemaDef = SchemaFactory.createForClass(ServiceAreaSubSchema);

@Schema({ _id: false })
class BaselineKpisSubSchema implements ReportKpis {
  @Prop() organicSessions?: number;
  @Prop() newUsers?: number;
  @Prop() engagementRate?: number;
  @Prop() avgEngagementTime?: number;
  @Prop() conversionRate?: number;
  @Prop() impressions?: number;
  @Prop() clicks?: number;
  @Prop() ctr?: number;
  @Prop() avgPosition?: number;
  @Prop() conversions?: number;
  @Prop() indexedPages?: number;
  @Prop() nonIndexedPages?: number;
  @Prop() gbpSearches?: number;
  @Prop() gbpCalls?: number;
  @Prop() gbpDirections?: number;
  @Prop() gbpWebsiteClicks?: number;
  @Prop() gbpReviews?: number;
}

@Schema({ timestamps: true, collection: 'clients' })
export class Client {
  @Prop({ required: true, unique: true })
  name!: string;

  @Prop({ required: true, type: String, enum: ['A', 'B', 'C'] })
  tier!: ClientTier;

  @Prop({ required: true })
  url!: string;

  @Prop()
  logoUrl?: string;

  @Prop()
  industry?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerId?: Types.ObjectId;

  @Prop({ type: [ContactSubSchema], default: [] })
  contacts!: ClientContact[];

  @Prop({ type: AccessSubSchema, default: {} })
  access!: ClientAccess;

  @Prop({ type: [CredentialSchemaDef], default: [] })
  credentials!: ClientCredential[];

  @Prop({ type: KnowledgeSubSchema, default: {} })
  knowledge!: ClientKnowledge;

  @Prop({ type: BaselineKpisSubSchema })
  baselineKpis?: ReportKpis;

  @Prop()
  baselineDate?: Date;

  @Prop({ required: true })
  hoursPerCycle!: number;

  @Prop({ default: true })
  active!: boolean;

  @Prop()
  ga4PropertyId?: string;

  @Prop()
  gscSiteUrl?: string;

  @Prop({ type: [ServiceAreaSchemaDef], default: [] })
  serviceAreas?: ServiceArea[];
}

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.pre('save', function () {
  const doc = this as unknown as Client;
  if (!doc.hoursPerCycle) {
    doc.hoursPerCycle = HOURS_PER_TIER[doc.tier];
  }
});
