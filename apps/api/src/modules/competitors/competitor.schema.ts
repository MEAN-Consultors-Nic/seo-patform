import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompetitorDocument = HydratedDocument<Competitor>;

/**
 * A keyword the client tracks that this competitor also competes on.
 * Position tracking is manual for now — the strategist checks Google
 * and enters the rank; the platform stores the current + previous
 * so a delta is visible without needing a full history collection.
 * Each row keeps a stable _id so PATCH / DELETE endpoints can
 * address it directly.
 */
@Schema({ _id: true, timestamps: true })
class CompetitorKeywordSubSchema {
  @Prop({ type: Types.ObjectId, ref: 'Keyword', required: true })
  keywordId!: Types.ObjectId;
  @Prop() position?: number;
  @Prop() previousPosition?: number;
  @Prop() rankingUrl?: string;
  @Prop() lastCheckedAt?: Date;
  @Prop() notes?: string;
}
const CompetitorKeywordSchemaDef = SchemaFactory.createForClass(
  CompetitorKeywordSubSchema,
);

@Schema({ timestamps: true, collection: 'competitors' })
export class Competitor {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) url!: string;
  @Prop() domainRating?: number;
  @Prop() estimatedTraffic?: number;
  @Prop() notes?: string;
  @Prop({ type: [String], default: [] }) tags?: string[];

  // When set, the competitor only applies to that service area. When
  // empty, the competitor is global to the client (default).
  @Prop() serviceAreaName?: string;

  /**
   * Keywords this competitor is competing on. Association is manual:
   * strategist picks from the client's tracked keywords via the
   * Competitors tab. Position updates are also manual (button opens
   * Google in a new tab; user enters the rank observed).
   */
  @Prop({ type: [CompetitorKeywordSchemaDef], default: [] })
  keywords?: Array<{
    _id?: Types.ObjectId;
    keywordId: Types.ObjectId;
    position?: number;
    previousPosition?: number;
    rankingUrl?: string;
    lastCheckedAt?: Date;
    notes?: string;
  }>;
}

export const CompetitorSchema = SchemaFactory.createForClass(Competitor);
