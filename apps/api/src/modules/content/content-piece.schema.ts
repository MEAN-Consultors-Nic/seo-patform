import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ContentAttachment, ContentPieceType, ContentStatus } from '@seo/shared';

export type ContentPieceDocument = HydratedDocument<ContentPiece>;

@Schema({ _id: false })
class ContentAttachmentSubSchema implements ContentAttachment {
  @Prop({ required: true }) publicId!: string;
  @Prop({ required: true }) url!: string;
  @Prop() thumbnailUrl?: string;
  @Prop() format?: string;
  @Prop() width?: number;
  @Prop() height?: number;
  @Prop() bytes?: number;
  @Prop({ type: String, enum: ['image', 'raw', 'video'] })
  resourceType?: 'image' | 'raw' | 'video';
  @Prop() originalFilename?: string;
  @Prop({ default: () => new Date() }) uploadedAt!: Date;
}

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

  // Explicit `type: String` because ContentPieceType is a union — Mongoose
  // can't infer the metadata from the union reflection alone.
  @Prop({ type: String, enum: ['page', 'post'], default: 'post' })
  contentType?: ContentPieceType;

  @Prop() targetKeyword?: string;
  @Prop() targetUrl?: string;
  @Prop() briefUrl?: string;
  @Prop() publishedUrl?: string;
  @Prop() publishedAt?: Date;
  @Prop() assignedTo?: string;
  @Prop() wordCount?: number;
  @Prop() notes?: string;

  @Prop({ type: [ContentAttachmentSubSchema], default: [] })
  attachments?: ContentAttachment[];
}

export const ContentPieceSchema = SchemaFactory.createForClass(ContentPiece);
ContentPieceSchema.index({ clientId: 1, status: 1 });
