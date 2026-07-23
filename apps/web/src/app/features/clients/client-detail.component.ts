import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CLIENT_SERVICE_LABELS,
  Client,
  ClientServiceLine,
  PACKAGE_COLOR_PALETTE,
  Package,
  PackageColor,
} from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { PackagesService } from '../../core/packages.service';
import { ClientKeywordsTab } from './tabs/keywords-tab.component';
import { ClientKpiHistoryTab } from './tabs/kpi-history-tab.component';
import { ClientKnowledgeTab } from './tabs/knowledge-tab.component';
import { ClientFilesTabComponent } from './tabs/files-tab.component';
import { ClientLinkGraphTab } from './tabs/link-graph-tab.component';
import { ClientContactsTab } from './tabs/contacts-tab.component';
import { ClientCompetitorsTab } from './tabs/competitors-tab.component';
import { ClientBacklinksTab } from './tabs/backlinks-tab.component';
import { ClientTasksTab } from './tabs/tasks-tab.component';
import { ClientContentTab } from './tabs/content-tab.component';
import { ClientPositionTrackerTab } from './tabs/position-tracker-tab.component';
import { ClientIntegrationsTab } from './tabs/integrations-tab.component';
import { ClientGscInsightsTab } from './tabs/gsc-insights-tab.component';
import { ClientServiceAreasTab } from './tabs/service-areas-tab.component';
import { ClientIndexingTab } from './tabs/indexing-tab.component';
import { ClientCannibalizationTab } from './tabs/cannibalization-tab.component';
import { ClientAccessTab } from './tabs/access-tab.component';
import { ClientEcommerceTab } from './tabs/ecommerce-tab.component';
import { ClientShopifyTab } from './tabs/shopify-tab.component';
import { ClientWordpressTab } from './tabs/wordpress-tab.component';
import { ClientOnboardingTabComponent } from './tabs/onboarding-tab.component';
import { ClientEmailsTabComponent } from './tabs/emails-tab.component';
import { ClientOverviewTabComponent } from './tabs/overview-tab.component';
import {
  ClientPpcCampaignsTabComponent,
  ClientWebOpsTabComponent,
} from './tabs/service-placeholders.component';
import { DomainInfoButtonComponent } from './domain-info-button.component';
import { SchemaModelerButtonComponent } from './schema-modeler-button.component';

type TabKey =
  | 'overview'
  | 'access'
  | 'contacts'
  | 'knowledge'
  | 'files'
  | 'onboarding'
  | 'tasks'
  | 'content'
  | 'emails'
  | 'keywords'
  | 'positions'
  | 'competitors'
  | 'backlinks'
  | 'kpis'
  | 'integrations'
  | 'gsc-insights'
  | 'indexing'
  | 'cannibalization'
  | 'service-areas'
  | 'link-graph'
  | 'ppc-campaigns'
  | 'web-ops'
  | 'ecommerce'
  | 'shopify'
  | 'wordpress';

type TabGroupKey = 'overview' | 'work' | 'seo' | 'ppc' | 'web' | 'setup';

interface TabDef {
  key: TabKey;
  label: string;
  group: TabGroupKey;
}

interface GroupDef {
  key: TabGroupKey;
  label: string;
}

/**
 * Sidebar section catalog. `overview` and `work` are always visible.
 * The service groups (`seo` / `ppc` / `web`) are conditional — only
 * rendered when the client has that service line configured (or, as a
 * migration fallback, when the client has no serviceLines set at all
 * we show SEO so pre-migration clients keep working).
 */
