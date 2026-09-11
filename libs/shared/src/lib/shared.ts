/**
 * Platform role hierarchy.
 *
 *   root       — system superadmin (dev/system owner). Can do anything
 *                including irreversible platform ops. 1–2 users max.
 *   owner      — business owner class. Sees every client, every
 *                strategist, and financial data. Cannot do the truly
 *                dangerous stuff (schema migrations, etc.).
 *   admin      — delegated ops manager. Manages users, packages,
 *                onboarding items, app settings. Does NOT see revenue.
 *   manager    — leads a team of strategists. Sees every client
 *                assigned to any strategist under them.
 *   strategist — individual contributor. Sees only clients assigned
 *                to them. Connects their own Google for OAuth pulls.
 *   client     — external portal user (Phase 6+). Not usable in the
 *                internal app — rejected at the guard layer.
 *
 * Legacy values `seo-manager` and `seo-strategist` are auto-migrated
 * on boot (users) and normalized on the fly in the RolesGuard so old
 * JWTs keep working through the transition period.
 */
export type UserRole =
  | 'root'
  | 'owner'
  | 'admin'
  | 'manager'
  | 'strategist'
  | 'supervisor'
  | 'client';

export const USER_ROLES: UserRole[] = [
  'root',
  'owner',
  'admin',
  'manager',
  'strategist',
  'supervisor',
  'client',
];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  'root': 'Root',
  'owner': 'Owner',
  'admin': 'Admin',
  'manager': 'Manager',
  'strategist': 'Strategist',
  'supervisor': 'Supervisor',
  'client': 'Client (portal)',
};

/**
 * Roles allowed to sign into the internal app. `client` is portal-only.
 * `supervisor` is a read-only observer role — replaces the legacy
 * PIN-gated /supervisor flow with a standard email/password login.
 */
export const INTERNAL_APP_ROLES: UserRole[] = [
  'root',
  'owner',
  'admin',
  'manager',
  'strategist',
  'supervisor',
];

/**
 * Legacy → new role mapping. Used by the boot-time migration and by
 * the RolesGuard normalizer during the transition window.
 */
export const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  'seo-manager': 'manager',
  'seo-strategist': 'strategist',
};

export function normalizeRole(role: string | undefined): UserRole | undefined {
  if (!role) return undefined;
  if (LEGACY_ROLE_MAP[role]) return LEGACY_ROLE_MAP[role];
  if ((USER_ROLES as string[]).includes(role)) return role as UserRole;
  return undefined;
}

