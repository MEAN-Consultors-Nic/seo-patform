import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ClientAccess,
  ClientContact,
  ClientCredential,
  ClientKnowledge,
  ClientTier,
  CredentialCategory,
  HOURS_PER_TIER,
  ReportKpis,
  ServiceArea,
  ServiceAreaMetrics,
} from '@seo/shared';

export type ClientDocument = HydratedDocument<Client>;

/**
 * One agency service the client is subscribed to (SEO, PPC, Website,
 * Tracking, …) paired with the package that governs its deliverables.
 * Kept with `_id: true` so each subscription has a stable id we can
 * reference from PATCH / DELETE endpoints and from timesheets later.
 * `timestamps` gives us createdAt / updatedAt per subscription so
 * upsell timelines are easy to reconstruct.
 */
@Schema({ _id: true, timestamps: true })
class SubscriptionSubSchema {
  @Prop({ type: Types.ObjectId, ref: 'Service', required: true })
  serviceId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Package' })
  packageId?: Types.ObjectId;
  @Prop({ type: Number }) hoursPerCycle?: number;
  @Prop() startDate?: Date;
  @Prop() endingDate?: Date;
  @Prop({ required: true, default: true }) active!: boolean;
  @Prop() notes?: string;
}

const SubscriptionSchemaDef = SchemaFactory.createForClass(SubscriptionSubSchema);

/**
 * Client-level attachment (contracts, brand assets, reference PDFs,
 * anything that doesn't belong to a specific task or content piece).
 * Same Cloudinary metadata pattern as TaskAttachment / ContentAttachment,
 * with a free-text label instead of the fixed before/after/other
 * enum used on task attachments.
 */
@Schema({ _id: false })
class ClientAttachmentSubSchema {
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
  @Prop() label?: string;
  @Prop({ default: () => new Date() }) uploadedAt!: Date;
}
const ClientAttachmentSchemaDef = SchemaFactory.createForClass(
  ClientAttachmentSubSchema,
);

/**
 * Attachment shape used inside a client note. Same Cloudinary
 * metadata as ClientAttachmentSubSchema, minus the `label` — a note
 * already provides the free-text context around the file.
 */
@Schema({ _id: false })
class ClientNoteAttachmentSubSchema {
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
const ClientNoteAttachmentSchemaDef = SchemaFactory.createForClass(
  ClientNoteAttachmentSubSchema,
);

/**
 * A single note on the client — free-text body plus optional
 * attachments. `_id: true` so each note gets its own ObjectId the
 * client can address in update/delete calls, and `timestamps: true`
 * so the reader sees when the note was created/edited without an
 * extra API round-trip.
 */
@Schema({ _id: true, timestamps: true })
class ClientNoteSubSchema {
  @Prop({ required: true }) content!: string;

  @Prop({ type: [ClientNoteAttachmentSchemaDef], default: [] })
  attachments?: Array<{
    publicId: string;
    url: string;
    thumbnailUrl?: string;
    format?: string;
    width?: number;
    height?: number;
    bytes?: number;
    resourceType?: 'image' | 'raw' | 'video';
    originalFilename?: string;
    uploadedAt: Date;
  }>;

  @Prop() authorId?: string;
  @Prop() authorName?: string;
}
const ClientNoteSchemaDef = SchemaFactory.createForClass(ClientNoteSubSchema);

@Schema({ _id: false })
class ContactSubSchema implements ClientContact {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) email!: string;
  @Prop() role?: string;
}

@Schema({ _id: false })
class AccessSubSchema implements ClientAccess {
  @Prop() gsc?: boolean;
  @Prop() ga4?: boolean;
  @Prop() gbp?: boolean;
  @Prop() cms?: boolean;
  @Prop() ahrefs?: boolean;
  @Prop() semrush?: boolean;
  @Prop() notes?: string;
}

@Schema({ timestamps: { createdAt: false, updatedAt: true }, _id: true })
class CredentialSubSchema implements ClientCredential {
  @Prop({ required: true }) label!: string;
  @Prop({
    required: true,
    type: String,
    enum: ['website', 'booking', 'social', 'email', 'other'],
  })
  category!: CredentialCategory;
  @Prop() url?: string;
  @Prop() username?: string;
  @Prop() password?: string;
  @Prop() notes?: string;
}

const CredentialSchemaDef = SchemaFactory.createForClass(CredentialSubSchema);

@Schema({ _id: false })
class KnowledgeSubSchema implements ClientKnowledge {
  @Prop() brandVoice?: string;
  @Prop() targetPersona?: string;
  @Prop() anchorRules?: string;
  @Prop() internalLinkingStrategy?: string;
  @Prop() internalNotes?: string;
}

@Schema({ _id: false })
class ServiceAreaMetricsSubSchema implements ServiceAreaMetrics {
  @Prop({ default: 0 }) clicks!: number;
  @Prop({ default: 0 }) impressions!: number;
  @Prop({ default: 0 }) ctr!: number;
  @Prop({ default: 0 }) position!: number;
  @Prop({ required: true }) rangeFrom!: string;
  @Prop({ required: true }) rangeTo!: string;
  @Prop({ required: true, type: Date }) refreshedAt!: Date;
}

