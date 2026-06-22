import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IndexingService,
  IndexingSummary,
  PageIndexStatus,
  PullResult,
} from '../../../core/indexing.service';

type StatusFilter = 'all' | 'indexed' | 'not_indexed' | 'unknown';

@Component({
  selector: 'app-client-indexing-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="space-y-4">
      <!-- Toolbar -->
      <div class="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider">
            Indexing status
          </div>
          <h2 class="text-base font-bold text-ink-900 mt-0.5">
            Pages tracked via Google Search Console
          </h2>
          @if (summary(); as s) {
            <div class="text-xs text-ink-500 mt-1">
              @if (s.lastPulledAt) {
                Last pull · {{ s.lastPulledAt | date: 'medium' }}
              } @else {
                Never pulled — click the button to fetch indexing data.
              }
            </div>
          }
        </div>
        <button class="btn-primary text-sm whitespace-nowrap"
                [disabled]="pulling()"
                (click)="runPull()">
          {{ pulling() ? 'Pulling…' : '📥 Pull indexing status' }}
        </button>
      </div>

      <!-- Pull result banner -->
      @if (pullResult(); as r) {
        <div class="card border-l-4 border-positive-500 bg-positive-100/30 text-sm">
          <div class="font-semibold text-ink-900 mb-1">
            ✓ Pulled {{ r.inspected }} URL(s) · {{ r.upserted }} stored · {{ r.failed }} failed
          </div>
          <div class="text-xs text-ink-600">
            Took {{ (r.durationMs / 1000) | number: '1.1-1' }}s.
          </div>
          @if (r.warnings.length) {
            <ul class="mt-2 text-xs text-warning-500 list-disc pl-5">
              @for (w of r.warnings; track w) { <li>{{ w }}</li> }
            </ul>
          }
          <button class="text-[11px] text-ink-500 hover:text-ink-900 mt-2"
                  (click)="pullResult.set(null)">
            Dismiss
          </button>
        </div>
      }
      @if (error(); as e) {
        <div class="card border-l-4 border-danger-500 bg-danger-100/30 text-sm">
          <div class="font-semibold text-ink-900 mb-1">Pull failed</div>
          <div class="text-xs text-ink-600">{{ e }}</div>
          <button class="text-[11px] text-ink-500 hover:text-ink-900 mt-2"
                  (click)="error.set(null)">
            Dismiss
          </button>
        </div>
      }

      <!-- Summary tiles -->
      @if (summary(); as s) {
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <button type="button" (click)="filter.set('all')"
                  [class]="'text-left rounded-lg border bg-white px-3 py-3 shadow-card hover:shadow-elevated transition ' +
                    (filter() === 'all' ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-ink-200')">
            <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-500">Total</div>
            <div class="text-xl font-bold text-ink-900 mt-0.5">{{ s.total }}</div>
          </button>
          <button type="button" (click)="filter.set('indexed')"
                  [class]="'text-left rounded-lg border bg-white px-3 py-3 shadow-card hover:shadow-elevated transition ' +
                    (filter() === 'indexed' ? 'border-positive-500 ring-2 ring-positive-500/20' : 'border-ink-200')">
            <div class="text-[10px] uppercase tracking-wider font-semibold text-positive-500">Indexed</div>
            <div class="text-xl font-bold text-ink-900 mt-0.5">{{ s.indexed }}</div>
          </button>
          <button type="button" (click)="filter.set('not_indexed')"
                  [class]="'text-left rounded-lg border bg-white px-3 py-3 shadow-card hover:shadow-elevated transition ' +
                    (filter() === 'not_indexed' ? 'border-danger-500 ring-2 ring-danger-500/20' : 'border-ink-200')">
            <div class="text-[10px] uppercase tracking-wider font-semibold text-danger-500">Not indexed</div>
            <div class="text-xl font-bold text-ink-900 mt-0.5">{{ s.notIndexed }}</div>
          </button>
          <button type="button" (click)="filter.set('unknown')"
                  [class]="'text-left rounded-lg border bg-white px-3 py-3 shadow-card hover:shadow-elevated transition ' +
                    (filter() === 'unknown' ? 'border-ink-500 ring-2 ring-ink-500/20' : 'border-ink-200')">
            <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-500">Neutral / unknown</div>
            <div class="text-xl font-bold text-ink-900 mt-0.5">{{ s.neutral + s.unknown }}</div>
          </button>
          <div class="rounded-lg border border-brand-500/40 bg-brand-50 px-3 py-3">
            <div class="text-[10px] uppercase tracking-wider font-semibold text-brand-600">🆕 Newly indexed</div>
            <div class="text-xl font-bold text-brand-700 mt-0.5">{{ s.newlyIndexedSinceLastPull }}</div>
            <div class="text-[10px] text-ink-500 mt-0.5">since previous pull</div>
          </div>
        </div>
      }

      <!-- Reasons breakdown -->
      @if (summary()?.byReason?.length) {
        <div class="card">
          <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-500 mb-2">
            Why pages aren't indexed
          </div>
          <div class="flex flex-wrap gap-2">
            @for (r of summary()!.byReason; track r.coverageState) {
              <span class="inline-flex items-center gap-1.5 rounded-md bg-ink-100 px-2 py-1 text-xs">
                <span class="text-ink-700">{{ r.coverageState }}</span>
                <span class="font-bold text-ink-900">{{ r.count }}</span>
              </span>
            }
          </div>
        </div>
      }

      <!-- Search -->
      <div class="card">
        <input class="input" placeholder="Search URL…"
               [ngModel]="search()"
               (ngModelChange)="search.set($event)" />
      </div>

      <!-- Table -->
      @if (loading()) {
        <div class="card py-10 text-center text-ink-400 italic text-sm">Loading…</div>
      } @else if (!rows().length) {
        <div class="card py-10 text-center text-ink-400 italic text-sm">
          No indexing data yet. Click "Pull indexing status" to fetch from Search Console.
        </div>
      } @else if (!filteredRows().length) {
        <div class="card py-10 text-center text-ink-400 italic text-sm">
          No URLs match the current filter.
        </div>
      } @else {
        <div class="card overflow-x-auto p-0">
          <table class="min-w-full text-sm">
            <thead class="bg-ink-50 text-[10px] uppercase tracking-wider text-ink-500">
              <tr>
                <th class="text-left px-3 py-2">URL</th>
                <th class="text-left px-3 py-2 whitespace-nowrap">Status</th>
                <th class="text-left px-3 py-2">Reason</th>
                <th class="text-left px-3 py-2 whitespace-nowrap">Last crawl</th>
                <th class="text-left px-3 py-2 whitespace-nowrap">Canonical</th>
                <th class="text-left px-3 py-2 whitespace-nowrap">First indexed</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100">
              @for (r of filteredRows(); track r.url) {
                <tr class="hover:bg-ink-50/50">
                  <td class="px-3 py-2 max-w-xs">
                    <a [href]="r.url" target="_blank" rel="noopener"
                       class="text-sky-600 hover:underline truncate block"
                       [title]="r.url">{{ r.url }}</a>
                  </td>
                  <td class="px-3 py-2">
                    <span [class]="'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ' + statusPill(r.verdict)">
                      <span class="w-1.5 h-1.5 rounded-full" [ngClass]="statusDot(r.verdict)"></span>
                      {{ statusLabel(r.verdict) }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-xs text-ink-700">
                    {{ r.coverageState || '—' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-ink-600 whitespace-nowrap">
                    {{ r.lastCrawlTime ? (r.lastCrawlTime | date: 'mediumDate') : '—' }}
                  </td>
                  <td class="px-3 py-2 text-xs">
                    @if (r.canonicalMismatch) {
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning-100 text-warning-500 text-[10px] font-semibold"
                            [title]="'Google canonical: ' + (r.googleCanonical || '') + '\\nDeclared: ' + (r.userCanonical || '')">
                        ⚠ Mismatch
                      </span>
                    } @else if (r.googleCanonical) {
                      <span class="text-positive-500 text-[10px]">✓ matches</span>
                    } @else {
                      <span class="text-ink-400">—</span>
                    }
                  </td>
                  <td class="px-3 py-2 text-xs text-ink-600 whitespace-nowrap">
                    @if (r.firstIndexedAt) {
                      {{ r.firstIndexedAt | date: 'mediumDate' }}
                    } @else if (r.verdict === 'PASS') {
                      <span class="text-ink-400">unknown</span>
                    } @else {
                      —
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ClientIndexingTab implements OnChanges {
  private svc = inject(IndexingService);
  @Input({ required: true }) clientId!: string;

  rows = signal<PageIndexStatus[]>([]);
  summary = signal<IndexingSummary | null>(null);
  loading = signal(false);
  pulling = signal(false);
  pullResult = signal<PullResult | null>(null);
  error = signal<string | null>(null);
  filter = signal<StatusFilter>('all');
  search = signal('');

  filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.rows().filter((r) => {
      if (f === 'indexed' && r.verdict !== 'PASS') return false;
      if (f === 'not_indexed' && r.verdict !== 'FAIL') return false;
      if (f === 'unknown' && r.verdict !== 'NEUTRAL' && r.verdict !== 'VERDICT_UNSPECIFIED')
        return false;
      if (q && !r.url.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  ngOnChanges() {
    this.loadAll();
  }

  private loadAll() {
    if (!this.clientId) return;
    this.loading.set(true);
    this.svc.list(this.clientId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.svc.summary(this.clientId).subscribe({
      next: (s) => this.summary.set(s),
    });
  }

  runPull() {
    if (!this.clientId) return;
    this.pulling.set(true);
    this.pullResult.set(null);
    this.error.set(null);
    this.svc.pull(this.clientId).subscribe({
      next: (res) => {
        this.pullResult.set(res);
        this.pulling.set(false);
        this.loadAll();
      },
      error: (err) => {
        this.pulling.set(false);
        this.error.set(
          err?.error?.message ||
            'Could not pull indexing data. Check Google connection and that the client has gscSiteUrl configured.',
        );
      },
    });
  }

  statusLabel(v: string): string {
    if (v === 'PASS') return 'Indexed';
    if (v === 'FAIL') return 'Not indexed';
    if (v === 'NEUTRAL') return 'Neutral';
    return 'Unknown';
  }

  statusPill(v: string): string {
    if (v === 'PASS') return 'bg-positive-100 text-positive-500';
    if (v === 'FAIL') return 'bg-danger-100 text-danger-500';
    if (v === 'NEUTRAL') return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-500';
  }

  statusDot(v: string): string {
    if (v === 'PASS') return 'bg-positive-500';
    if (v === 'FAIL') return 'bg-danger-500';
    if (v === 'NEUTRAL') return 'bg-warning-500';
    return 'bg-ink-400';
  }
}
