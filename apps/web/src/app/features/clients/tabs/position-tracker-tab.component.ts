import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { NgApexchartsModule } from 'ng-apexcharts';
import type { ApexOptions } from 'ng-apexcharts';
import { Keyword, KeywordMovement, KeywordRanking } from '@seo/shared';
import { KeywordsService } from '../../../core/keywords.service';

type HistoryRange = '7d' | '28d' | '90d';

interface PositionHistorySeries {
  keywordId: string;
  keyword: string;
  points: Array<{ date: string; position: number }>;
}

interface Mover {
  keywordId: string;
  keyword: string;
  from: number;
  to: number;
  change: number;
}

interface Movements {
  gainers: KeywordMovement[];
  losers: KeywordMovement[];
  flat: KeywordMovement[];
  fresh: KeywordMovement[];
}

Chart.register(...registerables);

@Component({
  selector: 'app-client-position-tracker-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe, NgApexchartsModule],
  template: `
    <div class="space-y-4">
      <!-- Position history panel. Anchored to a daily snapshot cron
           that runs at 4am UTC per client — see
           KeywordsService.snapshotAllClientsFromGsc. The "Snapshot
           now" button lets a strategist trigger the same sync
           immediately when they don't want to wait for the overnight
           run. -->
      <div class="card space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-ink-900">Position history</h3>
            <p class="text-[11px] text-ink-500">
              Daily average position pulled from GSC. Snapshots run
              automatically at 4am UTC.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="inline-flex rounded-md border border-ink-200 p-0.5 bg-white">
              @for (r of historyRanges; track r.key) {
                <button type="button"
                        class="px-2.5 py-1 text-[11px] font-semibold rounded transition"
                        [class.bg-ink-900]="historyRange() === r.key"
                        [class.text-white]="historyRange() === r.key"
                        [class.text-ink-600]="historyRange() !== r.key"
                        (click)="setHistoryRange(r.key)">
                  {{ r.label }}
                </button>
              }
            </div>
            <button type="button"
                    class="btn-secondary text-xs"
                    [disabled]="snapshotting()"
                    (click)="runSnapshotNow()">
              {{ snapshotting() ? 'Snapping…' : '📸 Snapshot now' }}
            </button>
          </div>
        </div>

        @if (snapshotResult(); as res) {
          <div class="text-xs text-positive-500 bg-positive-100/40 border-l-4 border-positive-500 px-3 py-2">
            ✓ Updated {{ res.updated }} keyword(s) · {{ res.notFound }} without GSC data · {{ res.failed }} failed.
          </div>
        }

        <!-- Gainers / Losers over the range -->
        @if (moversLoading()) {
          <div class="py-4 text-center text-xs text-ink-400 italic">Loading movers…</div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="rounded-md border border-positive-500/30 bg-positive-100/20 p-3">
              <h4 class="text-xs font-bold text-positive-500 uppercase tracking-wider mb-2">
                ▲ Gainers ({{ movers()?.gainers?.length || 0 }})
              </h4>
              @if (movers()?.gainers?.length) {
                <ul class="space-y-1">
                  @for (m of movers()?.gainers; track m.keywordId) {
                    <li class="flex items-center justify-between text-xs">
                      <span class="text-ink-900 truncate max-w-[200px]" [title]="m.keyword">
                        {{ m.keyword }}
                      </span>
                      <span class="text-ink-500 whitespace-nowrap">
                        {{ m.from | number: '1.0-1' }} → {{ m.to | number: '1.0-1' }}
                        <span class="text-positive-500 font-semibold ml-1">−{{ m.change | number: '1.0-1' }}</span>
                      </span>
                    </li>
                  }
                </ul>
              } @else {
                <div class="text-xs text-ink-400 italic">No positive moves in the window.</div>
              }
            </div>
            <div class="rounded-md border border-danger-500/30 bg-danger-100/20 p-3">
              <h4 class="text-xs font-bold text-danger-500 uppercase tracking-wider mb-2">
                ▼ Losers ({{ movers()?.losers?.length || 0 }})
              </h4>
              @if (movers()?.losers?.length) {
                <ul class="space-y-1">
                  @for (m of movers()?.losers; track m.keywordId) {
                    <li class="flex items-center justify-between text-xs">
                      <span class="text-ink-900 truncate max-w-[200px]" [title]="m.keyword">
                        {{ m.keyword }}
                      </span>
                      <span class="text-ink-500 whitespace-nowrap">
                        {{ m.from | number: '1.0-1' }} → {{ m.to | number: '1.0-1' }}
                        <span class="text-danger-500 font-semibold ml-1">+{{ (-m.change) | number: '1.0-1' }}</span>
                      </span>
                    </li>
                  }
                </ul>
              } @else {
                <div class="text-xs text-ink-400 italic">No drops in the window.</div>
              }
            </div>
          </div>
        }

        <!-- Multi-keyword trend chart -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-semibold text-ink-700 uppercase tracking-wider">
              Trend · {{ activeSeries().length }} keyword(s)
            </h4>
            <div class="text-[10px] text-ink-500">
              Y axis is search rank (lower = better)
            </div>
          </div>

          <!-- Keyword pills — click to toggle on/off in the chart -->
          @if (historyAll().length > 0) {
            <div class="flex flex-wrap gap-1 mb-3 max-h-24 overflow-y-auto">
              @for (s of historyAll(); track s.keywordId) {
                <button type="button"
                        class="text-[11px] px-2 py-0.5 rounded border transition"
                        [class.bg-ink-900]="isSelected(s.keywordId)"
                        [class.text-white]="isSelected(s.keywordId)"
                        [class.border-ink-900]="isSelected(s.keywordId)"
                        [class.text-ink-600]="!isSelected(s.keywordId)"
                        [class.border-ink-200]="!isSelected(s.keywordId)"
                        [class.hover:bg-ink-100]="!isSelected(s.keywordId)"
                        (click)="toggleSeries(s.keywordId)">
                  {{ s.keyword }}
                  <span class="text-[9px] opacity-70 ml-1">{{ s.points.length }}pt</span>
                </button>
              }
            </div>
          }

          @if (historyLoading()) {
            <div class="py-12 text-center text-xs text-ink-400 italic">Loading history…</div>
          } @else if (activeSeries().length > 0) {
            <apx-chart
              [series]="chartSeries()"
              [chart]="chartOpts.chart!"
              [stroke]="chartOpts.stroke!"
              [xaxis]="chartOpts.xaxis!"
              [yaxis]="chartOpts.yaxis!"
              [tooltip]="chartOpts.tooltip!"
              [colors]="chartOpts.colors!"
              [grid]="chartOpts.grid!"
              [legend]="chartOpts.legend!"
              [markers]="chartOpts.markers!"
              [dataLabels]="chartOpts.dataLabels!" />
          } @else if (historyAll().length > 0) {
            <div class="py-8 text-center text-xs text-ink-400 italic">
              Pick one or more keywords above to plot.
            </div>
          } @else {
            <div class="py-8 text-center text-xs text-ink-400 italic">
              No history yet. Click "Snapshot now" to capture a first datapoint.
            </div>
          }
        </div>
      </div>

      <!-- Movements summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="stat-card">
          <span class="stat-label">▲ Improved</span>
          <div class="stat-value text-positive-500">{{ movements()?.gainers?.length ?? 0 }}</div>
          <div class="text-xs text-ink-500 mt-1">improved position</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">▼ Dropped</span>
          <div class="stat-value text-danger-500">{{ movements()?.losers?.length ?? 0 }}</div>
          <div class="text-xs text-ink-500 mt-1">dropped position</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">⚡ URL changes</span>
          <div class="stat-value text-warning-500">{{ volatility().length }}</div>
          <div class="text-xs text-ink-500 mt-1">keywords with different URLs in 90d</div>
        </div>
        <div class="stat-card">
          <span class="stat-label">★ New</span>
          <div class="stat-value text-sky-500">{{ movements()?.fresh?.length ?? 0 }}</div>
          <div class="text-xs text-ink-500 mt-1">first measurement</div>
        </div>
      </div>

      <!-- Quick record position -->
      <div class="card">
        <h3 class="text-sm font-semibold text-ink-900 mb-3">📊 Record new position</h3>
        <div class="grid grid-cols-1 md:grid-cols-12 gap-2">
          <select class="input md:col-span-4" [(ngModel)]="record.keywordId">
            <option value="">Select keyword</option>
            @for (k of keywords(); track k._id) {
              <option [value]="k._id">{{ k.text }}@if (k.currentPosition) { · pos {{ k.currentPosition }} }</option>
            }
          </select>
          <input type="number" class="input md:col-span-1" [(ngModel)]="record.position" placeholder="Pos" min="1" max="200" />
          <input class="input md:col-span-5" [(ngModel)]="record.rankingUrl" placeholder="Ranking URL (https://...)" />
          <select class="input md:col-span-1" [(ngModel)]="record.device">
            <option value="desktop">💻</option>
            <option value="mobile">📱</option>
          </select>
          <button class="btn-primary md:col-span-1" (click)="submitRecord()" [disabled]="!canRecord()">Save</button>
        </div>
      </div>

      <!-- Gainers + Losers -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Gainers -->
        <div class="card-flush">
          <div class="bg-positive-100 px-4 py-2.5 border-b border-ink-200 flex items-center justify-between">
            <span class="text-sm font-semibold text-positive-500">▲ Improved</span>
            <span class="text-xs text-positive-500">{{ movements()?.gainers?.length ?? 0 }}</span>
          </div>
          <table class="table">
            <tbody>
              @for (m of movements()?.gainers || []; track m.keyword._id) {
                <tr (click)="openDetail(m.keyword)" class="cursor-pointer">
                  <td class="py-2">
                    <div class="font-medium text-ink-900 text-sm">{{ m.keyword.text }}</div>
                    @if (m.keyword.currentRankingUrl) {
                      <div class="text-[10px] text-ink-500 truncate max-w-xs">{{ m.keyword.currentRankingUrl }}</div>
                    }
                  </td>
                  <td class="text-right">
                    <div class="font-bold text-positive-500 text-sm">▲ {{ m.delta }}</div>
                    <div class="text-xs text-ink-500">→ pos {{ m.keyword.currentPosition }}</div>
                  </td>
                </tr>
              }
              @if (!movements()?.gainers?.length) {
                <tr><td class="py-6 text-center text-ink-400 italic text-sm">No gainers yet</td></tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Losers -->
        <div class="card-flush">
          <div class="bg-danger-100 px-4 py-2.5 border-b border-ink-200 flex items-center justify-between">
            <span class="text-sm font-semibold text-danger-500">▼ Dropped</span>
            <span class="text-xs text-danger-500">{{ movements()?.losers?.length ?? 0 }}</span>
          </div>
          <table class="table">
            <tbody>
              @for (m of movements()?.losers || []; track m.keyword._id) {
                <tr (click)="openDetail(m.keyword)" class="cursor-pointer">
                  <td class="py-2">
                    <div class="font-medium text-ink-900 text-sm">{{ m.keyword.text }}</div>
                    @if (m.keyword.currentRankingUrl) {
                      <div class="text-[10px] text-ink-500 truncate max-w-xs">{{ m.keyword.currentRankingUrl }}</div>
                    }
                  </td>
                  <td class="text-right">
                    <div class="font-bold text-danger-500 text-sm">▼ {{ Math.abs(m.delta) }}</div>
                    <div class="text-xs text-ink-500">→ pos {{ m.keyword.currentPosition }}</div>
                  </td>
                </tr>
              }
              @if (!movements()?.losers?.length) {
                <tr><td class="py-6 text-center text-ink-400 italic text-sm">No losers — great!</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- URL Volatility -->
      <div class="card-flush">
        <div class="bg-warning-100 px-4 py-2.5 border-b border-ink-200">
          <span class="text-sm font-semibold text-warning-500">⚡ URL Volatility — Keywords ranking with different URLs (90d)</span>
        </div>
        <div class="overflow-x-auto">
        <table class="table min-w-[640px]">
          <thead>
            <tr>
              <th>Keyword</th>
              <th class="text-center">Unique URLs</th>
              <th>Ranking URLs</th>
              <th class="text-right">Changes 90d</th>
            </tr>
          </thead>
          <tbody>
            @for (v of volatility(); track v.keyword._id) {
              <tr (click)="openDetail(v.keyword)" class="cursor-pointer">
                <td>
                  <div class="font-medium text-ink-900">{{ v.keyword.text }}</div>
                  <div class="text-xs text-ink-500">→ pos {{ v.keyword.currentPosition }}</div>
                </td>
                <td class="text-center">
                  <span class="badge-warning">{{ v.uniqueUrls }}</span>
                </td>
                <td class="text-xs text-ink-500">
                  @for (u of v.urls; track u) {
                    <div class="truncate max-w-md">{{ u }}</div>
                  }
                </td>
                <td class="text-right font-semibold text-warning-500">{{ v.changesIn90Days }}</td>
              </tr>
            }
            @if (!volatility().length) {
              <tr><td colspan="4" class="py-6 text-center text-ink-400 italic text-sm">
                No keyword changed URL in the last 90 days. Good signal.
              </td></tr>
            }
          </tbody>
        </table>
        </div>
      </div>

      <!-- Detail drawer -->
      @if (selectedKeyword(); as kw) {
        <div class="fixed inset-0 bg-ink-900/40 z-40" (click)="closeDetail()"></div>
        <div class="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto">
          <div class="sticky top-0 bg-white border-b border-ink-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-bold text-ink-900">{{ kw.text }}</h2>
              <div class="text-xs text-ink-500 mt-0.5">
                {{ kw.group || 'no group' }} · current pos <strong>{{ kw.currentPosition ?? '—' }}</strong>
                · best <strong class="text-positive-500">{{ kw.bestPosition ?? '—' }}</strong>
              </div>
            </div>
            <button class="text-ink-400 hover:text-ink-700 text-2xl leading-none" (click)="closeDetail()">×</button>
          </div>

          <div class="p-6 space-y-4">
            <div class="card">
              <h3 class="text-sm font-semibold text-ink-900 mb-2">Position over time</h3>
              @if (timelineRankings().length >= 2) {
                <canvas #chartCanvas></canvas>
              } @else {
                <p class="text-sm text-ink-400 italic text-center py-8">
                  At least 2 measurements needed to see the trend (you have {{ timelineRankings().length }})
                </p>
              }
            </div>

            @if (urlEvents().length) {
              <div class="card">
                <h3 class="text-sm font-semibold text-ink-900 mb-2">⚡ URL Changes</h3>
                <div class="space-y-1.5">
                  @for (e of urlEvents(); track $index) {
                    <div class="text-xs flex items-start gap-2">
                      <span class="text-ink-400 whitespace-nowrap">{{ e.date | date: 'shortDate' }}</span>
                      @if (e.from) {
                        <span class="text-ink-500 line-through truncate">{{ e.from }}</span>
                        <span class="text-warning-500">→</span>
                      } @else {
                        <span class="badge-success">first</span>
                      }
                      <span class="text-positive-500 font-medium truncate">{{ e.to }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <div class="card-flush">
              <div class="bg-ink-50 px-4 py-2 border-b border-ink-200">
                <span class="text-xs font-semibold text-ink-700 uppercase tracking-wider">History</span>
              </div>
              <table class="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th class="text-right">Pos.</th>
                    <th>Ranking URL</th>
                    <th>Device</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of [...timelineRankings()].reverse(); track r._id) {
                    <tr>
                      <td class="text-xs">{{ r.recordedAt | date: 'short' }}</td>
                      <td class="text-right font-bold" [ngClass]="positionColor(r.position)">{{ r.position }}</td>
                      <td class="text-xs text-ink-500 truncate max-w-sm">{{ r.rankingUrl || '—' }}</td>
                      <td class="text-xs">{{ r.device || 'desktop' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ClientPositionTrackerTab implements OnChanges, AfterViewInit {
  @Input({ required: true }) clientId!: string;
  @ViewChild('chartCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private svc = inject(KeywordsService);
  private chart?: Chart;

  keywords = signal<Keyword[]>([]);
  movements = signal<Movements | null>(null);
  volatility = signal<Array<{ keyword: Keyword; uniqueUrls: number; urls: string[]; changesIn90Days: number }>>([]);
  selectedKeyword = signal<Keyword | null>(null);
  timelineRankings = signal<KeywordRanking[]>([]);
  urlEvents = signal<Array<{ from?: string; to: string; date: string }>>([]);
  Math = Math;

  // History panel state
  readonly historyRanges: { key: HistoryRange; label: string; days: number }[] = [
    { key: '7d', label: '7d', days: 7 },
    { key: '28d', label: '28d', days: 28 },
    { key: '90d', label: '90d', days: 90 },
  ];
  historyRange = signal<HistoryRange>('28d');
  historyAll = signal<PositionHistorySeries[]>([]);
  historyLoading = signal(false);
  selectedKeywordIds = signal<Set<string>>(new Set());
  movers = signal<{ gainers: Mover[]; losers: Mover[]; windowDays: number } | null>(null);
  moversLoading = signal(false);
  snapshotting = signal(false);
  snapshotResult = signal<{
    updated: number;
    notFound: number;
    failed: number;
  } | null>(null);

  record = {
    keywordId: '',
    position: null as number | null,
    rankingUrl: '',
    device: 'desktop' as 'desktop' | 'mobile',
  };

  ngOnChanges() {
    this.load();
  }

  ngAfterViewInit() {
    if (this.timelineRankings().length >= 2) this.render();
  }

  load() {
    this.svc.byClient(this.clientId).subscribe((k) => this.keywords.set(k));
    this.svc.movements(this.clientId).subscribe((m) => this.movements.set(m as unknown as Movements));
    this.svc.volatility(this.clientId).subscribe((v) => this.volatility.set(v));
    this.loadHistoryPanel();
  }

  private loadHistoryPanel() {
    const days = this.currentRangeDays();
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
    const fromIso = this.iso(from);
    const toIso = this.iso(to);

    this.historyLoading.set(true);
    this.svc.positionHistory(this.clientId, fromIso, toIso).subscribe({
      next: (list) => {
        // Sort by number of datapoints desc so the most-tracked
        // keywords sit at the top of the picker.
        const sorted = [...list].sort(
          (a, b) => b.points.length - a.points.length,
        );
        this.historyAll.set(sorted);
        // Auto-select the top 5 keywords with data so the chart
        // renders something meaningful on first load.
        if (this.selectedKeywordIds().size === 0) {
          const top = new Set(
            sorted
              .filter((s) => s.points.length > 0)
              .slice(0, 5)
              .map((s) => s.keywordId),
          );
          this.selectedKeywordIds.set(top);
        }
        this.historyLoading.set(false);
      },
      error: () => this.historyLoading.set(false),
    });

    this.moversLoading.set(true);
    this.svc.positionMovers(this.clientId, days).subscribe({
      next: (m) => {
        this.movers.set(m);
        this.moversLoading.set(false);
      },
      error: () => this.moversLoading.set(false),
    });
  }

  private currentRangeDays(): number {
    const r = this.historyRanges.find((rr) => rr.key === this.historyRange());
    return r ? r.days : 28;
  }

  private iso(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  setHistoryRange(r: HistoryRange) {
    this.historyRange.set(r);
    // Range change resets the selection so the auto-top-5 recomputes
    // for the new data slice.
    this.selectedKeywordIds.set(new Set());
    this.loadHistoryPanel();
  }

  isSelected(keywordId: string): boolean {
    return this.selectedKeywordIds().has(keywordId);
  }

  toggleSeries(keywordId: string) {
    this.selectedKeywordIds.update((current) => {
      const next = new Set(current);
      if (next.has(keywordId)) {
        next.delete(keywordId);
      } else {
        next.add(keywordId);
      }
      return next;
    });
  }

  activeSeries = computed(() =>
    this.historyAll().filter(
      (s) => this.selectedKeywordIds().has(s.keywordId) && s.points.length > 0,
    ),
  );

  chartSeries = computed(() =>
    this.activeSeries().map((s) => ({
      name: s.keyword,
      data: s.points.map((p) => ({ x: p.date, y: p.position })),
    })),
  );

  readonly seriesColors = [
    '#1E40AF',
    '#059669',
    '#DC2626',
    '#7C3AED',
    '#D97706',
    '#0891B2',
    '#DB2777',
    '#65A30D',
  ];

  get chartOpts(): Partial<ApexOptions> {
    return {
      chart: {
        type: 'line',
        height: 300,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: 'Inter, system-ui, sans-serif',
        animations: { enabled: true, speed: 400 },
      },
      stroke: { curve: 'smooth', width: 2 },
      colors: this.seriesColors,
      dataLabels: { enabled: false },
      grid: {
        borderColor: '#F0F2F5',
        strokeDashArray: 4,
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#6B7280', fontSize: '11px' },
        },
        axisBorder: { show: false },
      },
      yaxis: {
        reversed: true,
        min: 1,
        labels: {
          style: { colors: '#6B7280', fontSize: '11px' },
          formatter: (v: number) => (v ? v.toFixed(0) : ''),
        },
      },
      tooltip: {
        theme: 'light',
        x: { format: 'MMM d, yyyy' },
        shared: true,
        intersect: false,
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '11px',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      markers: { size: 3, hover: { size: 6 } },
    };
  }

  runSnapshotNow() {
    this.snapshotting.set(true);
    this.snapshotResult.set(null);
    this.svc.snapshotNow(this.clientId).subscribe({
      next: (res) => {
        this.snapshotting.set(false);
        this.snapshotResult.set({
          updated: res.updated,
          notFound: res.notFound,
          failed: res.failed,
        });
        setTimeout(() => this.snapshotResult.set(null), 6000);
        this.loadHistoryPanel();
      },
      error: () => {
        this.snapshotting.set(false);
      },
    });
  }

  canRecord(): boolean {
    return !!(this.record.keywordId && this.record.position && this.record.position > 0);
  }

  submitRecord() {
    if (!this.canRecord()) return;
    this.svc
      .recordPosition(this.record.keywordId, {
        position: this.record.position!,
        rankingUrl: this.record.rankingUrl || undefined,
        device: this.record.device,
      })
      .subscribe(() => {
        this.record = { keywordId: '', position: null, rankingUrl: '', device: 'desktop' };
        this.load();
      });
  }

  openDetail(kw: Keyword) {
    this.selectedKeyword.set(kw);
    if (!kw._id) return;
    this.svc.timeline(kw._id).subscribe((t) => {
      this.timelineRankings.set(t.rankings);
      this.urlEvents.set(t.urlEvents);
      setTimeout(() => this.render(), 50);
    });
  }

  closeDetail() {
    this.selectedKeyword.set(null);
    this.chart?.destroy();
    this.chart = undefined;
  }

  render() {
    if (!this.canvasRef) return;
    const data = this.timelineRankings();
    if (data.length < 2) return;
    const labels = data.map((r) =>
      new Date(r.recordedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    );
    const positions = data.map((r) => r.position);
    this.chart?.destroy();
    this.chart = new Chart(this.canvasRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Position',
            data: positions,
            borderColor: '#FF7A59',
            backgroundColor: 'rgba(255, 122, 89, 0.1)',
            tension: 0.3,
            fill: true,
            pointRadius: 5,
            pointBackgroundColor: '#FF7A59',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        plugins: { legend: { display: false } },
        scales: {
          y: { reverse: true, beginAtZero: false, ticks: { stepSize: 1 } },
        },
      },
    });
  }

  positionColor(pos: number) {
    if (pos <= 3) return 'text-positive-500';
    if (pos <= 10) return 'text-sky-500';
    if (pos <= 20) return 'text-warning-500';
    return 'text-ink-500';
  }
}