const ServiceAreaMetricsSchemaDef = SchemaFactory.createForClass(
  ServiceAreaMetricsSubSchema,
);

@Schema({ _id: false })
class ServiceAreaSubSchema implements ServiceArea {
  @Prop({ required: true }) name!: string;
  @Prop() city?: string;
  @Prop() region?: string;
  @Prop() country?: string;
  @Prop() postalCode?: string;
  @Prop() landingPageUrl?: string;
  @Prop() googleMapsUrl?: string;
  @Prop() primaryKeyword?: string;
  @Prop() notes?: string;
  @Prop({ default: false }) isCityHub?: boolean;
  @Prop({ type: ServiceAreaMetricsSchemaDef })
  metrics?: ServiceAreaMetrics;
}

const ServiceAreaSchemaDef = SchemaFactory.createForClass(ServiceAreaSubSchema);

@Schema({ _id: false })
class BaselineKpisSubSchema implements ReportKpis {
  @Prop() organicSessions?: number;
  @Prop() newUsers?: number;
  @Prop() engagementRate?: number;
  @Prop() avgEngagementTime?: number;
  @Prop() conversionRate?: number;
  @Prop() impressions?: number;
  @Prop() clicks?: number;
  @Prop() ctr?: number;
  @Prop() avgPosition?: number;
  @Prop() conversions?: number;
  @Prop() indexedPages?: number;
  @Prop() nonIndexedPages?: number;
  @Prop() gbpSearches?: number;
  @Prop() gbpCalls?: number;
  @Prop() gbpDirections?: number;
  @Prop() gbpWebsiteClicks?: number;
  @Prop() gbpReviews?: number;
}

@Schema({ timestamps: true, collection: 'clients' })
export class Client {
  @Prop({ required: true, unique: true })
  name!: string;

  /**
   * @deprecated Superseded by packageId. Kept optional so historical
   * documents keep validating; migration runs on boot to fill packageId.
   */
  @Prop({ required: false, type: String, enum: ['A', 'B', 'C'] })
  tier?: ClientTier;

  /**
   * Assigned Package for this client. Nullable during the migration
   * window; new clients created after the migration always have this
   * set via the create DTO.
   */
  @Prop({ type: Types.ObjectId, ref: 'Package', index: true })
  packageId?: Types.ObjectId;

  @Prop({ required: true })
  url!: string;

  @Prop()
  logoUrl?: string;

  @Prop()
  industry?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerId?: Types.ObjectId;

  @Prop({ type: [ContactSubSchema], default: [] })
  contacts!: ClientContact[];

  @Prop({ type: AccessSubSchema, default: {} })
  access!: ClientAccess;

  @Prop({ type: [CredentialSchemaDef], default: [] })
  credentials!: ClientCredential[];

  @Prop({ type: KnowledgeSubSchema, default: {} })
  knowledge!: ClientKnowledge;

  @Prop({ type: BaselineKpisSubSchema })
  baselineKpis?: ReportKpis;

  @Prop()
  baselineDate?: Date;

  @Prop({ required: true })
  hoursPerCycle!: number;

  @Prop({ default: true })
  active!: boolean;

  /**
   * Optional last day of the engagement. Month-to-month clients
   * sometimes cancel on short notice, so this surfaces "ends soon"
   * indicators on the clients list and lets reporting flag the
   * remaining cycles. Stored as a UTC date — only the date matters,
   * not the time. Cleared when the client renews or is reactivated.
   */
  @Prop()
  endingDate?: Date;

  /**
   * Google Doc id (the bit after /document/d/ in the URL) used to
   * mirror task completions and cycle starts into the client's
   * working doc. Empty when not linked. The connected Google account
   * must have edit access to the doc — we never elevate permissions
   * server-side.
   */
  @Prop()
  googleDocId?: string;

  /**
   * Google Sheets id for a future read integration. Reserved now so
   * the OAuth scope grant and edit-form input land together with the
   * docs work and the user doesn't have to reconnect twice.
   */
  @Prop()
  googleSheetId?: string;

  /**
   * Alternative spellings of the client's name that should still match
   * during Google Calendar pulls. Useful when calendar events use a
   * shorthand or different formatting from the canonical client name
   * (e.g., client = "MBG Logistics", event title = "MB Global Logistics").
   * Matching is case-insensitive substring against the event title,
   * just like the primary name.
   */
  @Prop({ type: [String], default: [] })
  calendarAliases?: string[];

  @Prop()
  ga4PropertyId?: string;

  @Prop()
  gscSiteUrl?: string;

  /**
   * ISO 3166-1 alpha-3 lowercase (e.g. 'usa'). Filters the daily GSC
   * position snapshot to this country only. Unset = worldwide (legacy
   * behavior). Editable from the Position Tracker tab.
   */
  @Prop()
  positionTrackingCountry?: string;

