import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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

type TabKey =
  | 'data'
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
  | 'integrations';

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
          <a [routerLink]="['/reports']" [queryParams]="{ clientId: c._id }" class="btn-primary">
            Generate report
          </a>
        </header>

        <nav class="tab-bar mb-6 overflow-x-auto">
          @for (t of tabs; track t.key) {
            <button
              (click)="activeTab.set(t.key)"
              [class]="'tab whitespace-nowrap ' + (activeTab() === t.key ? 'tab-active' : '')">
              {{ t.label }}
            </button>
          }
        </nav>

        @switch (activeTab()) {
          @case ('data') {
            <div class="card max-w-2xl">
              <h2 class="text-base font-semibold text-ink-900 mb-4">Client details</h2>
              <div class="space-y-3 text-sm">
                <div>
                  <label class="label">URL</label>
                  <input class="input" [(ngModel)]="form.url" />
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
                  <input class="input" [(ngModel)]="form.industry" />
                </div>
                <button class="btn-primary mt-3" (click)="saveData()">Save</button>
              </div>
            </div>
          }
          @case ('access') {
            <div class="card max-w-2xl">
              <h2 class="text-base font-semibold text-ink-900 mb-3">Confirmed access</h2>
              <div class="grid grid-cols-2 gap-2 text-sm">
                @for (key of accessKeys; track key) {
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" [(ngModel)]="accessState[key]" class="rounded" />
                    <span class="uppercase text-xs font-semibold text-ink-700">{{ key }}</span>
                  </label>
                }
              </div>
              <div class="mt-4">
                <label class="label">Access notes</label>
                <textarea class="input" rows="3" [(ngModel)]="accessNotes"></textarea>
              </div>
              <button class="btn-primary mt-3" (click)="saveAccess()">Save access</button>
            </div>
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
        }
      </div>
    }
  `,
})
export class ClientDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(ClientsService);

  client = signal<Client | null>(null);
  activeTab = signal<TabKey>('tasks');
  logoPreviewOk = signal<boolean | null>(null);

  tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'tasks', label: 'Tasks' },
    { key: 'content', label: 'Content' },
    { key: 'keywords', label: 'Keywords' },
    { key: 'positions', label: 'Position Tracker' },
    { key: 'competitors', label: 'Competitors' },
    { key: 'backlinks', label: 'Backlinks' },
    { key: 'kpis', label: 'KPI History' },
    { key: 'knowledge', label: 'Knowledge' },
    { key: 'contacts', label: 'Contacts' },
    { key: 'access', label: 'Access' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'data', label: 'Details' },
  ];

  form: { url: string; logoUrl: string; industry: string } = {
    url: '',
    logoUrl: '',
    industry: '',
  };
  accessKeys = ['gsc', 'ga4', 'gbp', 'cms', 'ahrefs', 'semrush'] as const;
  accessState: Record<string, boolean> = {};
  accessNotes = '';

  ngOnInit() {
    this.reload();
  }

  reload() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.svc.get(id).subscribe((c) => {
      this.client.set(c);
      this.form.url = c.url;
      this.form.logoUrl = c.logoUrl || '';
      this.form.industry = c.industry || '';
      this.accessKeys.forEach((k) => (this.accessState[k] = !!c.access?.[k]));
      this.accessNotes = c.access?.notes || '';
    });
  }

  saveData() {
    const c = this.client();
    if (!c?._id) return;
    const trimmedLogo = this.form.logoUrl?.trim();
    this.svc
      .update(c._id, {
        url: this.form.url?.trim(),
        logoUrl: trimmedLogo || undefined,
        industry: this.form.industry?.trim(),
      })
      .subscribe((u) => {
        this.client.set(u);
        this.form.logoUrl = u.logoUrl || '';
      });
  }

  saveAccess() {
    const c = this.client();
    if (!c?._id) return;
    this.svc
      .update(c._id, {
        access: { ...c.access, ...this.accessState, notes: this.accessNotes },
      })
      .subscribe((u) => this.client.set(u));
  }
}
