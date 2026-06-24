import { CommonModule } from '@angular/common';
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
  CanonicalMismatchResponse,
  CannibalizationSeverity,
  CannibalizationService,
  CannibalizedQuery,
  InternalOverlapResponse,
  KeywordCannibalizationResponse,
} from '../../../core/cannibalization.service';

type SeverityFilter = 'all' | CannibalizationSeverity;

@Component({
  selector: 'app-client-cannibalization-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-5">
      <!-- ============ KEYWORD CANNIBALIZATION (GSC) ============ -->
      <section class="card">
        <header class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div class="min-w-0">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400">
              Keyword cannibalization (Google Search Console)
            </div>
            <h3 class="text-sm font-bold text-ink-900 mt-0.5">
              Queries where 2+ URLs from your site are competing
            </h3>
            @if (keywordPayload(); as p) {
              <p class="text-[11px] text-ink-500 mt-1">
                Window {{ p.startDate }} → {{ p.endDate }} ·
                Refreshed {{ p.refreshedAt | date: 'short' }}
              </p>
            }
          </div>
          <div class="flex items-center gap-2">
            <select class="input !py-1.5 !text-xs !w-auto"
                    [(ngModel)]="severityFilter">
              <option value="all">All severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <button class="btn-secondary text-xs"
                    [disabled]="loadingKeywords()"
                    (click)="refreshKeywords()">
              {{ loadingKeywords() ? 'Refreshing…' : '↻ Refresh' }}
            </button>
          </div>
        </header>

        @if (keywordError(); as e) {
          <div class="text-xs text-danger-500 bg-danger-100 border border-danger-500/30 rounded-md px-3 py-2 mb-3">
            {{ e }}
          </div>
        }

        @if (loadingKeywords() && !keywordPayload()) {
          <div class="py-8 text-center text-xs text-ink-500">
            Pulling fresh data from Google Search Console — first load can take a few seconds.
          </div>
        } @else if (keywordPayload(); as p) {
          <!-- Severity tiles -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div class="rounded-md border border-ink-200 p-2 bg-ink-50/40">
              <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400">Total</div>
              <div class="text-lg font-bold text-ink-900">{{ p.totalQueries }}</div>
            </div>
            <div class="rounded-md border border-danger-500/30 p-2 bg-danger-100/30">
              <div class="text-[10px] uppercase tracking-wider font-bold text-danger-700">High</div>
              <div class="text-lg font-bold text-danger-700">{{ p.bySeverity.high }}</div>
            </div>
            <div class="rounded-md border border-warning-500/30 p-2 bg-warning-100/40">
              <div class="text-[10px] uppercase tracking-wider font-bold text-warning-500">Medium</div>
              <div class="text-lg font-bold text-warning-500">{{ p.bySeverity.medium }}</div>
            </div>
            <div class="rounded-md border border-ink-200 p-2">
              <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500">Low</div>
              <div class="text-lg font-bold text-ink-700">{{ p.bySeverity.low }}</div>
            </div>
          </div>

          @if (filteredKeywordItems().length === 0) {
            <div class="py-8 text-center text-xs text-ink-500">
              No cannibalization at this severity. 🎉
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500 border-b border-ink-200">
                    <th class="py-2 pr-3 font-bold">Query</th>
                    <th class="py-2 px-2 font-bold text-center">URLs</th>
                    <th class="py-2 px-2 font-bold">Top URL</th>
                    <th class="py-2 px-2 font-bold">Secondary URLs</th>
                    <th class="py-2 px-2 font-bold text-right">Impressions</th>
                    <th class="py-2 px-2 font-bold text-center">Severity</th>
                    <th class="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  @for (it of filteredKeywordItems(); track it.query) {
                    <tr class="border-b border-ink-100"
                        [class.opacity-60]="it.dismissed">
                      <td class="py-2 pr-3 font-medium text-ink-900">
                        {{ it.query }}
                        @if (it.dismissed) {
                          <span class="ml-1 text-[10px] uppercase tracking-wider font-bold text-ink-400">· Reviewed</span>
                        }
                      </td>
                      <td class="py-2 px-2 text-center text-ink-700">{{ it.pages.length }}</td>
                      <td class="py-2 px-2">
                        <a [href]="it.pages[0].url" target="_blank" rel="noopener"
                           class="text-sky-600 hover:underline truncate inline-block max-w-[260px]"
                           [title]="it.pages[0].url">
                          {{ shortPath(it.pages[0].url) }}
                        </a>
                        <span class="text-[10px] text-ink-500 ml-1">
                          ({{ it.pages[0].clicks }}c · pos {{ it.pages[0].position | number: '1.1-1' }})
                        </span>
                      </td>
                      <td class="py-2 px-2">
                        <div class="space-y-0.5">
                          @for (pg of it.pages.slice(1, 3); track pg.url) {
                            <div class="leading-tight">
                              <a [href]="pg.url" target="_blank" rel="noopener"
                                 class="text-ink-700 hover:underline truncate inline-block max-w-[240px]"
                                 [title]="pg.url">
                                {{ shortPath(pg.url) }}
                              </a>
                              <span class="text-[10px] text-ink-500 ml-1">
                                ({{ pg.clicks }}c · pos {{ pg.position | number: '1.1-1' }})
                              </span>
                            </div>
                          }
                          @if (it.pages.length > 3) {
                            <div class="text-[10px] text-ink-400">
                              +{{ it.pages.length - 3 }} more
                            </div>
                          }
                        </div>
                      </td>
                      <td class="py-2 px-2 text-right font-mono text-ink-700">
                        {{ it.totalImpressions | number }}
                      </td>
                      <td class="py-2 px-2 text-center">
                        <span [class]="'inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ' + severityBadge(it.severity)">
                          {{ it.severity }}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-right whitespace-nowrap">
                        <a [href]="gscQueryUrl(it.query)"
                           target="_blank" rel="noopener"
                           class="text-[10px] text-sky-600 hover:underline mr-2">
                          Open in GSC
                        </a>
                        @if (it.dismissed) {
                          <button class="text-[10px] text-ink-500 hover:text-ink-900 underline"
                                  (click)="undismiss(it)">
                            Undismiss
                          </button>
                        } @else {
                          <button class="text-[10px] text-ink-500 hover:text-ink-900 underline"
                                  (click)="dismiss(it)">
                            Mark intentional
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </section>

      <!-- ============ DUPLICATE CONTENT (Canonical) ============ -->
      <section class="card">
        <header class="mb-3">
          <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400">
            Duplicate content (canonical mismatch)
          </div>
          <h3 class="text-sm font-bold text-ink-900 mt-0.5">
            URLs where Google picked a canonical different from the one declared
          </h3>
          <p class="text-[11px] text-ink-500 mt-1">
            Reads from the latest Indexing pull — run a pull from the Indexing tab to refresh.
          </p>
        </header>

        @if (canonicalsPayload(); as p) {
          @if (p.total === 0) {
            <div class="py-8 text-center text-xs text-ink-500">
              No canonical mismatches detected. Every page Google indexed pointed back to the URL the page declared.
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500 border-b border-ink-200">
                    <th class="py-2 pr-3 font-bold">URL</th>
                    <th class="py-2 px-2 font-bold">Declared canonical</th>
                    <th class="py-2 px-2 font-bold">Google chose</th>
                    <th class="py-2 px-2 font-bold">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  @for (it of p.items; track it.url) {
                    <tr class="border-b border-ink-100">
                      <td class="py-2 pr-3">
                        <a [href]="it.url" target="_blank" rel="noopener"
                           class="text-sky-600 hover:underline truncate inline-block max-w-[280px]"
                           [title]="it.url">
                          {{ shortPath(it.url) }}
                        </a>
                      </td>
                      <td class="py-2 px-2 text-ink-700 truncate max-w-[220px]"
                          [title]="it.userCanonical || '—'">
                        {{ shortPath(it.userCanonical || '—') }}
                      </td>
                      <td class="py-2 px-2 text-ink-700 truncate max-w-[220px]"
                          [title]="it.googleCanonical || '—'">
                        {{ shortPath(it.googleCanonical || '—') }}
                      </td>
                      <td class="py-2 px-2 text-ink-500">{{ it.coverageState || '—' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        } @else {
          <div class="py-4 text-center text-xs text-ink-500">Loading…</div>
        }
      </section>

      <!-- ============ INTERNAL OVERLAP ============ -->
      <section class="card">
        <header class="mb-3">
          <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400">
            Internal keyword overlap
          </div>
          <h3 class="text-sm font-bold text-ink-900 mt-0.5">
            Target keywords assigned to multiple content pieces
          </h3>
          <p class="text-[11px] text-ink-500 mt-1">
            Pulled live from the Content pipeline — useful for catching duplicate briefs before publishing.
          </p>
        </header>

        @if (internalPayload(); as p) {
          @if (p.total === 0) {
            <div class="py-8 text-center text-xs text-ink-500">
              Every target keyword is assigned to a single piece — no internal overlap.
            </div>
          } @else {
            <div class="space-y-2">
              @for (it of p.items; track it.targetKeyword) {
                <div class="border border-ink-200 rounded-md p-3 bg-ink-50/40">
                  <div class="flex items-baseline justify-between gap-3 mb-2">
                    <div class="text-sm font-bold text-brand-600">🎯 {{ it.targetKeyword }}</div>
                    <span class="text-[10px] uppercase tracking-wider font-bold text-ink-500">
                      {{ it.pieces.length }} pieces
                    </span>
                  </div>
                  <ul class="space-y-1">
                    @for (pc of it.pieces; track pc._id) {
                      <li class="flex items-center gap-2 text-xs">
                        <span [class]="'text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ' + statusBadge(pc.status)">
                          {{ pc.status }}
                        </span>
                        <span class="text-ink-900 truncate flex-1">{{ pc.title }}</span>
                        @if (pc.publishedUrl) {
                          <a [href]="pc.publishedUrl" target="_blank" rel="noopener"
                             class="text-[10px] text-positive-500 hover:underline">↗ live</a>
                        }
                        @if (pc.briefUrl) {
                          <a [href]="pc.briefUrl" target="_blank" rel="noopener"
                             class="text-[10px] text-sky-600 hover:underline">📝 draft</a>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        } @else {
          <div class="py-4 text-center text-xs text-ink-500">Loading…</div>
        }
      </section>
    </div>
  `,
})
export class ClientCannibalizationTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  @Input() gscSiteUrl?: string;

  private svc = inject(CannibalizationService);

  keywordPayload = signal<KeywordCannibalizationResponse | null>(null);
  canonicalsPayload = signal<CanonicalMismatchResponse | null>(null);
  internalPayload = signal<InternalOverlapResponse | null>(null);

  loadingKeywords = signal(false);
  keywordError = signal<string | null>(null);

  severityFilter: SeverityFilter = 'all';

  filteredKeywordItems = computed<CannibalizedQuery[]>(() => {
    const p = this.keywordPayload();
    if (!p) return [];
    if (this.severityFilter === 'all') return p.items;
    return p.items.filter((i) => i.severity === this.severityFilter);
  });

  ngOnChanges() {
    if (!this.clientId) return;
    this.loadKeywords(false);
    this.svc.canonicals(this.clientId).subscribe((c) => this.canonicalsPayload.set(c));
    this.svc.internal(this.clientId).subscribe((c) => this.internalPayload.set(c));
  }

  refreshKeywords() {
    this.loadKeywords(true);
  }

  private loadKeywords(refresh: boolean) {
    this.loadingKeywords.set(true);
    this.keywordError.set(null);
    this.svc.keywords(this.clientId, refresh).subscribe({
      next: (p) => {
        this.keywordPayload.set(p);
        this.loadingKeywords.set(false);
      },
      error: (err) => {
        this.loadingKeywords.set(false);
        const m = err?.error?.message;
        this.keywordError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not load keyword cannibalization.',
        );
      },
    });
  }

  dismiss(it: CannibalizedQuery) {
    this.svc.dismiss(this.clientId, it.query).subscribe(() => {
      const p = this.keywordPayload();
      if (!p) return;
      this.keywordPayload.set({
        ...p,
        items: p.items.map((x) =>
          x.query === it.query ? { ...x, dismissed: true } : x,
        ),
      });
    });
  }

  undismiss(it: CannibalizedQuery) {
    this.svc.undismiss(this.clientId, it.query).subscribe(() => {
      const p = this.keywordPayload();
      if (!p) return;
      this.keywordPayload.set({
        ...p,
        items: p.items.map((x) =>
          x.query === it.query ? { ...x, dismissed: false } : x,
        ),
      });
    });
  }

  severityBadge(s: CannibalizationSeverity): string {
    if (s === 'high') return 'bg-danger-100 text-danger-700';
    if (s === 'medium') return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-700';
  }

  statusBadge(status: string): string {
    if (status === 'published') return 'bg-positive-100 text-positive-500';
    if (status === 'draft') return 'bg-sky-100 text-sky-700';
    return 'bg-ink-100 text-ink-700';
  }

  /**
   * Strips the protocol + host so URLs from the same site are shorter and
   * scannable side-by-side. Falls back to the original string when the URL
   * doesn't parse (e.g. an "—" placeholder).
   */
  shortPath(url: string): string {
    if (!url || url === '—') return url;
    try {
      const u = new URL(url);
      const path = (u.pathname + u.search) || '/';
      return path.length > 70 ? path.slice(0, 67) + '…' : path;
    } catch {
      return url;
    }
  }

  /**
   * Deep-link into GSC search analytics filtered by the query. We can't
   * link to the exact site resource without URL-encoding the property
   * URI in a path segment, so this opens the search analytics dashboard
   * with the query pre-filtered and lets the user pick the site there.
   */
  gscQueryUrl(query: string): string {
    if (this.gscSiteUrl) {
      const resource = encodeURIComponent(this.gscSiteUrl);
      const q = encodeURIComponent(query);
      return `https://search.google.com/search-console/performance/search-analytics?resource_id=${resource}&query=*${q}`;
    }
    return `https://search.google.com/search-console/performance/search-analytics?query=*${encodeURIComponent(query)}`;
  }
}
