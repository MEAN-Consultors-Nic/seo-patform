import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { DeliverableFrequency, PackageColor, TaskCategory } from '@seo/shared';

export type PackageDocument = HydratedDocument<Package>;

@Schema({ _id: false })
export class DeliverableSubSchema {
  @Prop({ required: true }) key!: string;
  @Prop({ required: true }) label!: string;
  @Prop({ required: true, type: Number, min: 0 }) quantity!: number;
  @Prop({ required: true, default: 'per_period' })
  frequency!: DeliverableFrequency;
  @Prop({ required: true }) unit!: string;
  @Prop() matchTaskCategory?: TaskCategory;
  @Prop() notes?: string;
}

const DeliverableSchemaDef = SchemaFactory.createForClass(DeliverableSubSchema);

@Schema({ timestamps: true, collection: 'packages' })
export class Package {
  @Prop({ required: true, index: true }) name!: string;
  @Prop() description?: string;
  @Prop({ required: true, default: 'sky' }) color!: PackageColor;
  @Prop({ type: [DeliverableSchemaDef], default: [] })
  deliverables!: DeliverableSubSchema[];
  /** Estimated hours per report period for scheduling defaults. */
  @Prop({ type: Number }) hoursPerPeriod?: number;
}

export const PackageSchema = SchemaFactory.createForClass(Package);
PackageSchema.index({ name: 1 }, { unique: true });
