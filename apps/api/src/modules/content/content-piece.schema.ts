import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ContentStatus } from '@seo/shared';

export type ContentPieceDocument = HydratedDocument<ContentPiece>;

@Schema({ timestamps: true, collection: 'content_pieces' })
export class ContentPiece {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true }) title!: string;

  // No enum constraint at the DB layer so legacy documents that still
  // hold 'brief' / 'review' / 'archived' continue to load. The DTO restricts
  // writes to the current 3 values, and the service normalizes legacy
  // values to the new shape on read.
  @Prop({
    required: true,
    type: String,
    default: 'idea',
  })
  status!: ContentStatus;

  @Prop() targetKeyword?: string;
  @Prop() targetUrl?: string;
  @Prop() briefUrl?: string;
  @Prop() publishedUrl?: string;
  @Prop() publishedAt?: Date;
  @Prop() assignedTo?: string;
  @Prop() wordCount?: number;
  @Prop() notes?: string;
}

export const ContentPieceSchema = SchemaFactory.createForClass(ContentPiece);
ContentPieceSchema.index({ clientId: 1, status: 1 });
