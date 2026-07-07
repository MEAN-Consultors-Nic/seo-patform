import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Client, PACKAGE_COLOR_PALETTE, Package, PackageColor } from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { PackagesService } from '../../core/packages.service';
import { ClientKeywordsTab } from './tabs/keywords-tab.component';
import { ClientKpiHistoryTab } from './tabs/kpi-history-tab.component';
import { ClientKnowledgeTab } from './tabs/knowledge-tab.component';
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
import { DomainInfoButtonComponent } from './domain-info-button.component';
import { SchemaModelerButtonComponent } from './schema-modeler-button.component';

type TabKey =
  | 'access'
  | 'contacts'
  | 'knowledge'
  | 'tasks'
  | 'content'
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
  | 'ecommerce'
  | 'shopify'
  | 'wordpress';

type TabGroupKey = 'work' | 'performance' | 'health' | 'platform' | 'setup';

interface TabDef {
  key: TabKey;
  label: string;
  group: TabGroupKey;
}

interface GroupDef {
  key: TabGroupKey;
  label: string;
}

const GROUPS: GroupDef[] = [
  { key: 'work', label: 'Work' },
  { key: 'performance', label: 'Performance' },
  { key: 'health', label: 'SEO Health' },
  { key: 'platform', label: 'Platform' },
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
            <button class="btn-secondary text-xs sm:text-sm" (click)="openEdit()">
              ✏ Edit client
            </button>
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
          @case ('access') {
            <app-client-access-tab [client]="c" (changed)="reload()" />
          }
          @case ('contacts') {
            <app-client-contacts-tab [client]="c" (changed)="reload()" />
          }
          @case ('knowledge') {
            <app-client-knowledge-tab [client]="c" (changed)="reload()" />
          }
          @case ('tasks') {
            <app-client-tasks-tab [clientId]="c._id!" />
          }
          @case ('content') {
            <app-client-content-tab [clientId]="c._id!" />
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

      <!-- Edit client modal -->
      @if (editOpen()) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeEdit()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between mb-4">
              <div>
                <h2 class="text-lg font-bold text-ink-900">Edit client</h2>
                <p class="text-xs text-ink-500 mt-0.5">{{ c.name }}</p>
              </div>
              <button type="button" (click)="closeEdit()"
                      class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
            </div>

            <div class="space-y-3 text-sm">
              <div>
                <label class="label">Client name</label>
                <input class="input" [(ngModel)]="form.name" placeholder="Company name" />
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label class="label">Package</label>
                  <select class="input" [ngModel]="form.packageId"
                          (ngModelChange)="onPackageChange($event)">
                    <option value="">— None —</option>
                    @for (p of packages(); track p._id) {
                      <option [value]="p._id">{{ p.name }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="label">Hours / cycle</label>
                  <input type="number" class="input" min="0" step="0.5" [(ngModel)]="form.hoursPerCycle" />
                </div>
                <div>
                  <label class="label">Status</label>
                  <select class="input" [(ngModel)]="form.active">
                    <option [ngValue]="true">Active</option>
                    <option [ngValue]="false">Inactive</option>
                  </select>
                </div>
                <div>
                  <label class="label">Ending date</label>
                  <input type="date" class="input"
                         [(ngModel)]="form.endingDate"
                         placeholder="(no end set)" />
                  <p class="text-[10px] text-ink-500 mt-1 leading-tight">
                    Last day of the engagement. Leave blank for open-ended.
                  </p>
                </div>
              </div>
              <div>
                <label class="label">URL</label>
                <input class="input" [(ngModel)]="form.url" placeholder="https://example.com" />
              </div>
              <div>
                <label class="label">Calendar aliases</label>
                <input class="input"
                       [ngModel]="calendarAliasesText()"
                       (ngModelChange)="setCalendarAliases($event)"
                       placeholder="MB Global Logistics, Buck Waste" />
                <p class="text-[11px] text-ink-500 mt-1">
                  Comma-separated alternative names. The Calendar sync also matches event titles
                  containing any of these — handy when your Google events use a different
                  spelling than the client's canonical name.
                </p>
              </div>
              <div>
                <label class="label">Logo (URL)</label>
                <input class="input" [(ngModel)]="form.logoUrl" placeholder="https://..." />
                @if (form.logoUrl) {
                  <div class="mt-2 flex items-center gap-2">
                    <img [src]="form.logoUrl" class="max-h-16 max-w-[160px] object-contain border border-ink-200 rounded p-1 bg-white" alt="preview"
                         (load)="logoPreviewOk.set(true)"
                         (error)="logoPreviewOk.set(false)" />
                    @if (logoPreviewOk() === false) {
                      <span class="text-xs text-warning-500">⚠ The URL did not load as an image (it will still be saved)</span>
                    }
                  </div>
                }
              </div>
              <div>
                <label class="label">Industry</label>
                <input class="input" [(ngModel)]="form.industry" placeholder="e.g. Storage, Logistics" />
              </div>
              <div>
                <label class="label">Website platform</label>
                <select class="input" [(ngModel)]="form.websitePlatform">
                  <option value="">— Unspecified —</option>
                  <option value="shopify">🛍️ Shopify</option>
                  <option value="wordpress">📝 WordPress</option>
                  <option value="custom">⚙️ Custom / Other</option>
                </select>
                <p class="text-[11px] text-ink-400 mt-1">
                  Enables the platform-specific tab (Shopify or WordPress) with
                  page browsing and bulk meta tag updates. "Custom / Other" is
                  informational only.
                </p>
              </div>
              <label class="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none pt-1">
                <input type="checkbox" class="rounded border-ink-300 text-brand-500 focus:ring-brand-500"
                       [(ngModel)]="form.isEcommerce" />
                <span>🛒 <strong>Ecommerce client</strong></span>
                <span class="text-xs text-ink-400">— enables the Ecommerce performance tab and the Google Merchant Center field in Integrations</span>
              </label>

              @if (dataError()) {
                <div class="text-xs text-danger-500">{{ dataError() }}</div>
              }
              @if (dataSaved()) {
                <div class="text-xs text-positive-500">✓ Saved</div>
              }
            </div>

            <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
              <button class="btn-secondary" (click)="closeEdit()">Cancel</button>
              <button class="btn-primary" (click)="saveData()" [disabled]="savingData()">
                {{ savingData() ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </div>
        </div>
      }
    }
  `,
})
export class ClientDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(ClientsService);
  private packagesSvc = inject(PackagesService);

  packages = signal<Package[]>([]);
  client = signal<Client | null>(null);
  activeTab = signal<TabKey>('tasks');
  logoPreviewOk = signal<boolean | null>(null);

  /**
   * Full tab catalog with each entry annotated by its functional group.
   * Conditional tabs (ecommerce/shopify/wordpress) only appear when the
   * client metadata enables them, so empty groups stay empty.
   */
  allTabs = computed<TabDef[]>(() => {
    const tabs: TabDef[] = [
      { key: 'tasks', label: 'Tasks', group: 'work' },
      { key: 'content', label: 'Content', group: 'work' },

      { key: 'keywords', label: 'Keywords', group: 'performance' },
      { key: 'positions', label: 'Position Tracker', group: 'performance' },
      { key: 'competitors', label: 'Competitors', group: 'performance' },
      { key: 'backlinks', label: 'Backlinks', group: 'performance' },
      { key: 'kpis', label: 'KPI History', group: 'performance' },

      { key: 'gsc-insights', label: 'GSC Insights', group: 'health' },
      { key: 'indexing', label: 'Indexing', group: 'health' },
      { key: 'cannibalization', label: 'Cannibalization', group: 'health' },

      { key: 'service-areas', label: 'Service Areas', group: 'setup' },
      { key: 'knowledge', label: 'Knowledge', group: 'setup' },
      { key: 'contacts', label: 'Contacts', group: 'setup' },
      { key: 'access', label: 'Credentials', group: 'setup' },
      { key: 'integrations', label: 'Integrations', group: 'setup' },
    ];
    const c = this.client();
    if (c?.isEcommerce) {
      tabs.push({ key: 'ecommerce', label: '🛒 Ecommerce', group: 'platform' });
    }
    // Platform-specific tab follows the websitePlatform field. We also fall
    // back to the legacy `isEcommerce` flag so existing ecommerce clients
    // still see the Shopify tab without needing to set the platform.
    if (
      c?.websitePlatform === 'shopify' ||
      (!c?.websitePlatform && c?.isEcommerce)
    ) {
      tabs.push({ key: 'shopify', label: '🛍️ Shopify', group: 'platform' });
    } else if (c?.websitePlatform === 'wordpress') {
      tabs.push({
        key: 'wordpress',
        label: '📝 WordPress',
        group: 'platform',
      });
    }
    return tabs;
  });

  /** Only groups that have at least one visible tab end up in the top nav. */
  visibleGroups = computed<GroupDef[]>(() => {
    const tabs = this.allTabs();
    return GROUPS.filter((g) => tabs.some((t) => t.group === g.key));
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

  form: {
    name: string;
    tier?: 'A' | 'B' | 'C';
    packageId?: string;
    url: string;
    logoUrl: string;
    industry: string;
    hoursPerCycle: number;
    active: boolean;
    endingDate: string;
    isEcommerce: boolean;
    websitePlatform: '' | 'shopify' | 'wordpress' | 'custom';
    calendarAliases: string[];
  } = {
    name: '',
    tier: 'C',
    url: '',
    logoUrl: '',
    industry: '',
    hoursPerCycle: 0,
    active: true,
    endingDate: '',
    isEcommerce: false,
    websitePlatform: '',
    calendarAliases: [],
  };
  editOpen = signal(false);
  savingData = signal(false);
  dataError = signal<string | null>(null);
  dataSaved = signal(false);

  ngOnInit() {
    this.reload();
    this.packagesSvc.list().subscribe({
      next: (list) => this.packages.set(list),
      error: () => this.packages.set([]),
    });
  }

  onPackageChange(packageId: string) {
    this.form.packageId = packageId;
    const pkg = this.packages().find((p) => p._id === packageId);
    if (pkg?.hoursPerPeriod !== undefined) {
      this.form.hoursPerCycle = pkg.hoursPerPeriod;
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
  calendarAliasesText(): string {
    return (this.form.calendarAliases || []).join(', ');
  }

  setCalendarAliases(raw: string) {
    this.form.calendarAliases = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  openEdit() {
    const c = this.client();
    if (!c) return;
    // Re-hydrate the form from the latest client doc so any external edits
    // (e.g. through Integrations or Service Areas) are reflected.
    this.form.name = c.name;
    this.form.tier = c.tier;
    this.form.packageId = c.packageId || c.package?._id || '';
    this.form.url = c.url;
    this.form.logoUrl = c.logoUrl || '';
    this.form.industry = c.industry || '';
    this.form.hoursPerCycle = c.hoursPerCycle ?? 0;
    this.form.active = c.active ?? true;
    this.form.isEcommerce = !!c.isEcommerce;
    this.form.websitePlatform = (c.websitePlatform as '' | 'shopify' | 'wordpress' | 'custom') || '';
    this.form.calendarAliases = (c.calendarAliases ?? []).slice();
    this.form.endingDate = c.endingDate
      ? new Date(c.endingDate).toISOString().slice(0, 10)
      : '';
    this.dataError.set(null);
    this.dataSaved.set(false);
    this.editOpen.set(true);
  }

  closeEdit() {
    if (this.savingData()) return;
    this.editOpen.set(false);
    this.dataError.set(null);
  }

  reload() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.svc.get(id).subscribe((c) => {
      this.client.set(c);
      this.form.name = c.name;
      this.form.tier = c.tier;
      this.form.packageId = c.packageId || c.package?._id || '';
      this.form.url = c.url;
      this.form.logoUrl = c.logoUrl || '';
      this.form.industry = c.industry || '';
      this.form.hoursPerCycle = c.hoursPerCycle ?? 0;
      this.form.active = c.active ?? true;
      this.form.isEcommerce = !!c.isEcommerce;
      this.form.websitePlatform = (c.websitePlatform as '' | 'shopify' | 'wordpress' | 'custom') || '';
    });
  }

  saveData() {
    const c = this.client();
    if (!c?._id) return;
    const name = this.form.name?.trim();
    if (!name) {
      this.dataError.set('Client name is required.');
      return;
    }
    this.dataError.set(null);
    this.dataSaved.set(false);
    this.savingData.set(true);
    const trimmedLogo = this.form.logoUrl?.trim();
    this.svc
      .update(c._id, {
        name,
        packageId: this.form.packageId || undefined,
        url: this.form.url?.trim(),
        logoUrl: trimmedLogo || undefined,
        industry: this.form.industry?.trim() || undefined,
        hoursPerCycle: Number(this.form.hoursPerCycle) || 0,
        active: !!this.form.active,
        isEcommerce: !!this.form.isEcommerce,
        websitePlatform: this.form.websitePlatform || undefined,
        calendarAliases: this.form.calendarAliases.filter((a) => a.trim()),
        // Send null (not undefined) when cleared so Mongoose actually
        // wipes the field instead of leaving the old date in place.
        endingDate: this.form.endingDate
          ? (new Date(`${this.form.endingDate}T00:00:00Z`) as unknown as Date)
          : (null as unknown as Date | undefined),
      })
      .subscribe({
        next: (u) => {
          this.client.set(u);
          this.form.logoUrl = u.logoUrl || '';
          this.savingData.set(false);
          this.dataSaved.set(true);
          // Close the modal shortly after the user sees the confirmation
          setTimeout(() => {
            this.dataSaved.set(false);
            this.editOpen.set(false);
          }, 1000);
        },
        error: (err) => {
          this.savingData.set(false);
          const msg = err?.error?.message;
          this.dataError.set(
            Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save the client.',
          );
        },
      });
  }
}
