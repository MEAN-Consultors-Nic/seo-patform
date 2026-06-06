import { CommonModule, DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { Keyword, KeywordMovement, KeywordRanking } from '@seo/shared';
import { KeywordsService } from '../../../core/keywords.service';

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
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="space-y-4">
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
        <table class="table">
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
