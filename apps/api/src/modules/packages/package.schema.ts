import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DeliverableFrequency, PackageColor, TaskCategory } from '@seo/shared';

export type PackageDocument = HydratedDocument<Package>;

@Schema({ _id: false })
export class DeliverableSubSchema {
  @Prop({ required: true, type: String }) key!: string;
  @Prop({ required: true, type: String }) label!: string;
  @Prop({ required: true, type: Number, min: 0 }) quantity!: number;
  // Explicit `type: String` because @nestjs/mongoose can't derive the
  // mongoose type from a TS union alias (throws CannotDetermineTypeError
  // at boot). Same treatment applied to all union-typed props below.
  @Prop({ required: true, type: String, default: 'per_period' })
  frequency!: DeliverableFrequency;
  @Prop({ required: true, type: String }) unit!: string;
  @Prop({ type: String }) matchTaskCategory?: TaskCategory;
  @Prop({ type: String }) notes?: string;
}

const DeliverableSchemaDef = SchemaFactory.createForClass(DeliverableSubSchema);

@Schema({ timestamps: true, collection: 'packages' })
export class Package {
  @Prop({ required: true, type: String, index: true }) name!: string;
  @Prop({ type: String }) description?: string;
  @Prop({ required: true, type: String, default: 'sky' }) color!: PackageColor;
  @Prop({ type: [DeliverableSchemaDef], default: [] })
  deliverables!: DeliverableSubSchema[];
  /** Estimated hours per report period for scheduling defaults. */
  @Prop({ type: Number }) hoursPerPeriod?: number;

  /**
   * Service this package belongs to. Optional during the multi-service
   * migration window; backfilled on boot to the SEO service for any
   * pre-existing package. New packages must set this via the DTO.
   */
  @Prop({ type: Types.ObjectId, ref: 'Service', index: true })
  serviceId?: Types.ObjectId;
}

export const PackageSchema = SchemaFactory.createForClass(Package);
PackageSchema.index({ name: 1 }, { unique: true });
