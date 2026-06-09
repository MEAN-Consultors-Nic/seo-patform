import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
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
import { ClientAccessTab } from './tabs/access-tab.component';

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
  | 'service-areas';

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
    ClientServiceAreasTab,
    ClientAccessTab,
  ],
  template: `
    @if (client(); as c) {
      <div class="page-container">
        <a routerLink="/clients" class="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
          ← Back to clients
        </a>

        <header class="flex items-start justify-between mt-3 mb-6">
          <div class="flex items-center gap-4">
            @if (c.logoUrl) {
              <img [src]="c.logoUrl" [alt]="c.name"
                   class="w-14 h-14 rounded-lg object-contain bg-white border border-ink-200 shadow-sm" />
            } @else {
              <div class="w-14 h-14 rounded-lg bg-ink-100 border border-ink-200 flex items-center justify-center text-xl text-ink-500 font-bold">
                {{ c.name.charAt(0) }}
              </div>
            }
            <div>
              <h1 class="text-2xl font-bold text-ink-900">{{ c.name }}</h1>
              <div class="flex items-center gap-2 mt-1">
                <span [class]="'tier-' + c.tier">{{ c.tier }}</span>
                <span class="text-xs text-ink-500">{{ c.hoursPerCycle }} h / cycle</span>
                <span class="text-xs text-ink-300">·</span>
                <a [href]="c.url" target="_blank" class="text-xs text-sky-500 hover:underline">{{ c.url }}</a>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn-secondary" (click)="openEdit()">
              ✏ Edit client
            </button>
            <a [routerLink]="['/reports']" [queryParams]="{ clientId: c._id }" class="btn-primary">
              Generate report
            </a>
          </div>
        </header>

        <nav class="tab-bar mb-6 flex items-center gap-0 relative">
          @for (t of primaryTabs; track t.key) {
            <button
              (click)="activeTab.set(t.key)"
              [class]="'tab whitespace-nowrap ' + (activeTab() === t.key ? 'tab-active' : '')">
              {{ t.label }}
            </button>
          }
          @if (overflowTabs.length) {
            <div class="relative">
              <button
                type="button"
                (click)="toggleMore($event)"
                [class]="'tab whitespace-nowrap inline-flex items-center gap-1 ' + (activeIsInOverflow() ? 'tab-active' : '')">
                {{ moreLabel() }}
                <span class="text-[10px] leading-none">▾</span>
              </button>
              @if (moreOpen()) {
                <div
                  class="absolute right-0 top-full mt-1 bg-white border border-ink-200 rounded-lg shadow-lg py-1 min-w-[180px] z-20"
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
          @case ('service-areas') {
            <app-client-service-areas-tab [client]="c" />
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
              </div>
              <div>
                <label class="label">URL</label>
                <input class="input" [(ngModel)]="form.url" placeholder="https://example.com" />
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

  primaryTabs: TabDef[] = [
    { key: 'tasks', label: 'Tasks' },
    { key: 'content', label: 'Content' },
    { key: 'keywords', label: 'Keywords' },
    { key: 'positions', label: 'Position Tracker' },
    { key: 'competitors', label: 'Competitors' },
    { key: 'backlinks', label: 'Backlinks' },
    { key: 'kpis', label: 'KPI History' },
    { key: 'gsc-insights', label: 'GSC Insights' },
  ];

  overflowTabs: TabDef[] = [
    { key: 'service-areas', label: 'Service Areas' },
    { key: 'knowledge', label: 'Knowledge' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'access', label: 'Access & Credentials' },
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
  } = {
    name: '',
    tier: 'C',
    url: '',
    logoUrl: '',
    industry: '',
    hoursPerCycle: 0,
    active: true,
  };
  editOpen = signal(false);
  savingData = signal(false);
  dataError = signal<string | null>(null);
  dataSaved = signal(false);

  ngOnInit() {
    this.reload();
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
