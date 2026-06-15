import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ReportKpis, ServiceAreaSnapshot } from '@seo/shared';

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

  @Prop({ default: false })
  includeServiceAreas?: boolean;

  // Default true: existing reports keep showing previous-period
  // comparisons. Toggle off in the editor to hide deltas in the public
  // report and PDF.
  @Prop({ default: true })
  comparePeriods?: boolean;

  @Prop({
    type: String,
    enum: ['clicks', 'impressions', 'ctr', 'position'],
    default: 'clicks',
  })
  locationsSort?: 'clicks' | 'impressions' | 'ctr' | 'position';

  @Prop({ type: [String], default: undefined })
  hiddenKpis?: string[];

  @Prop({ type: [Object], default: undefined })
  serviceAreasSnapshot?: ServiceAreaSnapshot[];

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
