import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LinkGraphSnapshotDocument = HydratedDocument<LinkGraphSnapshot>;

/**
 * One node in the crawl graph. `url` is the canonical URL as fetched
 * (post-redirect resolution when applicable). `depth` is min distance
 * from the seed in BFS terms. `indexedByGsc` is set opportunistically
 * from the platform's existing indexation data if a matching row is
 * found — decoupled from the crawl proper so the graph works with or
 * without GSC coverage.
 */
@Schema({ _id: false })
class LinkGraphNodeSub {
  @Prop({ required: true, type: String }) url!: string;
  @Prop({ type: String }) title?: string;
  @Prop({ type: Number }) statusCode?: number;
  @Prop({ type: Number, default: 0 }) depth!: number;
  @Prop({ type: Number, default: 0 }) inboundCount!: number;
  @Prop({ type: Number, default: 0 }) outboundCount!: number;
  /** True when this URL doesn't receive any internal link (aside from
   *  the seed itself which is depth=0 by definition). */
  @Prop({ type: Boolean, default: false }) isOrphan!: boolean;
  @Prop({ type: Number }) contentLength?: number;
  @Prop({ type: String }) contentType?: string;
  @Prop({ type: String }) errorMessage?: string;
}

@Schema({ _id: false })
class LinkGraphEdgeSub {
  @Prop({ required: true, type: String }) from!: string;
  @Prop({ required: true, type: String }) to!: string;
  @Prop({ type: String }) anchor?: string;
}

/**
 * One completed crawl. Nodes + edges live embedded so pulling the
 * graph is a single Mongo doc read. Sites past ~5000 pages would
 * outgrow the 16MB document limit — for the MVP we cap crawls
 * generously (default 500 pages) and warn if exceeded.
 */
@Schema({ timestamps: true, collection: 'link_graph_snapshots' })
export class LinkGraphSnapshot {
  @Prop({ type: Types.ObjectId, ref: 'Client', required: true, index: true })
  clientId!: Types.ObjectId;

  @Prop({ required: true, type: String }) seedUrl!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['running', 'completed', 'failed'],
    default: 'running',
  })
  status!: 'running' | 'completed' | 'failed';

  @Prop({ type: Date }) startedAt?: Date;
  @Prop({ type: Date }) completedAt?: Date;
  @Prop({ type: String }) errorMessage?: string;

  @Prop({ type: Number, default: 0 }) totalPages!: number;
  @Prop({ type: Number, default: 0 }) totalEdges!: number;
  @Prop({ type: Number, default: 0 }) maxDepth!: number;
  @Prop({ type: Number, default: 0 }) orphansCount!: number;
  @Prop({ type: Number, default: 500 }) pageCap!: number;
  @Prop({ type: Boolean, default: false }) capHit!: boolean;

  @Prop({ type: [LinkGraphNodeSub], default: [] })
  nodes!: LinkGraphNodeSub[];

  @Prop({ type: [LinkGraphEdgeSub], default: [] })
  edges!: LinkGraphEdgeSub[];

  @Prop({ type: [String], default: [] }) warnings!: string[];
}

export const LinkGraphSnapshotSchema =
  SchemaFactory.createForClass(LinkGraphSnapshot);
LinkGraphSnapshotSchema.index({ clientId: 1, createdAt: -1 });
