import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ReportKpis } from '@seo/shared';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ _id: false })
class KpisSubSchema implements ReportKpis {
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

@Schema({ timestamps: true, collection: 'reports' })
export class Report {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Cycle', required: true, index: true })
  cycleId!: Types.ObjectId;

  @Prop({ type: KpisSubSchema, default: {} })
  kpis!: ReportKpis;

  @Prop({ type: KpisSubSchema })
  kpisPrevious?: ReportKpis;

  @Prop()
  coverImageUrl?: string;

  @Prop({ type: String, default: '' })
  executiveSummary!: string;

  @Prop({ default: '' })
  findings!: string;

  @Prop({ default: '' })
  nextPeriodPlan!: string;

  @Prop({ default: '' })
  clientBlockers!: string;

  @Prop({ default: '' })
  finalConsiderations!: string;

  @Prop({ default: () => new Date() })
  generatedAt!: Date;

  @Prop()
  sentAt?: Date;

  @Prop()
  pdfPath?: string;

  @Prop({ unique: true, sparse: true, index: true })
  shareToken?: string;

  @Prop()
  sharedAt?: Date;

  @Prop()
  sharePinHash?: string;

  @Prop({ default: 0 })
  pinAttempts!: number;

  @Prop()
  pinLockedUntil?: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ clientId: 1, cycleId: 1 }, { unique: true });
