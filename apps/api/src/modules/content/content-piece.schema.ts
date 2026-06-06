import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ContentStatus } from '@seo/shared';

export type ContentPieceDocument = HydratedDocument<ContentPiece>;

@Schema({ timestamps: true, collection: 'content_pieces' })
export class ContentPiece {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true }) title!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['idea', 'brief', 'draft', 'review', 'published', 'archived'],
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
