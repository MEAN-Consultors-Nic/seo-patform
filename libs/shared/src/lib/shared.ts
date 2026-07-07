export type UserRole = 'root' | 'seo-manager' | 'seo-strategist';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  'root': 'Root',
  'seo-manager': 'SEO Manager',
  'seo-strategist': 'SEO Strategist',
};

export interface User {
  _id?: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
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

/**
 * Cadence at which a deliverable's quantity applies. Powers progress
 * calculations (deliverable-completed ÷ target-in-window) in the report.
 */
export type DeliverableFrequency =
  | 'per_period'
  | 'weekly'
  | 'biweekly'
  | 'monthly';

export const DELIVERABLE_FREQUENCY_LABELS: Record<DeliverableFrequency, string> = {
  per_period: 'per report period',
  weekly: 'per week',
  biweekly: 'every 2 weeks',
  monthly: 'per month',
};

/**
 * A single line item inside a Package. Structured so the report can
 * automatically show "X of Y completed this period" when the deliverable
 * declares which TaskCategory it maps to.
 */
export interface Deliverable {
  /** Stable identifier within the package. Used by report progress. */
  key: string;
  /** Human-readable label shown in the report and the package editor. */
  label: string;
  /** Target quantity per period (see frequency). */
  quantity: number;
  /** Unit noun for display, e.g., "posts", "pages", "citations". */
  unit: string;
  /** How often the target quantity applies. */
  frequency: DeliverableFrequency;
  /**
   * Optional link to a task category — when set, completed tasks in this
   * category within the reporting window count toward the deliverable.
   */
  matchTaskCategory?: TaskCategory;
  notes?: string;
}

/**
 * A grouping of deliverables and metadata that replaces the old ClientTier
 * enum. Packages are org-wide and CRUD-managed via Settings → Packages.
 */
export interface Package {
  _id?: string;
  name: string;
  description?: string;
  /**
   * Tailwind palette family used for the package badge in lists and
   * cards. Stored as a semantic name so the UI can look it up in
   * PACKAGE_COLOR_PALETTE without shipping arbitrary CSS.
   */
  color: PackageColor;
  deliverables: Deliverable[];
  /** Estimated hours per report period for scheduling defaults. */
  hoursPerPeriod?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type PackageColor =
  | 'ink'
  | 'sky'
  | 'brand'
  | 'positive'
  | 'amber'
  | 'purple'
  | 'rose';

export const PACKAGE_COLOR_PALETTE: Record<
  PackageColor,
  { bg: string; text: string; label: string }
> = {
  ink: { bg: 'bg-ink-900', text: 'text-white', label: 'Ink (dark)' },
  sky: { bg: 'bg-sky-500', text: 'text-white', label: 'Sky (blue)' },
  brand: { bg: 'bg-brand-500', text: 'text-white', label: 'Brand (coral)' },
  positive: { bg: 'bg-positive-500', text: 'text-white', label: 'Positive (green)' },
  amber: { bg: 'bg-amber-500', text: 'text-white', label: 'Amber' },
  purple: { bg: 'bg-purple-500', text: 'text-white', label: 'Purple' },
  rose: { bg: 'bg-rose-500', text: 'text-white', label: 'Rose' },
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

export interface Client {
  _id?: string;
  name: string;
  /**
   * @deprecated Use `packageId` (+ populated `package`) instead. Preserved
   * during the tier → package migration so legacy references keep working
   * until every consumer moves over.
   */
  tier?: ClientTier;
  /** ObjectId reference to Package. Assigned during migration + creation. */
  packageId?: string;
  /** Populated Package doc when the API expands the reference. */
  package?: Package;
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

export interface Keyword {
  _id?: string;
  clientId: string;
  text: string;
  targetUrl?: string;
  volume?: number;
  difficulty?: number;
  intent?: KeywordIntent;
  group?: string;
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
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContentStatus = 'idea' | 'draft' | 'published';

export const CONTENT_STATUSES: ContentStatus[] = [
  'idea',
  'draft',
  'published',
];

export interface ContentPiece {
  _id?: string;
  clientId: string;
  title: string;
  status: ContentStatus;
  targetKeyword?: string;
  targetUrl?: string;
  briefUrl?: string;
  publishedUrl?: string;
  publishedAt?: Date;
  assignedTo?: string;
  wordCount?: number;
  notes?: string;
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

export type TimeBlockStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export type TimeBlockKind = 'client' | 'reporting';

export interface TimeBlock {
  _id?: string;
  userId: string;
  cycleId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMinutes: number;
  clientId?:
    | string
    | {
        _id: string;
        name: string;
        tier?: ClientTier;
        packageId?: string;
        package?: Package;
        logoUrl?: string;
      };
  taskId?: string | { _id: string; title: string; category: TaskCategory; status: TaskStatus };
  status: TimeBlockStatus;
  /** Reporting blocks (cycle-end "send client reports" slot) have no client. */
  kind?: TimeBlockKind;
  startedAt?: Date;
  completedAt?: Date;
  actualMinutes?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PublicReportPayload {
  report: Report;
  client: Pick<Client, 'name' | 'tier' | 'url' | 'logoUrl' | 'industry' | 'packageId' | 'package'>;
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
}

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