  @Prop({ default: false })
  isEcommerce?: boolean;

  @Prop()
  merchantCenterId?: string;

  @Prop()
  gbpAccountName?: string;

  @Prop()
  gbpLocationName?: string;

  @Prop()
  shopifyShopDomain?: string;

  @Prop()
  shopifyClientId?: string;

  @Prop()
  shopifyClientSecret?: string;

  @Prop()
  shopifyAccessToken?: string;

  @Prop({
    type: String,
    enum: ['shopify', 'wordpress', 'custom'],
  })
  websitePlatform?: 'shopify' | 'wordpress' | 'custom';

  @Prop()
  wordpressSiteUrl?: string;

  @Prop()
  wordpressUsername?: string;

  @Prop()
  wordpressAppPassword?: string;

  @Prop({
    type: String,
    enum: ['yoast', 'rankmath', 'aioseo', 'native'],
  })
  wordpressSeoPlugin?: 'yoast' | 'rankmath' | 'aioseo' | 'native';

  @Prop({ type: [ServiceAreaSchemaDef], default: [] })
  serviceAreas?: ServiceArea[];

  // --- Business profile (surfaced under the client Onboarding tab) ---
  @Prop() phone?: string;
  @Prop() address?: string;
  @Prop() businessDescription?: string;
  @Prop({ type: [String], default: undefined }) categories?: string[];
  @Prop({ type: [String], default: undefined }) services?: string[];
  @Prop({ type: [String], default: undefined }) socialLinks?: string[];
  @Prop() reviewsUrl?: string;
  @Prop() photosUrl?: string;

  /**
   * Agency-side service classifier. Multi-select: any combination of
   * 'seo' / 'ppc' / 'website' / 'other'. Drives the Clients page
   * filter pills + At-risk / Expansion tiles. Nullable while legacy
   * clients haven't been classified yet.
   *
   * @deprecated Superseded by `subscriptions` after the multi-service
   * migration. Kept as a denormalized cache so roster tiles and
   * filter pills can query without joining the subscriptions array.
   * Rebuilt from `subscriptions[].serviceId` on save.
   */
  @Prop({ type: [String], default: undefined })
  serviceLines?: string[];

  /**
   * Multi-service subscriptions. Each entry pairs a Service (SEO,
   * PPC, Website, Tracking, …) with the Package the client bought
   * plus its own hours-per-cycle and dates. Zero-length array
   * represents "no active engagement" — legacy clients that have
   * only the deprecated packageId scalar get one subscription
   * synthesized on first boot after the migration.
   */
  @Prop({ type: [SubscriptionSchemaDef], default: [] })
  subscriptions?: Array<{
    _id?: Types.ObjectId;
    serviceId: Types.ObjectId;
    packageId?: Types.ObjectId;
    hoursPerCycle?: number;
    startDate?: Date;
    endingDate?: Date;
    active: boolean;
    notes?: string;
  }>;

  /**
   * Client-scoped attachments — contracts, brand assets, reference
   * material, anything that lives with the client record rather
   * than a specific task or content piece.
   */
  @Prop({ type: [ClientAttachmentSchemaDef], default: [] })
  attachments?: Array<{
    publicId: string;
    url: string;
    thumbnailUrl?: string;
    format?: string;
    width?: number;
    height?: number;
    bytes?: number;
    resourceType?: 'image' | 'raw' | 'video';
    originalFilename?: string;
    label?: string;
    uploadedAt: Date;
  }>;

  /**
   * Free-text notes attached to the client. Each note has its own
   * ObjectId (subdoc `_id: true`), timestamps, and optional
   * Cloudinary attachments. The strategist writes these as running
   * meeting recaps, decisions, or open questions — separate from the
   * more structured Knowledge tab.
   */
  @Prop({ type: [ClientNoteSchemaDef], default: [] })
  notes?: Array<{
    _id?: Types.ObjectId;
    content: string;
    attachments?: Array<{
      publicId: string;
      url: string;
      thumbnailUrl?: string;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
      resourceType?: 'image' | 'raw' | 'video';
      originalFilename?: string;
      uploadedAt: Date;
    }>;
    authorId?: string;
    authorName?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }>;

  /**
   * External client-portal users linked to this Client (Core Slice 1.5).
   * Populated by whichever workflow onboards a client-portal account
   * later; empty by default. The portal UI itself lands in Phase 6+.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  linkedUsers?: Types.ObjectId[];
}

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.pre('save', function () {
  const doc = this as unknown as Client;
  // Fallback ordering: existing hoursPerCycle → legacy tier lookup → 0.
  // Once packages are seeded the frontend seeds this from the picked
  // package's hoursPerPeriod so this branch only fires for legacy data.
  if (!doc.hoursPerCycle) {
    doc.hoursPerCycle = doc.tier ? HOURS_PER_TIER[doc.tier] : 0;
  }
});