export interface User {
  _id?: string;
  email: string;
  name: string;
  role: UserRole;
  /**
   * Strategist → manager reporting line. Populated by the API as
   * either the raw ObjectId string or the joined `{_id,name,role}`
   * shape depending on the endpoint.
   */
  managerId?: string | { _id: string; name: string; role: UserRole };
  active: boolean;
  /** Set when the user completes the /set-password flow after invite. */
  emailVerifiedAt?: Date;
  /** Set when the user first picks their password (via invite or reset). */
  passwordSetAt?: Date;
  /** True once the user has stepped through the onboarding wizard (or skipped it). */
  onboardingCompleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

/**
 * @deprecated Kept for legacy migration only. New code should use Package.
 * Existing clients get migrated to auto-created "Tier A/B/C" packages on
 * first boot; task templates get their applicableTiers replaced with
 * applicablePackageIds.
 */
export type ClientTier = 'A' | 'B' | 'C';

/**
 * @deprecated Fallback used only when a client has no package assigned.
 * Package-driven hours are stored on the Package doc itself.
 */
export const HOURS_PER_TIER: Record<ClientTier, number> = {
  A: 9,
  B: 5.5,
  C: 3.5,
};

export type TaskCategory =
  | 'technical'
  | 'onpage'
  | 'content'
  | 'offpage'
  | 'local-gbp'
  | 'monitoring'
  | 'reporting';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export type AttachmentLabel = 'before' | 'after' | 'other';

export interface TaskAttachment {
  publicId: string;
  url: string;
  thumbnailUrl?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  resourceType?: 'image' | 'raw' | 'video';
  originalFilename?: string;
  label?: AttachmentLabel;
  caption?: string;
  uploadedAt: Date;
}

export type CycleStatus = 'upcoming' | 'active' | 'reporting' | 'closed';

export interface ClientContact {
  name: string;
  email: string;
  role?: string;
}

export interface ClientAccess {
  gsc?: boolean;
  ga4?: boolean;
  gbp?: boolean;
  cms?: boolean;
  ahrefs?: boolean;
  semrush?: boolean;
  notes?: string;
}

export type CredentialCategory =
  | 'website'
  | 'booking'
  | 'social'
  | 'email'
  | 'other';

export const CREDENTIAL_CATEGORY_LABELS: Record<CredentialCategory, string> = {
  website: 'Website',
  booking: 'Booking / Scheduling',
  social: 'Social / Ads',
  email: 'Email / Marketing',
  other: 'Other',
};

export interface ClientCredential {
  _id?: string;
  label: string;
  category: CredentialCategory;
  url?: string;
  username?: string;
  password?: string;
  notes?: string;
  updatedAt?: Date;
}

export interface ClientKnowledge {
  brandVoice?: string;
  targetPersona?: string;
  anchorRules?: string;
  internalLinkingStrategy?: string;
  internalNotes?: string;
}

export interface ServiceAreaMetrics {
  clicks: number;
  impressions: number;
  ctr: number; // percentage
  position: number;
  rangeFrom: string;
  rangeTo: string;
  refreshedAt: Date;
}

export interface ServiceArea {
  name: string;
  city?: string;
  region?: string; // state / province
  country?: string; // US, MX, PR, DO, etc.
  postalCode?: string;
  landingPageUrl?: string;
  googleMapsUrl?: string;
  primaryKeyword?: string;
  notes?: string;
  isCityHub?: boolean; // primary city the client serves — pinned and surfaced separately in reports
  metrics?: ServiceAreaMetrics;
}

export interface ServiceAreaSnapshot {
  name: string;
  city?: string;
  region?: string;
  country?: string;
  landingPageUrl?: string;
  googleMapsUrl?: string;
  isCityHub?: boolean;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  rangeFrom: string;
  rangeTo: string;
}

/**
 * Service lines a client can be signed up for. Multi-select — a
 * client with SEO + PPC has both. Consumed by the Clients page
 * filter pills (PPC / SEO / PPC+SEO / etc.).
 */
export type ClientServiceLine = 'seo' | 'ppc' | 'website' | 'other';

export const CLIENT_SERVICE_LABELS: Record<ClientServiceLine, string> = {
  seo: 'SEO',
  ppc: 'PPC',
  website: 'Website',
  other: 'Other',
};

/**
 * Rolled-up health signal derived server-side from the days-since-last
 * outbound email and open-task percentage on the current cycle.
 */
export type ClientHealthStatus = 'healthy' | 'watch' | 'at-risk';

export interface ClientRosterStats {
  totalActive: number;
  atRisk: number;
  expansion: number;
  canceled: number;
  perService: {
    seo: number;
    ppc: number;
    website: number;
    other: number;
    combo: number; // multi-service = clients with 2+ services
  };
}

export interface Client {
  _id?: string;
  name: string;
  /**
   * @deprecated Use `packageId` (+ populated `package`) instead. Preserved
   * during the tier → package migration so legacy references keep working
   * until every consumer moves over.
   */
  tier?: ClientTier;
  url: string;
  logoUrl?: string;
  industry?: string;
  // When populated, the API may return the populated user object on ownerId.
  ownerId?: string | { _id: string; name: string; email: string };
  contacts: ClientContact[];
  access: ClientAccess;
  credentials?: ClientCredential[];
  knowledge?: ClientKnowledge;
  baselineKpis?: ReportKpis;
  baselineDate?: Date;
  hoursPerCycle: number;
  active: boolean;
  /** Optional last day of the engagement (month-to-month clients). */
  endingDate?: Date | string;
  /** Alt names that should also match this client during Calendar pulls. */
  calendarAliases?: string[];
  /** Google Docs id linked for task / cycle injection (the part after /document/d/). */
  googleDocId?: string;
  /** Google Sheets id reserved for a future read integration. */
  googleSheetId?: string;
  ga4PropertyId?: string;
  gscSiteUrl?: string;
  /**
   * ISO 3166-1 alpha-3 lowercase (e.g. 'usa', 'mex', 'gbr'). When set,
   * the daily GSC snapshot cron filters the position query to this
   * country only — so a local business in Denver stops averaging in
   * accidental impressions from India. When unset, snapshots stay
   * worldwide (the legacy behavior).
   */
  positionTrackingCountry?: string;
  isEcommerce?: boolean;
  merchantCenterId?: string;
  /** Full GBP account resource name, e.g. `accounts/12345`. */
  gbpAccountName?: string;
  /** Full GBP location resource name, e.g. `locations/67890`. */
  gbpLocationName?: string;
  shopifyShopDomain?: string;
  shopifyClientId?: string;
  shopifyClientSecret?: string;
  shopifyAccessToken?: string;
  websitePlatform?: WebsitePlatform;
  wordpressSiteUrl?: string;
  wordpressUsername?: string;
  wordpressAppPassword?: string;
  wordpressSeoPlugin?: WordpressSeoPlugin;
  serviceAreas?: ServiceArea[];
  // --- Business profile (surfaced in the client onboarding tab) ---
  phone?: string;
  address?: string;
  businessDescription?: string;
  categories?: string[];
  /** Services the client offers to THEIR customers (business profile). */
  services?: string[];
  socialLinks?: string[];
  reviewsUrl?: string;
  photosUrl?: string;
  /**
   * Files attached at the client level — contracts, brand kits,
   * reference material — that don't belong to any specific task or
   * content piece. Each has an optional free-text label the user
   * can set to categorize.
   */
  attachments?: ClientAttachment[];
  /**
   * Free-text notes attached to the client (log entries, meeting
   * recaps, decisions). Multiple entries per client, each with its
   * own optional attachments. Ordered newest-first by convention.
   */
  notes?: ClientNote[];
  /**
   * Agency-side classifier: what services WE provide to this client.
   * Powers the Clients page filter pills (PPC / SEO / PPC+SEO /
   * Website), the At-risk + Expansion tabs (multi-service), and the
   * per-service roster tiles. Different concept from `services`
   * above.
   */
  serviceLines?: ClientServiceLine[];
  /**
   * External client-portal accounts linked to this Client. Portal UI is
   * deferred to Phase 6+; the field is reserved on the schema so the
   * onboarding flow that creates portal accounts has a place to attach
   * them without a follow-up migration.
   */
  linkedUsers?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GoogleConnectionLink {
  connected: boolean;
  email?: string;
  connectedAt?: Date;
  /** True when the scope is missing on the persisted token — user must reconnect. */
  needsReconnect?: boolean;
}

export interface GoogleConnectionStatus {
  gsc: GoogleConnectionLink;
  ga4: GoogleConnectionLink;
  merchantCenter?: GoogleConnectionLink;
  gbp?: GoogleConnectionLink;
  calendar?: GoogleConnectionLink;
  gmail?: GoogleConnectionLink;
  /** Google Ads. Shares the same OAuth token — needsReconnect when the
   *  adwords scope hasn't been granted on the stored token yet. */
  googleAds?: GoogleConnectionLink;
}

export interface GbpAccount {
  name: string;
  accountId: string;
  accountName?: string;
  type?: string;
  role?: string;
  verificationState?: string;
  organizationInfo?: { registeredDomain?: string };
}

export interface GbpLocation {
  name: string;
  locationId: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
    regionCode?: string;
  };
  primaryPhone?: string;
  websiteUri?: string;
}

export type KeywordIntent =
  | 'informational'
  | 'transactional'
  | 'commercial'
  | 'navigational';

export type RankingDevice = 'desktop' | 'mobile';

export type KeywordSource = 'manual' | 'gsc';

/** Planning priority for a keyword sitting in a research list. */
export type KeywordPriority = 'high' | 'medium' | 'low';

export const KEYWORD_PRIORITIES: KeywordPriority[] = ['high', 'medium', 'low'];

/**
 * Where a keyword sits in the work pipeline. Deliberately coarse — the
 * detailed state lives on the Task / ContentPiece the keyword feeds.
 */
export type KeywordStatus = 'idea' | 'assigned' | 'published';

export const KEYWORD_STATUSES: KeywordStatus[] = [
  'idea',
  'assigned',
  'published',
];

export const KEYWORD_STATUS_LABELS: Record<KeywordStatus, string> = {
  idea: 'Idea',
  assigned: 'Assigned',
  published: 'Published',
};

export const KEYWORD_INTENTS: KeywordIntent[] = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
];

