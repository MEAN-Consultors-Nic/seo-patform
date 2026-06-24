import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Client } from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
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

interface TabDef {
  key: TabKey;
  label: string;
}

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
                <span [class]="'tier-' + c.tier">{{ c.tier }}</span>
                <span class="text-xs text-ink-500">{{ c.hoursPerCycle }} h / cycle</span>
                <span class="text-xs text-ink-300 hidden sm:inline">·</span>
                <a [href]="c.url" target="_blank" class="text-xs text-sky-500 hover:underline truncate max-w-[200px] sm:max-w-none">{{ c.url }}</a>
                <app-domain-info-button [url]="c.url" />
                <app-schema-modeler-button [url]="c.url" />
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

        <nav class="tab-bar mb-6 items-stretch gap-0 relative">
          <!-- Scrollable tab list — wide tab strips scroll horizontally on
               mobile. The More dropdown lives OUTSIDE this scroll context
               so it isn't clipped by overflow:auto. -->
          <div class="tab-bar-scroll flex-1 min-w-0">
            @for (t of primaryTabs(); track t.key) {
              <button
                (click)="activeTab.set(t.key)"
                [class]="'tab ' + (activeTab() === t.key ? 'tab-active' : '')">
                {{ t.label }}
              </button>
            }
          </div>
          @if (overflowTabs.length) {
            <div class="relative flex-shrink-0">
              <button
                type="button"
                (click)="toggleMore($event)"
                [class]="'tab inline-flex items-center gap-1 ' + (activeIsInOverflow() ? 'tab-active' : '')">
                {{ moreLabel() }}
                <span class="text-[10px] leading-none">▾</span>
              </button>
              @if (moreOpen()) {
                <div
                  class="absolute right-0 top-full mt-1 bg-white border border-ink-200 rounded-lg shadow-lg py-1 min-w-[180px] z-30"
                  (click)="$event.stopPropagation()">
                  @for (t of overflowTabs; track t.key) {
                    <button
                      type="button"
                      (click)="selectOverflow(t.key)"
                      [class]="'w-full text-left px-3 py-1.5 text-sm hover:bg-ink-50 ' + (activeTab() === t.key ? 'text-coral-600 font-semibold' : 'text-ink-700')">
                      {{ t.label }}
                    </button>
                  }
                </div>
              }
            </div>
          }
        </nav>

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
            <app-client-tasks-tab [clientId]="c._id!" [assignedHours]="c.hoursPerCycle" />
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
                  <label class="label">Tier</label>
                  <select class="input" [(ngModel)]="form.tier">
                    <option value="A">Tier A</option>
                    <option value="B">Tier B</option>
                    <option value="C">Tier C</option>
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

  client = signal<Client | null>(null);
  activeTab = signal<TabKey>('tasks');
  logoPreviewOk = signal<boolean | null>(null);

  primaryTabs = computed<TabDef[]>(() => {
    const base: TabDef[] = [
      { key: 'tasks', label: 'Tasks' },
      { key: 'content', label: 'Content' },
      { key: 'keywords', label: 'Keywords' },
      { key: 'positions', label: 'Position Tracker' },
      { key: 'competitors', label: 'Competitors' },
      { key: 'backlinks', label: 'Backlinks' },
      { key: 'kpis', label: 'KPI History' },
      { key: 'gsc-insights', label: 'GSC Insights' },
      { key: 'indexing', label: 'Indexing' },
      { key: 'cannibalization', label: 'Cannibalization' },
    ];
    const c = this.client();
    if (c?.isEcommerce) {
      base.push({ key: 'ecommerce', label: '🛒 Ecommerce' });
    }
    // Platform-specific tab appears based on the websitePlatform field. We
    // also fall back to the legacy `isEcommerce` flag so existing ecommerce
    // clients still see the Shopify tab without needing to set the platform.
    if (
      c?.websitePlatform === 'shopify' ||
      (!c?.websitePlatform && c?.isEcommerce)
    ) {
      base.push({ key: 'shopify', label: '🛍️ Shopify' });
    } else if (c?.websitePlatform === 'wordpress') {
      base.push({ key: 'wordpress', label: '📝 WordPress' });
    }
    return base;
  });

  overflowTabs: TabDef[] = [
    { key: 'service-areas', label: 'Service Areas' },
    { key: 'knowledge', label: 'Knowledge' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'access', label: 'Credentials' },
    { key: 'integrations', label: 'Integrations' },
  ];

  moreOpen = signal(false);

  activeIsInOverflow(): boolean {
    return this.overflowTabs.some((t) => t.key === this.activeTab());
  }

  moreLabel(): string {
    const active = this.overflowTabs.find((t) => t.key === this.activeTab());
    return active ? active.label : 'More';
  }

  toggleMore(ev: MouseEvent) {
    ev.stopPropagation();
    this.moreOpen.update((v) => !v);
  }

  selectOverflow(key: TabKey) {
    this.activeTab.set(key);
    this.moreOpen.set(false);
  }

  @HostListener('document:click')
  onDocClick() {
    if (this.moreOpen()) this.moreOpen.set(false);
  }

  form: {
    name: string;
    tier: 'A' | 'B' | 'C';
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
        tier: this.form.tier,
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
