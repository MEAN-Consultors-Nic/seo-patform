import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ClientAccess,
  ClientContact,
  ClientKnowledge,
  ClientTier,
  HOURS_PER_TIER,
  ReportKpis,
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

@Schema({ _id: false })
class KnowledgeSubSchema implements ClientKnowledge {
  @Prop() brandVoice?: string;
  @Prop() targetPersona?: string;
  @Prop() anchorRules?: string;
  @Prop() internalLinkingStrategy?: string;
  @Prop() internalNotes?: string;
}

@Schema({ _id: false })
class BaselineKpisSubSchema implements ReportKpis {
  @Prop() organicSessions?: number;
  @Prop() impressions?: number;
  @Prop() clicks?: number;
  @Prop() ctr?: number;
  @Prop() avgPosition?: number;
  @Prop() conversions?: number;
  @Prop() indexedPages?: number;
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
}

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.pre('save', function () {
  const doc = this as unknown as Client;
  if (!doc.hoursPerCycle) {
    doc.hoursPerCycle = HOURS_PER_TIER[doc.tier];
  }
});