const GROUPS: GroupDef[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'work', label: 'Work' },
  { key: 'seo', label: 'SEO' },
  { key: 'ppc', label: 'PPC' },
  { key: 'web', label: 'Website' },
  { key: 'setup', label: 'Setup' },
];

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ClientKeywordsTab,
    ClientKpiHistoryTab,
    ClientKnowledgeTab,
    ClientFilesTabComponent,
    ClientLinkGraphTab,
    ClientContactsTab,
    ClientCompetitorsTab,
    ClientBacklinksTab,
    ClientTasksTab,
    ClientContentTab,
    ClientPositionTrackerTab,
    ClientIntegrationsTab,
    ClientGscInsightsTab,
    ClientIndexingTab,
    ClientCannibalizationTab,
    ClientServiceAreasTab,
    ClientAccessTab,
    ClientEcommerceTab,
    ClientShopifyTab,
    ClientWordpressTab,
    ClientOnboardingTabComponent,
    ClientEmailsTabComponent,
    ClientOverviewTabComponent,
    ClientPpcCampaignsTabComponent,
    ClientWebOpsTabComponent,
    DomainInfoButtonComponent,
    SchemaModelerButtonComponent,
  ],
  template: `
    @if (client(); as c) {
      <div class="page-container">
        <a routerLink="/clients" class="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
          ← Back to clients
        </a>

        <header class="flex flex-col sm:flex-row sm:items-start sm:justify-between mt-3 mb-6 gap-3">
          <div class="flex items-center gap-3 sm:gap-4 min-w-0">
            @if (c.logoUrl) {
              <img [src]="c.logoUrl" [alt]="c.name"
                   class="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-contain bg-white border border-ink-200 shadow-sm flex-shrink-0" />
            } @else {
              <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-ink-100 border border-ink-200 flex items-center justify-center text-xl text-ink-500 font-bold flex-shrink-0">
                {{ c.name.charAt(0) }}
              </div>
            }
            <div class="min-w-0">
              <h1 class="text-xl sm:text-2xl font-bold text-ink-900 truncate">{{ c.name }}</h1>
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                @if (packageForClient(c); as pkg) {
                  <span [class]="packageBadgeClass(pkg.color) + ' text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded'">
                    {{ pkg.name }}
                  </span>
                } @else if (c.tier) {
                  <span [class]="'tier-' + c.tier">{{ c.tier }}</span>
                }
                <span class="text-xs text-ink-500">{{ c.hoursPerCycle }} h / cycle</span>
                <span class="text-xs text-ink-300 hidden sm:inline">·</span>
                <a [href]="c.url" target="_blank" class="text-xs text-sky-500 hover:underline truncate max-w-[200px] sm:max-w-none">{{ c.url }}</a>
                <app-domain-info-button [url]="c.url" />
                <app-schema-modeler-button [url]="c.url" />
                @if (c.googleDocId) {
                  <a [href]="'https://docs.google.com/document/d/' + c.googleDocId + '/edit'"
                     target="_blank" rel="noopener"
                     class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 hover:bg-sky-200 text-[10px] font-semibold transition"
                     title="Open the working Google Doc linked to this client">
                    <span>📄</span>
                    <span>Doc</span>
                  </a>
                }
                @if (c.googleSheetId) {
                  <a [href]="'https://docs.google.com/spreadsheets/d/' + c.googleSheetId + '/edit'"
                     target="_blank" rel="noopener"
                     class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-positive-100 text-positive-500 hover:bg-positive-100/70 text-[10px] font-semibold transition"
                     title="Open the Google Sheet linked to this client">
                    <span>📊</span>
                    <span>Sheet</span>
                  </a>
                }
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
            <a [routerLink]="['/clients', c._id, 'edit']"
               class="btn-secondary text-xs sm:text-sm">
              ✏ Edit client
            </a>
            <a [routerLink]="['/clients', c._id, 'edit']" [queryParams]="{ tab: 'subscriptions' }"
               class="btn-secondary text-xs sm:text-sm">
              🧩 Subscriptions
            </a>
            <a [routerLink]="['/reports']" [queryParams]="{ clientId: c._id }" class="btn-primary text-xs sm:text-sm">
              Generate report
            </a>
          </div>
        </header>

        <!-- Mobile-only trigger to open the section drawer. On md+ the
             sidebar is always docked to the left of the content. -->
        <button type="button"
                class="md:hidden mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-ink-200 bg-white text-xs font-semibold text-ink-700 hover:bg-ink-50"
                (click)="openSidebar()">
          <span>☰</span>
          <span>{{ activeTabLabel() }}</span>
        </button>

        <!-- Mobile drawer backdrop -->
        @if (sidebarOpen()) {
          <button type="button"
                  class="md:hidden fixed inset-0 z-30 bg-ink-900/40"
                  aria-label="Close sections"
                  (click)="closeSidebar()"></button>
        }

        <div class="flex flex-col md:flex-row md:gap-6">
          <aside
            class="bg-white border border-ink-200 rounded-lg flex-shrink-0
                   md:w-52 md:static md:translate-x-0
                   fixed inset-y-0 left-0 w-64 z-40 transform transition-transform md:transition-none
                   md:rounded-lg rounded-none md:border md:border-ink-200 border-r"
            [class.translate-x-0]="sidebarOpen()"
            [class.-translate-x-full]="!sidebarOpen()">
            <div class="md:hidden flex items-center justify-between px-3 py-2.5 border-b border-ink-200">
              <div class="text-xs font-bold text-ink-900">Sections</div>
              <button type="button" (click)="closeSidebar()"
                      class="text-ink-400 hover:text-ink-900 text-xl leading-none px-1"
                      aria-label="Close">×</button>
            </div>
            <div class="py-1 overflow-y-auto md:max-h-none max-h-[calc(100vh-3rem)]">
              @for (g of visibleGroups(); track g.key) {
                <div class="mb-1">
                  <!-- Section header. Loud enough that the eye reads
                       "WORK / PERFORMANCE / SEO HEALTH / SETUP" as the
                       primary skeleton of the sidebar, then drops into
                       the sub-items underneath. Active group additionally
                       gets a coral accent so the user knows where they
                       are even when several sections are expanded. -->
                  <button type="button"
                          (click)="toggleGroupCollapsed(g.key)"
                          [class]="'w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors border-b border-ink-100 ' +
                                   (activeGroup() === g.key
                                     ? 'text-brand-600 bg-brand-500/5'
                                     : 'text-ink-900 hover:bg-ink-50')">
                    <span class="inline-flex items-center gap-1.5">
                      @if (activeGroup() === g.key) {
                        <span class="w-1 h-1 rounded-full bg-brand-500"></span>
                      }
                      <span>{{ g.label }}</span>
                    </span>
                    <span class="text-[11px] leading-none transition-transform text-ink-400"
                          [class.rotate-90]="!isGroupCollapsed(g.key)">›</span>
                  </button>
                  @if (!isGroupCollapsed(g.key)) {
                    <ul class="space-y-0.5 py-1">
                      @for (t of tabsForGroup(g.key); track t.key) {
                        <li>
                          <button type="button"
                                  (click)="selectTab(t.key)"
                                  [class]="'w-full text-left px-3 py-1.5 text-xs font-medium border-l-2 transition-colors ' +
                                           (activeTab() === t.key
                                             ? 'bg-brand-500/10 text-brand-700 border-l-brand-500'
                                             : 'text-ink-700 border-l-transparent hover:bg-ink-50 hover:text-ink-900')">
                            {{ t.label }}
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </div>
              }
            </div>
          </aside>

          <main class="flex-1 min-w-0">
            @switch (activeTab()) {
          @case ('overview') {
            <app-client-overview-tab
              [client]="c"
              (jumpToTab)="selectTab($any($event))" />
          }
          @case ('ppc-campaigns') {
            <app-client-ppc-campaigns-tab />
          }
          @case ('web-ops') {
            <app-client-web-ops-tab [clientId]="c._id!" />
          }
          @case ('access') {
            <app-client-access-tab [client]="c" (changed)="reload()" />
          }
          @case ('contacts') {
            <app-client-contacts-tab [client]="c" (changed)="reload()" />
          }
          @case ('knowledge') {
            <app-client-knowledge-tab [client]="c" (changed)="reload()" />
          }
          @case ('files') {
            <app-client-files-tab [clientId]="c._id!" [attachments]="(c.attachments ?? [])" />
          }
          @case ('onboarding') {
            <app-client-onboarding-tab [clientId]="c._id!" [client]="c" />
          }
          @case ('tasks') {
            <app-client-tasks-tab [clientId]="c._id!" />
          }
          @case ('content') {
            <app-client-content-tab [clientId]="c._id!" />
          }
          @case ('emails') {
            <app-client-emails-tab [clientId]="c._id!" [client]="c" />
          }
          @case ('keywords') {
            <app-client-keywords-tab [clientId]="c._id!" />
          }
          @case ('positions') {
            <app-client-position-tracker-tab [clientId]="c._id!" />
          }
          @case ('competitors') {
            <app-client-competitors-tab [clientId]="c._id!" />
          }
          @case ('backlinks') {
            <app-client-backlinks-tab [clientId]="c._id!" />
          }
          @case ('kpis') {
            <app-client-kpi-history-tab [clientId]="c._id!" />
          }
          @case ('integrations') {
            <app-client-integrations-tab [client]="c" />
          }
          @case ('gsc-insights') {
            <app-client-gsc-insights-tab [clientId]="c._id!" />
          }
          @case ('indexing') {
            <app-client-indexing-tab [clientId]="c._id!" [gscSiteUrl]="c.gscSiteUrl" />
          }
          @case ('cannibalization') {
            <app-client-cannibalization-tab [clientId]="c._id!" [gscSiteUrl]="c.gscSiteUrl" />
          }
          @case ('link-graph') {
            <app-client-link-graph-tab [clientId]="c._id!" />
          }
          @case ('service-areas') {
            <app-client-service-areas-tab [client]="c" />
          }
          @case ('ecommerce') {
            <app-client-ecommerce-tab [client]="c" />
          }
          @case ('shopify') {
            <app-client-shopify-tab [client]="c" />
          }
          @case ('wordpress') {
            <app-client-wordpress-tab [client]="c" />
          }
        }
          </main>
        </div>
      </div>

    }
  `,
})
export class ClientDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(ClientsService);
  private packagesSvc = inject(PackagesService);

  packages = signal<Package[]>([]);
  client = signal<Client | null>(null);
  activeTab = signal<TabKey>('overview');
  /**
   * Which service groups the client is subscribed to. When the client
   * has no serviceLines configured we fall back to showing SEO so
   * pre-migration clients keep every SEO tab visible (they were
   * built as SEO-only originally). Website is auto-enabled when the
   * client has any websitePlatform / ecommerce metadata even if the
   * classifier wasn't set explicitly.
   */
  activeServiceLines = computed<Set<ClientServiceLine>>(() => {
    const c = this.client();
    const explicit = new Set<ClientServiceLine>(
      (c?.serviceLines as ClientServiceLine[]) ?? [],
    );
    if (explicit.size === 0) {
      // Legacy client — default to SEO so nothing disappears from view.
      explicit.add('seo');
    }
    // Any client that has a website platform or ecommerce flag implicitly
    // gets the Website module so the Shopify / WordPress / Ecommerce
    // legacy tabs stay reachable regardless of the serviceLines value.
    if (c?.websitePlatform || c?.isEcommerce) {
      explicit.add('website');
    }
    return explicit;
  });

  /**
   * Full tab catalog with each entry annotated by its functional group.
   * Conditional tabs (ecommerce/shopify/wordpress) only appear when the
   * client metadata enables them, so empty groups stay empty.
   */
  allTabs = computed<TabDef[]>(() => {
    const tabs: TabDef[] = [
      { key: 'overview', label: 'Overview', group: 'overview' },

      { key: 'onboarding', label: 'Onboarding', group: 'work' },
      { key: 'tasks', label: 'Tasks', group: 'work' },
      { key: 'content', label: 'Content', group: 'work' },
      { key: 'emails', label: 'Emails', group: 'work' },

      // SEO tabs ordered by day-to-day priority: performance insights
      // first, then health checks, then keyword strategy, then the
      // supporting tools (competitors / backlinks / KPI trend / service
      // areas). Reorder here to change the sidebar order — same
      // sequence drives the render-case switch below via key lookup.
      { key: 'gsc-insights', label: 'GSC Insights', group: 'seo' },
      { key: 'indexing', label: 'Indexing', group: 'seo' },
      { key: 'cannibalization', label: 'Cannibalization', group: 'seo' },
      { key: 'link-graph', label: 'Link Graph', group: 'seo' },
      { key: 'keywords', label: 'Keywords', group: 'seo' },
      { key: 'positions', label: 'Position Tracker', group: 'seo' },
      { key: 'competitors', label: 'Competitors', group: 'seo' },
      { key: 'backlinks', label: 'Backlinks', group: 'seo' },
      { key: 'kpis', label: 'KPI History', group: 'seo' },
      { key: 'service-areas', label: 'Service Areas', group: 'seo' },

      { key: 'ppc-campaigns', label: 'Campaigns', group: 'ppc' },

      { key: 'web-ops', label: 'Site ops', group: 'web' },

      { key: 'knowledge', label: 'Knowledge', group: 'setup' },
      { key: 'contacts', label: 'Contacts', group: 'setup' },
      { key: 'access', label: 'Credentials', group: 'setup' },
      { key: 'files', label: 'Files', group: 'setup' },
      { key: 'integrations', label: 'Integrations', group: 'setup' },
    ];
    const c = this.client();
    if (c?.isEcommerce) {
      tabs.push({ key: 'ecommerce', label: '🛒 Ecommerce', group: 'web' });
    }
    // Platform-specific tab follows the websitePlatform field. We also fall
    // back to the legacy `isEcommerce` flag so existing ecommerce clients
    // still see the Shopify tab without needing to set the platform.
    if (
      c?.websitePlatform === 'shopify' ||
      (!c?.websitePlatform && c?.isEcommerce)
    ) {
      tabs.push({ key: 'shopify', label: '🛍️ Shopify', group: 'web' });
    } else if (c?.websitePlatform === 'wordpress') {
      tabs.push({
        key: 'wordpress',
        label: '📝 WordPress',
        group: 'web',
      });
    }
    return tabs;
  });

  /**
   * Only groups the client actually needs end up in the sidebar. Overview,
   * Work, and Setup are always shown; SEO / PPC / Web are gated on the
   * activeServiceLines set.
   */
  visibleGroups = computed<GroupDef[]>(() => {
    const lines = this.activeServiceLines();
    const tabs = this.allTabs();
    return GROUPS.filter((g) => {
      // Groups without any tabs are always hidden.
      if (!tabs.some((t) => t.group === g.key)) return false;
      // Service-scoped groups gate on the client's classifier.
      if (g.key === 'seo') return lines.has('seo');
      if (g.key === 'ppc') return lines.has('ppc');
      if (g.key === 'web') return lines.has('website');
      // overview / work / setup are always visible.
      return true;
    });
  });

  /** Group key that contains the currently active tab. */
  activeGroup = computed<TabGroupKey>(() => {
    const active = this.allTabs().find((t) => t.key === this.activeTab());
    return active?.group ?? 'work';
  });

  /** Tabs belonging to a given group — used by the sidebar to render section items. */
  tabsForGroup(key: TabGroupKey): TabDef[] {
    return this.allTabs().filter((t) => t.group === key);
  }

  /** Label of the currently active tab — shown in the mobile drawer trigger. */
  activeTabLabel = computed<string>(() => {
    const active = this.allTabs().find((t) => t.key === this.activeTab());
    return active?.label ?? 'Sections';
  });

  /**
   * Mobile slide-in drawer state. On md+ the sidebar is always docked,
   * so this signal is effectively desktop-irrelevant.
   */
  sidebarOpen = signal(false);

  openSidebar() {
    this.sidebarOpen.set(true);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  /**
   * Which sidebar sections are collapsed. Persisted in localStorage so a
   * user who hides 'Setup' doesn't have to re-collapse it every session.
   * The active group is force-expanded regardless of saved state so the
   * currently-selected tab is always visible without an extra click.
   */
  private collapsedGroups = signal<Set<TabGroupKey>>(this.readCollapsed());

  isGroupCollapsed(key: TabGroupKey): boolean {
    if (this.activeGroup() === key) return false;
    return this.collapsedGroups().has(key);
  }

  toggleGroupCollapsed(key: TabGroupKey) {
    const next = new Set(this.collapsedGroups());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsedGroups.set(next);
    this.persistCollapsed(next);
  }

  private readCollapsed(): Set<TabGroupKey> {
    try {
      const raw = localStorage.getItem('client-detail-collapsed-groups');
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as TabGroupKey[];
      return new Set(arr);
    } catch {
      return new Set();
    }
  }

  private persistCollapsed(next: Set<TabGroupKey>) {
    try {
      localStorage.setItem(
        'client-detail-collapsed-groups',
        JSON.stringify(Array.from(next)),
      );
    } catch {
      // localStorage can throw in private browsing — non-fatal.
    }
  }

  /** Selecting a tab closes the mobile drawer so the content is visible. */
  selectTab(key: TabKey) {
    this.activeTab.set(key);
    this.sidebarOpen.set(false);
  }

  ngOnInit() {
    this.reload();
    this.packagesSvc.list().subscribe({
      next: (list) => this.packages.set(list),
      error: () => this.packages.set([]),
    });
    // Deep-link support: ?tab=emails from the Bulk Send page lands
    // the user on the Emails tab directly. Only honors a known tab
    // key so a stale link can't send us to an undefined case.
    const requested = this.route.snapshot.queryParamMap.get('tab');
    if (requested && this.allTabs().some((t) => t.key === requested)) {
      this.activeTab.set(requested as TabKey);
    }
  }

  /**
   * Resolves the client's package from either the populated `package`
   * field the API sends, or by looking up packageId in the loaded list.
   * Returns null when the client has neither (pre-migration data).
   */
  packageForClient(c: Client): Package | null {
    if (c.package) return c.package;
    if (!c.packageId) return null;
    return this.packages().find((p) => p._id === c.packageId) ?? null;
  }

  packageBadgeClass(color: PackageColor | undefined): string {
    const c = color || 'sky';
    const palette = PACKAGE_COLOR_PALETTE[c];
    return `${palette.bg} ${palette.text}`;
  }

  /** "alias1, alias2, alias3" representation for the comma-separated input. */
  reload() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.svc.get(id).subscribe((c) => {
      this.client.set(c);
      // If the active tab lives in a group this client no longer needs
      // (say ?tab=keywords for a PPC-only client) bounce them back to
      // Overview so the sidebar and the content stay in sync.
      const activeDef = this.allTabs().find((t) => t.key === this.activeTab());
      const visibleKeys = new Set(this.visibleGroups().map((g) => g.key));
      if (activeDef && !visibleKeys.has(activeDef.group)) {
        this.activeTab.set('overview');
      }
    });
  }

}
