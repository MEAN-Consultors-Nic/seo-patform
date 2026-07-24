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
  RecheckAllResult,
  RequestIndexingResult,
} from '../../../core/indexing.service';

type StatusFilter = 'all' | 'indexed' | 'not_indexed' | 'orphan';

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
        <div class="flex items-center gap-2 whitespace-nowrap">
          <button class="btn-secondary text-sm"
                  [disabled]="pulling() || rechecking()"
                  title="Send a URL to Google's Indexing API — useful for pages the sitemap hasn't picked up yet."
                  (click)="openRequestIndexingModal()">
            🚀 Indexing Request
          </button>
          <button class="btn-secondary text-sm"
                  [disabled]="pulling() || rechecking()"
                  title="Re-inspect the URLs already tracked without re-scanning the sitemap. Faster than a full pull; only refreshes existing rows."
                  (click)="runRecheckAll()">
            {{ rechecking() ? 'Rechecking…' : '🔄 Recheck all' }}
          </button>
          <button class="btn-primary text-sm"
                  [disabled]="pulling() || rechecking()"
                  (click)="runPull()">
            {{ pulling() ? 'Pulling…' : '📥 Pull indexing status' }}
          </button>
        </div>
      </div>

      <!-- Indexing Request modal. Ad-hoc entry point that skips the
           per-row menu — the user pastes any URL (usually one they
           just published that isn't tracked yet), fires the Indexing
           API, and sees the outcome inline. Closing the modal keeps
           the result signal so a second submission overwrites it. -->
      @if (requestModalOpen()) {
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
             (click)="closeRequestIndexingModal()">
          <div class="w-full max-w-lg bg-white rounded-lg shadow-elevated border border-ink-200"
               (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between px-5 pt-5 pb-2">
              <div>
                <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider">
                  Google Search Console
                </div>
                <h3 class="text-base font-bold text-ink-900 mt-0.5">
                  Request indexing
                </h3>
                <div class="text-xs text-ink-500 mt-1">
                  Sends a <code class="text-[11px]">URL_UPDATED</code> notification via the Indexing API and re-inspects the URL.
                </div>
              </div>
              <button type="button"
                      class="text-ink-400 hover:text-ink-900 text-lg leading-none"
                      (click)="closeRequestIndexingModal()"
                      aria-label="Close">
                ×
              </button>
            </div>
            <div class="px-5 pb-5 space-y-3">
              <label class="block text-xs font-semibold text-ink-500 uppercase tracking-wider">
                URL
              </label>
              <input type="url"
                     class="input w-full"
                     placeholder="https://example.com/page-to-index"
                     [ngModel]="requestModalUrl()"
                     (ngModelChange)="requestModalUrl.set($event)"
                     [disabled]="requestModalBusy()"
                     (keydown.enter)="submitRequestIndexingModal()" />
              <div class="text-[11px] text-ink-500 leading-relaxed">
                Google's Indexing API officially supports only JobPosting and BroadcastEvent pages, but the endpoint usually accepts any URL on properties you own in Search Console.
              </div>

              @if (requestModalError(); as e) {
                <div class="border-l-4 border-danger-500 bg-danger-100/40 text-xs text-ink-700 px-3 py-2 rounded">
                  <div class="font-semibold text-danger-500 mb-0.5">Request failed</div>
                  {{ e }}
                </div>
              }

              @if (requestModalResult(); as r) {
                <div class="border-l-4 border-positive-500 bg-positive-100/30 text-xs text-ink-700 px-3 py-2 rounded space-y-1">
                  <div class="font-semibold text-positive-500">
                    ✓ Indexing notification accepted
                  </div>
                  @if (r.notifiedAt) {
                    <div>Notified at: <span class="font-mono text-[11px]">{{ r.notifiedAt | date: 'medium' }}</span></div>
                  }
                  @if (r.inspection; as ins) {
                    <div class="flex items-center gap-2 pt-1">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            [class]="statusPill(ins.verdict)">
                        <span class="w-1.5 h-1.5 rounded-full" [class]="statusDot(ins.verdict)"></span>
                        {{ statusLabel(ins.verdict) }}
                      </span>
                      @if (ins.coverageState) {
                        <span class="text-ink-500">{{ ins.coverageState }}</span>
                      }
                    </div>
                    @if (ins.lastCrawlTime) {
                      <div class="text-ink-500">Last crawl: {{ ins.lastCrawlTime | date: 'medium' }}</div>
                    }
                  } @else {
                    <div class="text-ink-500">Freshness inspection was skipped (no site URL configured).</div>
                  }
                  @if (r.warning) {
                    <div class="text-warning-500">⚠ {{ r.warning }}</div>
                  }
                </div>
              }
            </div>
            <div class="border-t border-ink-100 px-5 py-3 flex items-center justify-end gap-2">
              <button type="button"
                      class="btn-secondary text-sm"
                      [disabled]="requestModalBusy()"
                      (click)="closeRequestIndexingModal()">
                Close
              </button>
              <button type="button"
                      class="btn-primary text-sm"
                      [disabled]="requestModalBusy() || !requestModalUrl().trim()"
                      (click)="submitRequestIndexingModal()">
                {{ requestModalBusy() ? 'Requesting…' : 'Request Indexing' }}
              </button>
            </div>
          </div>
        </div>
      }

      @if (clipboardHint(); as msg) {
        <div class="card border-l-4 border-sky-500 bg-sky-100/40 text-sm py-2 px-3">
          📋 {{ msg }}
        </div>
      }

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

      <!-- Recheck-all result banner -->
      @if (recheckResult(); as r) {
        <div class="card border-l-4 border-sky-500 bg-sky-100/40 text-sm">
          <div class="font-semibold text-ink-900 mb-1">
            🔄 Rechecked {{ r.inspected }} URL(s) · {{ r.updated }} updated · {{ r.failed }} failed
          </div>
          <div class="text-xs text-ink-600">
            Took {{ (r.durationMs / 1000) | number: '1.1-1' }}s.
          </div>
          @if (r.quotaHit) {
            <div class="mt-2 text-xs text-warning-500">
              ⚠ URL Inspection quota hit — some rows may not have been refreshed. Try again later.
            </div>
          }
          <button class="text-[11px] text-ink-500 hover:text-ink-900 mt-2"
                  (click)="recheckResult.set(null)">
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
            <div class="text-[10px] text-ink-500 mt-0.5">includes "discovered" + "crawled"</div>
          </button>
          <button type="button" (click)="filter.set('orphan')"
                  [class]="'text-left rounded-lg border bg-white px-3 py-3 shadow-card hover:shadow-elevated transition ' +
                    (filter() === 'orphan' ? 'border-warning-500 ring-2 ring-warning-500/20' : 'border-ink-200')">
            <div class="text-[10px] uppercase tracking-wider font-semibold text-warning-500">🔗 Orphan</div>
            <div class="text-xl font-bold text-ink-900 mt-0.5">{{ s.orphan }}</div>
            <div class="text-[10px] text-ink-500 mt-0.5">0 referring URLs (no internal links)</div>
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

      <!-- Row-action progress banner. Fires when a single-URL action
           (Request indexing / Recheck status) is in flight so the
           user has a visible signal beyond the row spinner. -->
      @if (rowActionBusy(); as busy) {
        <div class="card border-l-4 border-brand-500 bg-brand-500/10 text-sm flex items-center gap-3 py-2 px-3">
          <svg class="animate-spin h-4 w-4 text-brand-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
            <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          </svg>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-ink-900">{{ busy.action }}…</div>
            <div class="text-xs text-ink-600 truncate">{{ busy.url }}</div>
          </div>
        </div>
      }

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
                <th class="text-right px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-ink-100" (click)="closeMenu()">
              @for (r of filteredRows(); track r.url) {
                <tr class="hover:bg-ink-50/50">
                  <td class="px-3 py-2 max-w-xs">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <a [href]="r.url" target="_blank" rel="noopener"
                         class="text-sky-600 hover:underline truncate block min-w-0 flex-1"
                         [title]="r.url">{{ r.url }}</a>
                      @if (r.isOrphan) {
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning-100 text-warning-500 text-[10px] font-semibold flex-shrink-0"
                              title="No internal links found pointing to this page (orphan candidate). GSC's URL Inspection returned zero referring URLs.">
                          🔗 Orphan
                        </span>
                      }
                    </div>
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
                  <td class="px-3 py-2 text-right relative">
                    <button type="button"
                            (click)="toggleMenu(r.url, $event)"
                            [class.bg-ink-100]="menuOpenUrl() === r.url"
                            [disabled]="rowBusy(r.url)"
                            class="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition disabled:opacity-100 disabled:cursor-progress"
                            [attr.aria-label]="rowBusy(r.url) ? 'Working…' : 'URL actions'"
                            [title]="rowBusy(r.url) ? rowBusyLabel(r.url) : ''">
                      @if (rowBusy(r.url)) {
                        <svg class="animate-spin h-4 w-4 text-brand-500"
                             viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="currentColor"
                                  stroke-width="3" opacity="0.25" />
                          <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor"
                                stroke-width="3" stroke-linecap="round" />
                        </svg>
                      } @else {
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="3" cy="8" r="1.5" />
                          <circle cx="8" cy="8" r="1.5" />
                          <circle cx="13" cy="8" r="1.5" />
                        </svg>
                      }
                    </button>
                    @if (menuOpenUrl() === r.url) {
                      <div (click)="$event.stopPropagation()"
                           class="absolute right-2 top-9 z-20 w-56 bg-white border border-ink-200 rounded-md shadow-elevated py-1 text-left">
                        <button type="button"
                                (click)="recheckUrl(r.url); closeMenu()"
                                [disabled]="rechckingUrl() === r.url"
                                class="w-full text-left px-3 py-2 hover:bg-ink-50 text-sm text-ink-700 flex items-start gap-2 disabled:opacity-50"
                                title="Re-inspects this URL via Google's URL Inspection API and updates the row in place — useful when GSC and the platform disagree on the current status.">
                          <span class="text-sky-500 mt-0.5">
                            {{ rechckingUrl() === r.url ? '…' : '⟳' }}
                          </span>
                          <span>
                            Recheck status
                            <div class="text-[10px] text-ink-500 leading-tight">
                              refreshes this row from GSC
                            </div>
                          </span>
                        </button>
                        <button type="button"
                                (click)="requestIndexing(r.url); closeMenu()"
                                [disabled]="requestingUrl() === r.url"
                                class="w-full text-left px-3 py-2 hover:bg-ink-50 text-sm text-ink-700 flex items-start gap-2 disabled:opacity-50"
                                title="Notifies Google's Indexing API and re-inspects the URL. Officially supported for JobPosting and BroadcastEvent pages only.">
                          <span class="text-positive-500 mt-0.5">
                            {{ requestingUrl() === r.url ? '…' : '↻' }}
                          </span>
                          <span>
                            Request indexing
                            <div class="text-[10px] text-ink-500 leading-tight">
                              notifies Google + refreshes status
                            </div>
                          </span>
                        </button>
                        <button type="button"
                                (click)="openPageSpeed(r.url); closeMenu()"
                                class="w-full text-left px-3 py-2 hover:bg-ink-50 text-sm text-ink-700 flex items-center gap-2">
                          <span class="text-sky-500">⚡</span>
                          PageSpeed Insights
                        </button>
                        <button type="button"
                                (click)="openRichResults(r.url); closeMenu()"
                                class="w-full text-left px-3 py-2 hover:bg-ink-50 text-sm text-ink-700 flex items-center gap-2">
                          <span class="text-brand-500">★</span>
                          Rich Results Test
                        </button>
                      </div>
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
  /** GSC property url (e.g. https://mbglogistics.com/ or sc-domain:...).
   *  Used to deep-link into GSC URL Inspection for the right property. */
  @Input() gscSiteUrl?: string;

  rows = signal<PageIndexStatus[]>([]);
  summary = signal<IndexingSummary | null>(null);
  loading = signal(false);
  pulling = signal(false);
  pullResult = signal<PullResult | null>(null);
  rechecking = signal(false);
  recheckResult = signal<RecheckAllResult | null>(null);
  error = signal<string | null>(null);
  filter = signal<StatusFilter>('all');
  search = signal('');

  filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.rows().filter((r) => {
      if (f === 'indexed' && r.verdict !== 'PASS') return false;
      // 'Not indexed' bucket bundles FAIL (blocked / noindex / redirect)
      // with NEUTRAL (discovered-not-indexed, crawled-not-indexed) the
      // same way GSC does in its 'Why pages aren't indexed' report.
      if (
        f === 'not_indexed' &&
        r.verdict !== 'FAIL' &&
        r.verdict !== 'NEUTRAL'
      )
        return false;
      // 'Orphan' bucket: URLs Google reports as having zero referring
      // URLs (no internal links pointing at them). Strong signal that
      // the page needs link-equity from elsewhere on the site.
      if (f === 'orphan' && !r.isOrphan) return false;
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

  /**
   * Re-inspect every URL already tracked for this client without
   * re-fetching the sitemap / GSC catalog. Faster than a full pull
   * when the user only wants freshness on the rows they can already
   * see; used to confirm indexation changes after a batch of
   * request-indexing calls or a few hours after publishing.
   */
  runRecheckAll() {
    if (!this.clientId) return;
    this.rechecking.set(true);
    this.recheckResult.set(null);
    this.error.set(null);
    this.svc.recheckAll(this.clientId).subscribe({
      next: (res) => {
        this.recheckResult.set(res);
        this.rechecking.set(false);
        this.loadAll();
      },
      error: (err) => {
        this.rechecking.set(false);
        const raw =
          err?.error?.message || err?.message || err?.statusText || '';
        this.error.set(raw || 'Recheck failed.');
      },
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
        // Surface the upstream message verbatim — the backend now
        // returns specific text for the common failure modes (missing
        // gscSiteUrl, Google rejecting the site URL, OAuth expired,
        // quota hit). 'Failed to fetch' means the request itself
        // didn't reach the server, usually a timeout or a network
        // error; suggest the most likely cause.
        const raw =
          err?.error?.message ||
          err?.message ||
          err?.statusText ||
          '';
        if (
          raw === 'Failed to fetch' ||
          raw.includes('NetworkError') ||
          err?.status === 0
        ) {
          this.error.set(
            'Request timed out before the server could respond. The pull probably ran longer than Heroku allows; the inspection may still be running server-side. Refresh in a minute to see partial results.',
          );
        } else {
          this.error.set(raw || `Pull failed (HTTP ${err?.status || '?'})`);
        }
      },
    });
  }

  statusLabel(v: string): string {
    if (v === 'PASS') return 'Indexed';
    // Both FAIL and NEUTRAL render as 'Not indexed' to match how the
    // user thinks about it. The exact reason (Excluded by noindex,
    // Discovered - currently not indexed, etc.) sits in the next
    // column so the distinction isn't lost.
    if (v === 'FAIL' || v === 'NEUTRAL') return 'Not indexed';
    return 'Unknown';
  }

  statusPill(v: string): string {
    if (v === 'PASS') return 'bg-positive-100 text-positive-500';
    if (v === 'FAIL' || v === 'NEUTRAL') return 'bg-danger-100 text-danger-500';
    return 'bg-ink-100 text-ink-500';
  }

  statusDot(v: string): string {
    if (v === 'PASS') return 'bg-positive-500';
    if (v === 'FAIL' || v === 'NEUTRAL') return 'bg-danger-500';
    return 'bg-ink-400';
  }

  // --- Context menu (open external Google tools for one URL) -------------

  /**
   * One-click "Request indexing" via Google's Indexing API. The backend
   * publishes a URL_UPDATED notification and immediately re-inspects the
   * URL so the table row reflects the new state. No tabs opened, no
   * manual paste. Caveat shown in the menu subtext: Google officially
   * supports the Indexing API only for JobPosting / BroadcastEvent
   * pages — for anything else it usually works but isn't supported.
   */
  requestIndexing(url: string) {
    if (!this.clientId) return;
    this.requestingUrl.set(url);
    this.clipboardHint.set(null);
    this.error.set(null);
    this.svc.requestIndexing(this.clientId, url).subscribe({
      next: (res) => {
        this.requestingUrl.set(null);
        const verdict = res.inspection?.verdict;
        const verdictMsg = verdict
          ? ` Current verdict: ${this.statusLabel(verdict)}.`
          : '';
        this.clipboardHint.set(
          `✓ Indexing requested for ${url}.${verdictMsg}${res.warning ? ' ' + res.warning : ''}`,
        );
        setTimeout(() => this.clipboardHint.set(null), 8000);
        // Refresh the table so the row picks up the latest inspection.
        this.svc.list(this.clientId).subscribe((rows) => this.rows.set(rows));
      },
      error: (err) => {
        this.requestingUrl.set(null);
        this.error.set(
          err?.error?.message ||
            'Indexing request failed. Reconnect Google in Settings → Integrations to grant the indexing scope.',
        );
      },
    });
  }

  /**
   * Re-inspects ONE URL without touching the Indexing API. For when
   * the row's status looks stale (most often: GSC now says indexed
   * but the platform still shows discovered-not-indexed from the
   * last bulk pull). Updates the row in place and shows a brief
   * toast with the new verdict.
   */
  recheckUrl(url: string) {
    if (!this.clientId) return;
    this.rechckingUrl.set(url);
    this.clipboardHint.set(null);
    this.error.set(null);
    this.svc.recheckUrl(this.clientId, url).subscribe({
      next: (res) => {
        this.rechckingUrl.set(null);
        if (res.row) {
          this.rows.update((current) =>
            current.map((r) => (r.url === url ? res.row! : r)),
          );
          this.clipboardHint.set(
            `✓ Rechecked ${url}. Current verdict: ${this.statusLabel(res.row.verdict)}.`,
          );
          setTimeout(() => this.clipboardHint.set(null), 6000);
          // Re-pull the summary so the tile counts reflect the change.
          this.svc.summary(this.clientId).subscribe((s) => this.summary.set(s));
        }
      },
      error: (err) => {
        this.rechckingUrl.set(null);
        this.error.set(
          err?.error?.message || 'Could not recheck this URL.',
        );
      },
    });
  }

  openPageSpeed(url: string) {
    window.open(
      `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  openRichResults(url: string) {
    window.open(
      `https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  toggleMenu(url: string, ev: Event) {
    ev.stopPropagation();
    this.menuOpenUrl.set(this.menuOpenUrl() === url ? null : url);
  }

  closeMenu = () => this.menuOpenUrl.set(null);

  menuOpenUrl = signal<string | null>(null);
  /** Toast text shown after Request Indexing succeeds (or after a quick info hint). */
  clipboardHint = signal<string | null>(null);
  /** URL currently being submitted to the Indexing API — used to show a spinner. */
  requestingUrl = signal<string | null>(null);
  /** URL currently being re-inspected (Recheck status) — used to show a spinner. */
  rechckingUrl = signal<string | null>(null);

  /** True while either single-URL action is running against `url`. */
  rowBusy(url: string): boolean {
    return this.requestingUrl() === url || this.rechckingUrl() === url;
  }

  /** Tooltip on the ⋮ spinner while the row is busy. */
  rowBusyLabel(url: string): string {
    if (this.requestingUrl() === url) return 'Requesting indexing…';
    if (this.rechckingUrl() === url) return 'Rechecking status…';
    return '';
  }

  /**
   * Composite signal for the top-of-table progress banner. Returns
   * the URL + a human label whenever any single-URL action is in
   * flight, so the reader has an unmistakable "yes, something is
   * happening" cue even if the menu closed on click.
   */
  rowActionBusy = computed<{ action: string; url: string } | null>(() => {
    const req = this.requestingUrl();
    if (req) return { action: 'Requesting indexing', url: req };
    const rec = this.rechckingUrl();
    if (rec) return { action: 'Rechecking status', url: rec };
    return null;
  });

  // --- Ad-hoc "Indexing Request" modal ----------------------------------
  //
  // The per-row menu already exposes Request Indexing, but only for URLs
  // that are already tracked in this client's indexing table. The modal
  // covers the second case: a fresh URL the user just published that the
  // sitemap crawl hasn't picked up yet. Same backend endpoint underneath.

  requestModalOpen = signal(false);
  requestModalUrl = signal('');
  requestModalBusy = signal(false);
  requestModalResult = signal<RequestIndexingResult | null>(null);
  requestModalError = signal<string | null>(null);

  openRequestIndexingModal() {
    this.requestModalUrl.set('');
    this.requestModalResult.set(null);
    this.requestModalError.set(null);
    this.requestModalOpen.set(true);
  }

  closeRequestIndexingModal() {
    if (this.requestModalBusy()) return;
    this.requestModalOpen.set(false);
  }

  submitRequestIndexingModal() {
    if (!this.clientId) return;
    const url = this.requestModalUrl().trim();
    if (!url || this.requestModalBusy()) return;
    this.requestModalBusy.set(true);
    this.requestModalError.set(null);
    this.requestModalResult.set(null);
    this.svc.requestIndexing(this.clientId, url).subscribe({
      next: (res) => {
        this.requestModalBusy.set(false);
        this.requestModalResult.set(res);
        // The row may now exist (the backend upserts on inspection),
        // so refresh the table + summary in the background without
        // closing the modal — the user still wants to see the result.
        this.svc
          .list(this.clientId)
          .subscribe((rows) => this.rows.set(rows));
        this.svc
          .summary(this.clientId)
          .subscribe((s) => this.summary.set(s));
      },
      error: (err) => {
        this.requestModalBusy.set(false);
        this.requestModalError.set(
          err?.error?.message ||
            err?.message ||
            'Indexing request failed. Reconnect Google in Settings → Integrations if the indexing scope is missing.',
        );
      },
    });
  }
}
