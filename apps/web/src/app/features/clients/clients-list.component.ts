import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClientTier, ReportKpis } from '@seo/shared';
import { ClientsService, ClientWithStats } from '../../core/clients.service';
import { AuthService } from '../../core/auth.service';
import { GoogleIntegrationsService } from '../../core/google-integrations.service';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type KpiFieldKey = keyof ReportKpis;

interface KpiField {
  key: KpiFieldKey;
  label: string;
  hint?: string;
  step?: number;
}

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Clients</h1>
          <p class="page-subtitle">{{ clients().length }} active accounts</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex bg-white border border-ink-200 rounded-md p-0.5">
            @for (t of tierOptions; track t.value) {
              <button
                (click)="setTier(t.value)"
                [class]="'px-2.5 sm:px-3 py-1 text-xs font-semibold rounded transition ' +
                  (tierFilter() === t.value ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')">
                {{ t.label }}
              </button>
            }
          </div>
          <a routerLink="/clients/new" class="btn-primary text-xs sm:text-sm">+ New client</a>
        </div>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        @for (c of clients(); track c._id) {
          <article (click)="open(c._id!)"
                   class="bg-white rounded-lg border border-ink-200 shadow-card hover:shadow-elevated hover:border-brand-500/30 transition-all cursor-pointer overflow-hidden group">
            <!-- Header -->
            <div class="p-4 border-b border-ink-100">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  @if (c.logoUrl) {
                    <img [src]="c.logoUrl" [alt]="c.name"
                         class="w-10 h-10 rounded-md object-contain bg-white border border-ink-200 flex-shrink-0" />
                  } @else {
                    <div class="w-10 h-10 rounded-md bg-ink-100 border border-ink-200 flex items-center justify-center text-sm font-bold text-ink-500 flex-shrink-0">
                      {{ c.name.charAt(0) }}
                    </div>
                  }
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-ink-900 truncate group-hover:text-brand-600 transition-colors">
                      {{ c.name }}
                    </h3>
                    <a [href]="c.url" target="_blank" (click)="$event.stopPropagation()"
                       class="text-xs text-ink-500 truncate block hover:text-sky-500 hover:underline">
                      {{ shortUrl(c.url) }}
                    </a>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span [class]="'tier-' + c.tier">{{ c.tier }}</span>
                  <div class="relative">
                    <button type="button"
                            (click)="toggleMenu(c._id!, $event)"
                            [class.bg-ink-100]="menuOpenId() === c._id"
                            class="w-7 h-7 rounded-md flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition"
                            aria-label="Client options">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="8" cy="3" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="8" cy="13" r="1.5" />
                      </svg>
                    </button>
                    @if (menuOpenId() === c._id) {
                      <div (click)="$event.stopPropagation()"
                           class="absolute right-0 top-8 z-20 w-52 bg-white border border-ink-200 rounded-md shadow-elevated py-1 text-sm">
                        <button type="button"
                                (click)="openKpisModal(c)"
                                class="w-full text-left px-3 py-2 hover:bg-ink-50 text-ink-700 flex items-center gap-2">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M2 13V8M6 13V4M10 13V9M14 13V6" stroke-linecap="round" />
                          </svg>
                          Set Initial KPIs
                        </button>
                      </div>
                    }
                  </div>
                </div>
              </div>
              @if (auth.isManager() && ownerName(c); as on) {
                <div class="mt-2.5 flex items-center gap-1.5 text-[10px] text-ink-500">
                  <span class="w-4 h-4 rounded-full bg-ink-100 flex items-center justify-center text-[8px] font-bold text-ink-600">
                    {{ on.charAt(0).toUpperCase() }}
                  </span>
                  <span>Owner: <span class="font-semibold text-ink-700">{{ on }}</span></span>
                </div>
              }
            </div>

            <!-- KPI grid -->
            <div class="grid grid-cols-4 divide-x divide-ink-100 border-b border-ink-100">
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Keywords</div>
                <div class="text-base font-bold text-ink-900 mt-0.5">{{ c.stats.keywords.total }}</div>
              </div>
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Top 10</div>
                <div class="text-base font-bold text-positive-500 mt-0.5">{{ c.stats.keywords.top10 }}</div>
              </div>
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Avg pos.</div>
                <div class="text-base font-bold text-ink-900 mt-0.5">
                  {{ c.stats.keywords.avgPosition !== null ? (c.stats.keywords.avgPosition | number: '1.1-1') : '—' }}
                </div>
              </div>
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Backlinks</div>
                <div class="text-base font-bold text-ink-900 mt-0.5">{{ c.stats.backlinks }}</div>
              </div>
            </div>

            <!-- Movements -->
            @if (c.stats.keywords.gainers || c.stats.keywords.losers) {
              <div class="px-4 py-2 border-b border-ink-100 flex items-center gap-3 text-xs">
                <span class="text-positive-500 font-semibold">▲ {{ c.stats.keywords.gainers }}</span>
                <span class="text-danger-500 font-semibold">▼ {{ c.stats.keywords.losers }}</span>
                <span class="text-ink-400">position changes this cycle</span>
              </div>
            }

            <!-- Cycle progress -->
            <div class="p-4">
              <div class="flex items-center justify-between mb-1.5">
                <div class="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">
                  Current cycle
                </div>
                <div class="text-xs">
                  <span class="font-bold" [ngClass]="hoursTextColor(c.stats.currentCycleHours.pct)">
                    {{ c.stats.currentCycleHours.actual }} / {{ c.stats.currentCycleHours.assigned }}h
                  </span>
                  <span class="text-ink-400 ml-1">({{ c.stats.currentCycleHours.pct }}%)</span>
                </div>
              </div>
              <div class="h-1.5 bg-ink-100 rounded-full overflow-hidden mb-3">
                <div class="h-full rounded-full transition-all"
                     [ngClass]="hoursBarColor(c.stats.currentCycleHours.pct)"
                     [style.width.%]="Math.min(c.stats.currentCycleHours.pct, 100)"></div>
              </div>
              <div class="flex items-center justify-between text-xs">
                <div class="text-ink-500">
                  <span class="font-semibold text-ink-900">{{ c.stats.currentCycleTasks.completed }}</span>
                  /
                  <span>{{ c.stats.currentCycleTasks.total }}</span>
                  tasks completed
                </div>
                <span class="text-brand-500 font-medium group-hover:translate-x-0.5 transition-transform">
                  Open →
                </span>
              </div>
            </div>
          </article>
        }
        @if (!clients().length) {
          <div class="col-span-full card text-center py-12 text-ink-400 italic">
            No clients to display
          </div>
        }
      </div>

      <!-- Set Initial KPIs modal -->
      @if (kpisModalClient(); as kc) {
        <div class="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
             (click)="closeKpisModal()">
          <div class="bg-white sm:rounded-lg rounded-t-xl shadow-xl w-full max-w-2xl p-4 sm:p-6 max-h-[95vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between mb-1">
              <div>
                <h2 class="text-lg font-bold text-ink-900">Set Initial KPIs</h2>
                <p class="text-xs text-ink-500 mt-0.5">
                  Baseline metrics for <span class="font-semibold text-ink-700">{{ kc.name }}</span>.
                  Used as the comparison point for future reports.
                </p>
              </div>
              <button type="button" (click)="closeKpisModal()"
                      class="w-8 h-8 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition flex items-center justify-center"
                      aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
                </svg>
              </button>
            </div>

            <!-- Auto-fetch from Google -->
            <div class="mt-4 p-3 rounded-md border border-ink-200 bg-ink-50/50">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-ink-900">
                    ⚡ Auto-fetch from Google
                  </div>
                  <p class="text-[11px] text-ink-500 mt-0.5">
                    Pull GSC + GA4 metrics for the chosen range. GBP fields
                    stay manual.
                  </p>
                </div>
                <div class="flex items-end gap-2 flex-wrap">
                  <select class="input input-sm text-xs" [ngModel]="autoFetchPreset()"
                          (ngModelChange)="setAutoFetchPreset($event)">
                    <option value="last28">Last 28 days</option>
                    <option value="last90">Last 90 days</option>
                    <option value="last180">Last 180 days</option>
                    <option value="last365">Last 365 days</option>
                    <option value="custom">Custom</option>
                  </select>
                  @if (autoFetchPreset() === 'custom') {
                    <input type="date" class="input input-sm text-xs" [(ngModel)]="autoFetchFrom" />
                    <input type="date" class="input input-sm text-xs" [(ngModel)]="autoFetchTo" />
                  }
                  <button class="btn-primary text-xs"
                          (click)="fetchBaselineFromGoogle()"
                          [disabled]="autoFetching()">
                    {{ autoFetching() ? 'Fetching…' : '⚡ Fetch' }}
                  </button>
                </div>
              </div>
              @if (autoFetchWarnings().length) {
                <div class="mt-2 text-[11px] text-warning-500">
                  @for (w of autoFetchWarnings(); track w) {
                    <div>⚠ {{ w }}</div>
                  }
                </div>
              }
              @if (autoFetchSummary()) {
                <div class="mt-2 text-[11px] text-positive-500">
                  ✓ {{ autoFetchSummary() }}
                </div>
              }
            </div>

            <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 max-h-[55vh] overflow-y-auto pr-1">
              @for (f of kpiFields; track f.key) {
                <div>
                  <label class="label flex items-center justify-between">
                    <span>{{ f.label }}</span>
                    @if (f.hint) {
                      <span class="text-[10px] font-normal text-ink-400">{{ f.hint }}</span>
                    }
                  </label>
                  <input class="input"
                         type="number"
                         [step]="f.step ?? 1"
                         min="0"
                         [(ngModel)]="kpisForm[f.key]"
                         [placeholder]="'0'" />
                </div>
              }
            </div>

            @if (kpisError()) {
              <div class="mt-3 text-xs text-danger-500">{{ kpisError() }}</div>
            }

            <div class="flex items-center justify-between mt-6 pt-4 border-t border-ink-100">
              <p class="text-[11px] text-ink-400">
                Leave a field empty to keep it unset.
              </p>
              <div class="flex gap-2">
                <button class="btn-secondary" (click)="closeKpisModal()">Cancel</button>
                <button class="btn-primary" (click)="saveKpis()" [disabled]="kpisSubmitting()">
                  {{ kpisSubmitting() ? 'Saving…' : 'Save baseline' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ClientsListComponent implements OnInit {
  private svc = inject(ClientsService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  clients = signal<ClientWithStats[]>([]);
  tierFilter = signal<ClientTier | ''>('');
  menuOpenId = signal<string | null>(null);
  kpisModalClient = signal<ClientWithStats | null>(null);
  kpisForm: Partial<Record<KpiFieldKey, number | null>> = {};
  kpisSubmitting = signal(false);
  kpisError = signal<string | null>(null);

  // Auto-fetch from Google state
  private google = inject(GoogleIntegrationsService);
  autoFetchPreset = signal<'last28' | 'last90' | 'last180' | 'last365' | 'custom'>('last90');
  autoFetchFrom = daysAgoIso(90);
  autoFetchTo = todayIso();
  autoFetching = signal(false);
  autoFetchWarnings = signal<string[]>([]);
  autoFetchSummary = signal<string | null>(null);
  Math = Math;

  kpiFields: KpiField[] = [
    { key: 'organicSessions', label: 'Organic sessions', hint: 'GA4' },
    { key: 'newUsers', label: 'New users', hint: 'GA4' },
    { key: 'engagementRate', label: 'Engagement rate (%)', hint: 'GA4', step: 0.01 },
    { key: 'avgEngagementTime', label: 'Avg engagement time (s)', hint: 'GA4', step: 0.1 },
    { key: 'conversionRate', label: 'Conversion rate (%)', hint: 'GA4', step: 0.01 },
    { key: 'impressions', label: 'Impressions', hint: 'GSC' },
    { key: 'clicks', label: 'Clicks', hint: 'GSC' },
    { key: 'ctr', label: 'CTR (%)', hint: 'GSC', step: 0.01 },
    { key: 'avgPosition', label: 'Avg. position', hint: 'GSC', step: 0.1 },
    { key: 'conversions', label: 'Conversions', hint: 'GA4' },
    { key: 'indexedPages', label: 'Indexed pages' },
    { key: 'nonIndexedPages', label: 'Non-indexed pages' },
    { key: 'gbpSearches', label: 'GBP searches' },
    { key: 'gbpCalls', label: 'GBP calls' },
    { key: 'gbpDirections', label: 'GBP direction requests' },
    { key: 'gbpWebsiteClicks', label: 'GBP website clicks' },
    { key: 'gbpReviews', label: 'GBP reviews' },
  ];

  ownerName(c: ClientWithStats): string | null {
    const o = c.ownerId;
    if (!o) return null;
    if (typeof o === 'object' && 'name' in o) return o.name;
    return null;
  }

  tierOptions: Array<{ value: ClientTier | ''; label: string }> = [
    { value: '', label: 'All' },
    { value: 'A', label: 'A' },
    { value: 'B', label: 'B' },
    { value: 'C', label: 'C' },
  ];

  ngOnInit() {
    this.load();
  }

  setTier(t: ClientTier | '') {
    this.tierFilter.set(t);
    this.load();
  }

  load() {
    const filters = this.tierFilter() ? { tier: this.tierFilter() as ClientTier } : {};
    this.svc.listWithStats(filters).subscribe((cs) => this.clients.set(cs));
  }

  open(id: string) {
    if (this.menuOpenId() || this.kpisModalClient()) return;
    this.router.navigate(['/clients', id]);
  }

  toggleMenu(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.menuOpenId.set(this.menuOpenId() === id ? null : id);
  }

  @HostListener('document:click')
  closeMenuOnOutsideClick() {
    if (this.menuOpenId()) this.menuOpenId.set(null);
  }

  @HostListener('document:keydown.escape')
  closeOnEscape() {
    if (this.kpisModalClient()) {
      this.closeKpisModal();
    } else if (this.menuOpenId()) {
      this.menuOpenId.set(null);
    }
  }

  openKpisModal(c: ClientWithStats) {
    this.menuOpenId.set(null);
    this.kpisError.set(null);
    const baseline = (c.baselineKpis ?? {}) as ReportKpis;
    this.kpisForm = {};
    for (const f of this.kpiFields) {
      const v = baseline[f.key];
      this.kpisForm[f.key] = typeof v === 'number' ? v : null;
    }
    // Reset auto-fetch UI to defaults so it doesn't bleed across clients.
    this.autoFetchPreset.set('last90');
    this.autoFetchFrom = daysAgoIso(90);
    this.autoFetchTo = todayIso();
    this.autoFetchWarnings.set([]);
    this.autoFetchSummary.set(null);
    this.kpisModalClient.set(c);
  }

  setAutoFetchPreset(
    p: 'last28' | 'last90' | 'last180' | 'last365' | 'custom',
  ) {
    this.autoFetchPreset.set(p);
    if (p === 'last28') {
      this.autoFetchFrom = daysAgoIso(28);
      this.autoFetchTo = todayIso();
    } else if (p === 'last90') {
      this.autoFetchFrom = daysAgoIso(90);
      this.autoFetchTo = todayIso();
    } else if (p === 'last180') {
      this.autoFetchFrom = daysAgoIso(180);
      this.autoFetchTo = todayIso();
    } else if (p === 'last365') {
      this.autoFetchFrom = daysAgoIso(365);
      this.autoFetchTo = todayIso();
    }
  }

  fetchBaselineFromGoogle() {
    const c = this.kpisModalClient();
    if (!c?._id) return;
    if (!this.autoFetchFrom || !this.autoFetchTo) {
      this.autoFetchWarnings.set(['Pick a from and to date.']);
      return;
    }
    this.autoFetching.set(true);
    this.autoFetchWarnings.set([]);
    this.autoFetchSummary.set(null);
    this.google
      .kpisForClient(c._id, this.autoFetchFrom, this.autoFetchTo)
      .subscribe({
        next: (r) => {
          // Merge: keep manual GBP values, overwrite GSC+GA4 with fresh data
          // even if the new value is 0 (so the user sees zeroed metrics).
          const filled: string[] = [];
          for (const f of this.kpiFields) {
            const v = (r.kpis as Record<string, unknown>)[f.key];
            if (typeof v === 'number') {
              this.kpisForm[f.key] = v;
              filled.push(f.label);
            }
          }
          this.autoFetching.set(false);
          this.autoFetchWarnings.set(r.sources?.warnings ?? []);
          const src: string[] = [];
          if (r.sources?.gsc) src.push('GSC');
          if (r.sources?.ga4) src.push('GA4');
          this.autoFetchSummary.set(
            `Filled ${filled.length} fields from ${src.join(' + ') || 'no sources'} (${this.autoFetchFrom} → ${this.autoFetchTo}).`,
          );
        },
        error: (err) => {
          this.autoFetching.set(false);
          const m = err?.error?.message;
          this.autoFetchWarnings.set([
            Array.isArray(m) ? m.join(', ') : m || 'Could not fetch KPIs.',
          ]);
        },
      });
  }

  closeKpisModal() {
    this.kpisModalClient.set(null);
    this.kpisSubmitting.set(false);
    this.kpisError.set(null);
  }

  saveKpis() {
    const client = this.kpisModalClient();
    if (!client) return;

    const baselineKpis: ReportKpis = {};
    for (const f of this.kpiFields) {
      const raw = this.kpisForm[f.key];
      if (raw === null || raw === undefined || (raw as unknown as string) === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n)) baselineKpis[f.key] = n;
    }

    this.kpisSubmitting.set(true);
    this.kpisError.set(null);
    this.svc
      .update(client._id!, {
        baselineKpis,
        baselineDate: new Date(),
      })
      .subscribe({
        next: () => {
          this.closeKpisModal();
          this.load();
        },
        error: (err) => {
          this.kpisSubmitting.set(false);
          const msg = err?.error?.message;
          this.kpisError.set(
            Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save baseline. Try again.',
          );
        },
      });
  }

  shortUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  hoursTextColor(pct: number) {
    if (pct > 100) return 'text-danger-500';
    if (pct >= 80) return 'text-warning-500';
    if (pct >= 50) return 'text-positive-500';
    return 'text-ink-700';
  }

  hoursBarColor(pct: number) {
    if (pct > 100) return 'bg-danger-500';
    if (pct >= 80) return 'bg-warning-500';
    if (pct >= 50) return 'bg-positive-500';
    return 'bg-ink-300';
  }
}
