import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CompetitorDocument = HydratedDocument<Competitor>;

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
}

export const CompetitorSchema = SchemaFactory.createForClass(Competitor);
