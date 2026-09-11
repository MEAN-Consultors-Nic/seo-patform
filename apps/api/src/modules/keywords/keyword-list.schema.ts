import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type KeywordListDocument = HydratedDocument<KeywordList>;

/**
 * A named bucket of keywords for one client.
 *
 * Membership is stored on the Keyword (`listIds`), not as an array
 * here, for two reasons: a keyword can be in several lists without
 * duplicating the row, and "the keywords in this list" stays a single
 * indexed query as a list grows.
 */
@Schema({ timestamps: true, collection: 'keyword_lists' })
export class KeywordList {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;
}

export const KeywordListSchema = SchemaFactory.createForClass(KeywordList);

// One list name per client — makes "Core keywords" unambiguous and gives
// the bulk-import path something to upsert against.
KeywordListSchema.index({ clientId: 1, name: 1 }, { unique: true });