export const KEYWORD_INTENT_LABELS: Record<KeywordIntent, string> = {
  informational: 'Informational',
  commercial: 'Commercial',
  transactional: 'Transactional',
  navigational: 'Navigational',
};

/**
 * A named bucket of keywords for one client — "Core: storage units",
 * "Q4 content gaps", "Competitor overlap".
 *
 * Membership lives on the Keyword (`listIds`), not here, so one keyword
 * can belong to several lists while still being a single record per
 * client. That keeps volume / difficulty / position from drifting
 * between copies, and lets a researched keyword be promoted straight to
 * tracking without re-entering it.
 */
export interface KeywordList {
  _id?: string;
  clientId: string;
  name: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** KeywordList plus the counts the UI shows on the list rail. */
export interface KeywordListWithStats extends KeywordList {
  keywordCount: number;
  trackedCount: number;
  totalVolume: number;
}

export interface Keyword {
  _id?: string;
  clientId: string;
  text: string;
  targetUrl?: string;
  volume?: number;
  difficulty?: number;
  intent?: KeywordIntent;
  group?: string;
  /**
   * Lists this keyword belongs to. A keyword can sit in several.
   */
  listIds?: string[];
  /**
   * False for research keywords: they stay out of the position cron,
   * the GSC sync and the Keywords tracking table. Undefined counts as
   * tracked so every keyword that predates keyword lists keeps its
   * current behaviour — no backfill needed.
   */
  tracked?: boolean;
  /** Cost per click, when the source export carries it. */
  cpc?: number;
  /** Parent topic / keyword core this one hangs off. */
  parentTopic?: string;
  priority?: KeywordPriority;
  status?: KeywordStatus;
  notes?: string;
  currentPosition?: number;
  previousPosition?: number;
  currentRankingUrl?: string;
  previousRankingUrl?: string;
  urlChangedAt?: Date;
  bestPosition?: number;
  bestPositionAt?: Date;
  lastCheckedAt?: Date;
  source?: KeywordSource;
  gscPulledAt?: Date;
  gscClicks?: number;
  gscImpressions?: number;
  gscCtr?: number;
  gscPosition?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GscKeywordPullResult {
  created: number;
  updated: number;
  skipped: number;
  totalReturned: number;
  range: { from: string; to: string };
  warnings: string[];
}

export interface KeywordRanking {
  _id?: string;
  keywordId: string;
  position: number;
  rankingUrl?: string;
  device?: RankingDevice;
  location?: string;
  /**
   * ISO 3166-1 alpha-3 lowercase of the country the snapshot was
   * filtered to (e.g. 'usa'). Undefined on legacy rows that pre-date
   * geo tagging — those represent worldwide averages.
   */
  country?: string;
  notes?: string;
  recordedAt: Date;
}

export interface KeywordMovement {
  keyword: Keyword;
  delta: number;
  direction: 'up' | 'down' | 'flat' | 'new';
}

export interface KeywordVolatility {
  keyword: Keyword;
  uniqueUrls: number;
  urls: string[];
  changesIn90Days: number;
}

export interface CompetitorKeyword {
  _id?: string;
  /** ObjectId of the keyword in the client's Keyword collection. */
  keywordId: string;
  position?: number;
  previousPosition?: number;
  rankingUrl?: string;
  lastCheckedAt?: Date | string;
  notes?: string;
}

export interface Competitor {
  _id?: string;
  clientId: string;
  name: string;
  url: string;
  domainRating?: number;
  estimatedTraffic?: number;
  notes?: string;
  tags?: string[];
  /** When set, this competitor applies only to that service area. */
  serviceAreaName?: string;
  /** Keywords this competitor is competing on. Manual association. */
  keywords?: CompetitorKeyword[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContentStatus = 'idea' | 'draft' | 'published';

export const CONTENT_STATUSES: ContentStatus[] = [
  'idea',
  'draft',
  'published',
];

export type ContentPieceType = 'page' | 'post';

export const CONTENT_PIECE_TYPES: ContentPieceType[] = ['page', 'post'];

/**
 * Client-scoped attachment. Same Cloudinary metadata shape as
 * ContentAttachment but with a free-text `label` tag so users can
 * name buckets themselves (Contract, Brand kit, Reference, …) without
 * a fixed enum.
 */
export interface ClientAttachment {
  publicId: string;
  url: string;
  thumbnailUrl?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  resourceType?: 'image' | 'raw' | 'video';
  originalFilename?: string;
  /** Free-text tag for the reader — Contract, Brand kit, Reference,
   *  whatever the user wants. Optional. */
  label?: string;
  uploadedAt: Date;
}

/**
 * A note attached to a client — free-text log entry the strategist
 * can drop with any level of formality. Same attachment shape as
 * ClientAttachment so we reuse the upload plumbing; there's no
 * label since attachments here live inside a note that's already
 * providing context.
 */
export interface ClientNoteAttachment {
  publicId: string;
  url: string;
  thumbnailUrl?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  resourceType?: 'image' | 'raw' | 'video';
  originalFilename?: string;
  uploadedAt: Date | string;
}

export interface ClientNote {
  _id?: string;
  /** Free-text body. Plain text — line breaks preserved by the UI. */
  content: string;
  attachments?: ClientNoteAttachment[];
  /** User who wrote the note. Optional for legacy rows / system entries. */
  authorId?: string;
  authorName?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface ContentAttachment {
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
}

/**
 * Snapshot of a published URL's indexation state, sourced from
 * Google Search Console's URL Inspection API. Verdict is the top-line
 * PASS / PARTIAL / FAIL from Google; the coverage state is the human
 * label ("Submitted and indexed", "URL is not on Google", etc.) shown
 * on the GSC dashboard.
 */
export interface ContentIndexationStatus {
  verdict?: 'PASS' | 'PARTIAL' | 'FAIL' | 'NEUTRAL' | 'VERDICT_UNSPECIFIED';
  coverageState?: string;
  indexingState?: string;
  robotsTxtState?: string;
  lastCrawlTime?: Date;
  pageFetchState?: string;
  googleCanonical?: string;
  userCanonical?: string;
  checkedAt: Date;
  /** Set when the caller hit the Indexing API to notify Google about
   *  a change to the URL. Doesn't guarantee the page is indexed — just
   *  that the request was accepted. */
  indexingRequestedAt?: Date;
}

export interface ContentPiece {
  _id?: string;
  clientId: string;
  title: string;
  status: ContentStatus;
  /** Whether this piece is a static page or a blog post. Defaults to 'post' for legacy docs. */
  contentType?: ContentPieceType;
  targetKeyword?: string;
  targetUrl?: string;
  briefUrl?: string;
  publishedUrl?: string;
  /**
   * SEO meta title captured at publish time. Included in the
   * publication task's description so the Google Doc mirror can
   * archive it alongside the URL and focused keyword.
   */
  metaTitle?: string;
  /** SEO meta description captured at publish time. Same use as above. */
  metaDescription?: string;
  publishedAt?: Date;
  assignedTo?: string;
  wordCount?: number;
  notes?: string;
  attachments?: ContentAttachment[];
  /** Latest indexation snapshot from Google Search Console. Only
   *  populated for pieces with a publishedUrl after a check runs. */
  indexation?: ContentIndexationStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BacklinkStatus = 'live' | 'lost' | 'pending';
export type BacklinkType = 'dofollow' | 'nofollow';

export interface TaskTemplate {
  _id?: string;
  title: string;
  category: TaskCategory;
  description?: string;
  defaultEstimatedHours: number;
  defaultPriority: 'high' | 'medium' | 'low';
  applicableTiers: ClientTier[];
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Backlink {
  _id?: string;
  clientId: string;
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText: string;
  domainRating?: number;
  linkType: BacklinkType;
  status: BacklinkStatus;
  acquiredAt?: Date;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Cycle {
  _id?: string;
  startDate: Date;
  endDate: Date;
  reportDueDate: Date;
  status: CycleStatus;
  label: string;
}

export interface Subtask {
  title: string;
  done: boolean;
}

export interface Task {
  _id?: string;
  clientId: string;
  cycleId: string;
  category: TaskCategory;
  title: string;
  description?: string;
  estimatedHours: number;
  actualHours: number;
  status: TaskStatus;
  priority: 'high' | 'medium' | 'low';
  completedAt?: Date;
  notes?: string;
  /**
   * When set, this task tracks work for a specific content pipeline
   * piece. Populated by the "Write draft" action so publishing the
   * piece can auto-complete this task.
   */
  contentPieceId?: string;
  attachments?: TaskAttachment[];
  subtasks?: Subtask[];
  comments?: Array<{
    content: string;
    authorRole: 'supervisor' | 'team';
    authorName?: string;
    createdAt: Date | string;
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReportKpis {
  organicSessions?: number;
  newUsers?: number;
  engagementRate?: number; // percentage 0-100
  avgEngagementTime?: number; // seconds
  conversionRate?: number; // percentage
  impressions?: number;
  clicks?: number;
  ctr?: number;
  avgPosition?: number;
  conversions?: number;
  indexedPages?: number;
  nonIndexedPages?: number;
  gbpSearches?: number;
  gbpCalls?: number;
  gbpDirections?: number;
  gbpWebsiteClicks?: number;
  gbpReviews?: number;
}

export interface GscBreakdownRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number; // percentage 0-100
  position: number;
}

export interface GscSitemapHealth {
  totalSitemaps: number;
  totalSubmittedUrls: number;
  totalErrors: number;
  totalWarnings: number;
  sitemaps: Array<{
    path: string;
    submitted: number;
    errors: number;
    warnings: number;
    lastSubmitted?: string;
  }>;
}

export interface GscBreakdown {
  topPages: GscBreakdownRow[];
  byDevice: GscBreakdownRow[];
  byCountry: GscBreakdownRow[];
  sitemapHealth: GscSitemapHealth;
  range: { from: string; to: string };
}

export interface Report {
  _id?: string;
  clientId: string;
  cycleId: string;
  kpis: ReportKpis;
  kpisPrevious?: ReportKpis;
  /**
   * Origin of `kpisPrevious`:
   *  - 'previous': the KPI snapshot from the prior cycle's report
   *  - 'baseline': the client's `baselineKpis` (used for first-period reports)
   *  - null: no comparison data available
   * Surfaced by getPublicPayload, not persisted on the report doc.
   */
  kpisPreviousSource?: 'previous' | 'baseline' | null;
  coverImageUrl?: string;
  executiveSummary: string;
  findings: string;
  nextPeriodPlan: string;
  clientBlockers: string;
  finalConsiderations?: string;
  includeServiceAreas?: boolean;
  /** When false, the public report hides previous-period comparisons. */
  comparePeriods?: boolean;
  /** Sort criterion for the Locations Performance grid. Defaults to clicks. */
  locationsSort?: LocationsSortKey;
  /**
   * KPI keys to exclude from the public report and PDF. Empty/undefined =
   * show every KPI that has a value (legacy behavior).
   */
  hiddenKpis?: string[];
  serviceAreasSnapshot?: ServiceAreaSnapshot[];
  generatedAt: Date;
  sentAt?: Date;
  pdfPath?: string;
  shareToken?: string;
  sharedAt?: Date;
}

export interface WorkingHoursTimeRange {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface WorkingHoursConfig {
  _id?: string;
  userId: string;
  workDays: number[]; // 0=Sun .. 6=Sat
  timeBlocks: WorkingHoursTimeRange[];
  dailyCapHours: number;
  timezone?: string;
  daysOff: string[]; // YYYY-MM-DD
  createdAt?: Date;
  updatedAt?: Date;
}

export const DEFAULT_WORKING_HOURS: Omit<WorkingHoursConfig, 'userId'> = {
  workDays: [1, 2, 3, 4, 5],
  timeBlocks: [
    { start: '07:00', end: '12:00' },
    { start: '13:00', end: '17:00' },
  ],
  dailyCapHours: 8,
  timezone: 'America/Puerto_Rico',
  daysOff: [],
};

export interface PublicReportPayload {
  report: Report;
  client: Pick<Client, 'name' | 'tier' | 'url' | 'logoUrl' | 'industry'>;
  cycle: Pick<Cycle, 'label' | 'startDate' | 'endDate'>;
  tasks: Array<{
    title: string;
    category: TaskCategory;
    priority: 'high' | 'medium' | 'low';
    status: TaskStatus;
    notes?: string;
  }>;
  keywords: Array<{
    text: string;
    group?: string;
    volume?: number;
    currentPosition?: number;
    previousPosition?: number;
    bestPosition?: number;
    currentRankingUrl?: string;
  }>;
  movements: {
    gainers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
    losers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
    fresh: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
  };
  backlinks: {
    total: number;
    dofollow: number;
    perStatus: Array<{ _id: string; count: number; avgDr: number }>;
  };
  kpiHistory: Array<{ cycleLabel?: string; generatedAt: Date; kpis: ReportKpis }>;
  serviceAreas?: Array<
    ServiceAreaSnapshot & {
      previous?: Pick<
        ServiceAreaSnapshot,
        'clicks' | 'impressions' | 'ctr' | 'position' | 'rangeFrom' | 'rangeTo'
      >;
    }
  >;
  /**
   * Per-deliverable completion counts for the report window. Computed
   * server-side from tasks whose category matches each deliverable's
   * matchTaskCategory. Absent when the client has no package.
   */
  packageProgress?: Array<{ key: string; completed: number }>;
}

export type ShopifyResource = 'product' | 'collection' | 'page' | 'article';

export interface ShopifyResourceItem {
  id: string;
  handle: string;
  title: string;
  seoTitle?: string;
  seoDescription?: string;
  status?: string;
  updatedAt?: string;
  onlineStoreUrl?: string;
}

export type LocationsSortKey =
  | 'clicks'
  | 'impressions'
  | 'ctr'
  | 'position';

export const LOCATIONS_SORT_OPTIONS: Array<{
  key: LocationsSortKey;
  label: string;
  description: string;
}> = [
  {
    key: 'clicks',
    label: 'Clicks (most traffic first)',
    description: 'Best for showcasing top-performing locations.',
  },
  {
    key: 'impressions',
    label: 'Impressions (most visibility first)',
    description: 'Best for showing reach in search results.',
  },
  {
    key: 'ctr',
    label: 'CTR (highest first)',
    description: 'Best for showing efficiency of search snippet.',
  },
  {
    key: 'position',
    label: 'Avg position (best ranking first)',
    description: 'Best for showcasing ranking quality (lower = better).',
  },
];

export type ReportSectionKey =
  | 'kpi-snapshot'
  | 'executive-summary'
  | 'key-metrics'
  | 'locations-performance'
  | 'search-rankings'
  | 'top-performing-pages'
  | 'ranking-movement'
  | 'serp-preview'
  | 'actions-taken'
  | 'next-period-plan'
  | 'backlinks-profile'
  | 'client-blockers'
  | 'final-considerations';

/**
 * Sections that render as visual snapshots rather than numbered sections.
 * Excluded from the "01, 02, 03…" counter so adding them at the top of
 * the layout doesn't renumber the actual analytical sections that follow.
 */
export const UNNUMBERED_REPORT_SECTIONS: readonly ReportSectionKey[] = [
  'kpi-snapshot',
];

export interface ReportSectionConfig {
  key: ReportSectionKey;
  visible: boolean;
}

export const DEFAULT_REPORT_LAYOUT: ReportSectionConfig[] = [
  { key: 'kpi-snapshot', visible: true },
  { key: 'executive-summary', visible: true },
  { key: 'key-metrics', visible: true },
  { key: 'locations-performance', visible: true },
  { key: 'search-rankings', visible: true },
  { key: 'top-performing-pages', visible: true },
  { key: 'ranking-movement', visible: true },
  { key: 'serp-preview', visible: true },
  { key: 'actions-taken', visible: true },
  { key: 'next-period-plan', visible: true },
  { key: 'backlinks-profile', visible: true },
  { key: 'client-blockers', visible: true },
  { key: 'final-considerations', visible: true },
];

export const REPORT_SECTION_META: Record<
  ReportSectionKey,
  { label: string; description: string }
> = {
  'kpi-snapshot': {
    label: 'KPI Snapshot',
    description: 'Hero row of top KPIs (clicks, impressions, avg position, top-10 keywords) with prior-period deltas — rendered directly under the cover image, no section number.',
  },
  'executive-summary': {
    label: 'Executive Summary',
    description: 'Bullet-point recap of the period for the client.',
  },
  'key-metrics': {
    label: 'Key Metrics',
    description: 'GSC + GA4 KPI cards with deltas.',
  },
  'locations-performance': {
    label: 'Locations Performance',
    description: 'Per-city service area performance (shown only if enabled on the report).',
  },
  'search-rankings': {
    label: 'Search Rankings',
    description: 'Keywords, movements, gainers/losers.',
  },
  'top-performing-pages': {
    label: 'Top Performing Pages',
    description: 'Highest-traffic pages driving the period, from Search Console.',
  },
  'ranking-movement': {
    label: 'Ranking Movement',
    description: 'Major climbers, newly-ranking queries, and count of top-10 keywords.',
  },
  'serp-preview': {
    label: 'SERP Preview',
    description: 'Google-style mock of how the client appears for their top query.',
  },
  'actions-taken': {
    label: 'Actions Taken',
    description: 'Tasks completed during the period with attachments.',
  },
  'next-period-plan': {
    label: 'Next Period Plan',
    description: 'Forward-looking action plan.',
  },
  'backlinks-profile': {
    label: 'Backlinks Profile',
    description: 'Total / dofollow / status breakdown.',
  },
  'client-blockers': {
    label: 'Pending from your side',
    description: "Items that require client action.",
  },
  'final-considerations': {
    label: 'Final Considerations',
    description: 'Closing notes for the client.',
  },
};

export interface AppSettings {
  reportLayout?: ReportSectionConfig[];
  /**
   * Days from client creation before the onboarding warning kicks in.
   * Default 14. Applied globally — every client shares the same window.
   */
  onboardingWindowDays?: number;
  /**
   * Org-level branding — surfaced on the shell header, outbound emails,
   * and generated PDFs. Set once at platform level; individual reports
   * still respect their own coverImageUrl.
   */
  organizationName?: string;
  organizationColor?: string;
  /**
   * Frequency prefs for automated digests (delivery risk, client
   * health, credentials watchdog). Consumed by cron scheduling once
   * those modules land.
   */
  digestFrequency?: 'weekly' | 'biweekly' | 'monthly';
}

export const DEFAULT_ORG_NAME = 'Media Spearhead';
export const DEFAULT_ORG_COLOR = '#FF7A59';

export type WebsitePlatform = 'shopify' | 'wordpress' | 'custom';

export type WordpressSeoPlugin = 'yoast' | 'rankmath' | 'aioseo' | 'native';

export interface WordpressPostType {
  slug: string;
  name: string;
  restBase: string;
  hierarchical?: boolean;
  builtin?: boolean;
}

export interface WordpressResourceItem {
  id: number;
  slug: string;
  title: string;
  link?: string;
  status?: string;
  modified?: string;
  postType: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface WordpressConnectionInfo {
  connected: boolean;
  siteUrl?: string;
  siteName?: string;
  user?: string;
  seoPlugin?: WordpressSeoPlugin;
  error?: string;
}

export interface WordpressSeoCsvRow {
  slug: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface WordpressSeoPreviewRow {
  slug: string;
  matched: boolean;
  id?: number;
  title?: string;
  currentSeoTitle?: string;
  currentSeoDescription?: string;
  newSeoTitle?: string;
  newSeoDescription?: string;
  titleChanged: boolean;
  descriptionChanged: boolean;
  error?: string;
}

export interface WordpressApplyResultRow {
  slug: string;
  id?: number;
  success: boolean;
  error?: string;
}

export type ShopifyAuthMode = 'oauth-client-credentials' | 'legacy-token';

export interface ShopifyConnectionInfo {
  connected: boolean;
  shopDomain?: string;
  shopName?: string;
  primaryDomain?: string;
  authMode?: ShopifyAuthMode;
  tokenExpiresAt?: string;
  error?: string;
}

export interface ShopifySeoCsvRow {
  handle: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface ShopifySeoPreviewRow {
  handle: string;
  matched: boolean;
  id?: string;
  title?: string;
  currentSeoTitle?: string;
  currentSeoDescription?: string;
  newSeoTitle?: string;
  newSeoDescription?: string;
  titleChanged: boolean;
  descriptionChanged: boolean;
  error?: string;
}

export interface ShopifyApplyResultRow {
  handle: string;
  id?: string;
  success: boolean;
  error?: string;
}
