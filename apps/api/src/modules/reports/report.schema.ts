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

/**
 * Custom date range for ad-hoc reports that don't snap to a cycle.
 * When set, the parent report uses these dates for filtering tasks,
 * pulling KPIs, computing the previous-period comparison, and labelling
 * the cover. Exactly one of (cycleId, customRange) must be present.
 */
@Schema({ _id: false })
class CustomRangeSubSchema {
  @Prop({ type: Date, required: true }) from!: Date;
  @Prop({ type: Date, required: true }) to!: Date;
}

@Schema({ timestamps: true, collection: 'reports' })
export class Report {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  /**
   * Set for cycle-anchored reports. When undefined, customRange must be
   * set. Exactly one of (cycleId, customRange) is present.
   */
  @Prop({ type: Types.ObjectId, ref: 'Cycle', required: false, index: true })
  cycleId?: Types.ObjectId;

  /** Set for ad-hoc date-range reports. */
  @Prop({ type: CustomRangeSubSchema })
  customRange?: { from: Date; to: Date };

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

  /**
   * Raw PIN. Kept so the cover page of the generated PDF can display
   * "View live report → URL + PIN" without forcing the user to copy the
   * PIN by hand every time. The hashed version above is still the
   * authoritative one used to verify unlock attempts.
   */
  @Prop()
  sharePin?: string;

  @Prop({ default: 0 })
  pinAttempts!: number;

  @Prop()
  pinLockedUntil?: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
// Partial unique index: enforces 'one report per (client, cycle)' only
// for cycle-anchored reports. Custom-range reports have no uniqueness
// constraint — a client can have many ad-hoc reports over time.
ReportSchema.index(
  { clientId: 1, cycleId: 1 },
  {
    unique: true,
    partialFilterExpression: { cycleId: { $exists: true } },
  },
);
ReportSchema.index({
  clientId: 1,
  'customRange.from': 1,
  'customRange.to': 1,
});
