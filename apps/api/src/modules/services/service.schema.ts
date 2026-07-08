import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PackageColor } from '@seo/shared';

export type ServiceDocument = HydratedDocument<Service>;

/**
 * Admin-managed catalog of the service lines the agency sells. Each
 * entry becomes a picker option for Packages (the package belongs to
 * exactly one service) and for Client subscriptions (the client
 * subscribes to a service + picks a package for it).
 */
@Schema({ timestamps: true, collection: 'services' })
export class Service {
  @Prop({ required: true, type: String, unique: true }) name!: string;
  @Prop({ required: true, type: String, unique: true }) slug!: string;
  @Prop({ type: String }) description?: string;
  // Explicit `type: String` because PackageColor is a union alias.
  @Prop({ required: true, type: String, default: 'sky' })
  color!: PackageColor;
  @Prop({ type: String }) icon?: string;
  @Prop({ required: true, type: Number, default: 0 }) order!: number;
  @Prop({ required: true, default: true }) active!: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);
