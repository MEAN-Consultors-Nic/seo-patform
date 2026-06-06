import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BacklinkStatus, BacklinkType } from '@seo/shared';

export type BacklinkDocument = HydratedDocument<Backlink>;

@Schema({ timestamps: true, collection: 'backlinks' })
export class Backlink {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true }) sourceUrl!: string;
  @Prop({ required: true, index: true }) sourceDomain!: string;
  @Prop({ required: true }) targetUrl!: string;
  @Prop({ required: true }) anchorText!: string;
  @Prop() domainRating?: number;

  @Prop({
    required: true,
    type: String,
    enum: ['dofollow', 'nofollow'],
    default: 'dofollow',
  })
  linkType!: BacklinkType;

  @Prop({
    required: true,
    type: String,
    enum: ['live', 'lost', 'pending'],
    default: 'live',
  })
  status!: BacklinkStatus;

  @Prop() acquiredAt?: Date;
  @Prop() notes?: string;
}

export const BacklinkSchema = SchemaFactory.createForClass(Backlink);
BacklinkSchema.index({ clientId: 1, status: 1 });
