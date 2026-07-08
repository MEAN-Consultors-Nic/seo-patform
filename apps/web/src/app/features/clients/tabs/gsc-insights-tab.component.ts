import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GscBreakdown } from '@seo/shared';
import { GoogleIntegrationsService } from '../../../core/google-integrations.service';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-client-gsc-insights-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, DecimalPipe],
  template: `
    <div class="space-y-4">
      <div class="card flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-ink-900">GSC Insights</h2>
          <p class="text-xs text-ink-500 mt-0.5">
            Live breakdowns from Google Search Console: top pages, device split,
            country share, and sitemap health.
            <a routerLink="/profile/integrations"
               class="text-brand-500 hover:underline">Manage connection.</a>
          </p>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <select class="input input-sm" [ngModel]="preset()" (ngModelChange)="setPreset($event)">
            <option value="last7">Last 7 days</option>
            <option value="last28">Last 28 days</option>
            <option value="last90">Last 90 days</option>
            <option value="custom">Custom</option>
          </select>
          @if (preset() === 'custom') {
            <input type="date" class="input input-sm" [(ngModel)]="from" />
            <input type="date" class="input input-sm" [(ngModel)]="to" />
          }
          <button class="btn-primary text-xs" (click)="load()" [disabled]="loading()">
            {{ loading() ? 'Loading…' : 'Refresh' }}
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="card border-l-4 border-danger-500 bg-danger-100/30 text-sm text-danger-500">
          {{ error() }}
        </div>
      }

      @if (data(); as d) {
        <div class="text-[11px] text-ink-400 uppercase tracking-wider">
          Range: {{ d.range.from }} → {{ d.range.to }}
        </div>

        <!-- Sitemap health -->
        <div class="card">
          <h3 class="text-sm font-semibold text-ink-900 mb-3">Sitemap health</h3>
          @if (d.sitemapHealth.totalSitemaps === 0) {
            <div class="text-xs text-ink-400 italic">
              No sitemaps registered in Search Console for this site.
            </div>
          } @else {
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div class="rounded-md border border-ink-200 px-3 py-2 text-center">
                <div class="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">Sitemaps</div>
                <div class="text-xl font-bold text-ink-900">{{ d.sitemapHealth.totalSitemaps }}</div>
              </div>
              <div class="rounded-md border border-ink-200 px-3 py-2 text-center">
                <div class="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">Submitted URLs</div>
                <div class="text-xl font-bold text-ink-900">{{ d.sitemapHealth.totalSubmittedUrls | number }}</div>
              </div>
              <div class="rounded-md border border-ink-200 px-3 py-2 text-center" [class.border-danger-500]="d.sitemapHealth.totalErrors > 0">
                <div class="text-[10px] uppercase tracking-wider font-semibold"
                     [class.text-danger-500]="d.sitemapHealth.totalErrors > 0"
                     [class.text-ink-500]="d.sitemapHealth.totalErrors === 0">Errors</div>
                <div class="text-xl font-bold"
                     [class.text-danger-500]="d.sitemapHealth.totalErrors > 0"
                     [class.text-ink-300]="d.sitemapHealth.totalErrors === 0">
                  {{ d.sitemapHealth.totalErrors }}
                </div>
              </div>
              <div class="rounded-md border border-ink-200 px-3 py-2 text-center" [class.border-warning-500]="d.sitemapHealth.totalWarnings > 0">
                <div class="text-[10px] uppercase tracking-wider font-semibold"
                     [class.text-warning-500]="d.sitemapHealth.totalWarnings > 0"
                     [class.text-ink-500]="d.sitemapHealth.totalWarnings === 0">Warnings</div>
                <div class="text-xl font-bold"
                     [class.text-warning-500]="d.sitemapHealth.totalWarnings > 0"
                     [class.text-ink-300]="d.sitemapHealth.totalWarnings === 0">
                  {{ d.sitemapHealth.totalWarnings }}
                </div>
              </div>
            </div>
            <div class="rounded-md border border-ink-200 overflow-x-auto">
              <table class="w-full text-xs min-w-[520px]">
                <thead class="bg-ink-50 text-ink-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th class="px-3 py-2 text-left">Sitemap</th>
                    <th class="px-3 py-2 text-right">Submitted</th>
                    <th class="px-3 py-2 text-right">Errors</th>
                    <th class="px-3 py-2 text-right">Warnings</th>
                    <th class="px-3 py-2 text-right">Last submitted</th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of d.sitemapHealth.sitemaps; track s.path) {
                    <tr class="border-t border-ink-100">
                      <td class="px-3 py-2 truncate max-w-xs" [title]="s.path">{{ s.path }}</td>
                      <td class="px-3 py-2 text-right">{{ s.submitted | number }}</td>
                      <td class="px-3 py-2 text-right" [class.text-danger-500]="s.errors > 0">{{ s.errors }}</td>
                      <td class="px-3 py-2 text-right" [class.text-warning-500]="s.warnings > 0">{{ s.warnings }}</td>
                      <td class="px-3 py-2 text-right text-ink-500">
                        {{ s.lastSubmitted ? (s.lastSubmitted | date: 'mediumDate') : '—' }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <!-- Device split -->
        @if (d.byDevice.length > 0) {
          <div class="card">
            <h3 class="text-sm font-semibold text-ink-900 mb-3">Performance by device</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              @for (row of d.byDevice; track row.key) {
                <div class="rounded-md border border-ink-200 p-3">
                  <div class="flex items-center justify-between mb-2">
                    <div class="font-semibold text-ink-900 capitalize">{{ row.key.toLowerCase() }}</div>
                    <div class="text-xs text-ink-500">{{ deviceShare(row, d.byDevice) | number: '1.0-1' }}%</div>
                  </div>
                  <div class="h-1 bg-ink-100 rounded-full overflow-hidden mb-2">
                    <div class="h-full bg-brand-500" [style.width.%]="deviceShare(row, d.byDevice)"></div>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div class="text-ink-500 text-[10px] uppercase tracking-wider">Clicks</div>
                      <div class="font-semibold text-ink-900">{{ row.clicks | number }}</div>
                    </div>
                    <div>
                      <div class="text-ink-500 text-[10px] uppercase tracking-wider">Impressions</div>
                      <div class="font-semibold text-ink-900">{{ row.impressions | number }}</div>
                    </div>
                    <div>
                      <div class="text-ink-500 text-[10px] uppercase tracking-wider">CTR</div>
                      <div class="font-semibold text-ink-900">{{ row.ctr | number: '1.1-2' }}%</div>
                    </div>
                    <div>
                      <div class="text-ink-500 text-[10px] uppercase tracking-wider">Position</div>
                      <div class="font-semibold text-ink-900">{{ row.position | number: '1.1-1' }}</div>
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Top countries -->
        @if (d.byCountry.length > 0) {
          <div class="card">
            <h3 class="text-sm font-semibold text-ink-900 mb-3">Top countries</h3>
            <div class="rounded-md border border-ink-200 overflow-x-auto">
              <table class="w-full text-xs min-w-[520px]">
                <thead class="bg-ink-50 text-ink-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th class="px-3 py-2 text-left">Country</th>
                    <th class="px-3 py-2 text-right">Clicks</th>
                    <th class="px-3 py-2 text-right">Impressions</th>
                    <th class="px-3 py-2 text-right">CTR</th>
                    <th class="px-3 py-2 text-right">Avg position</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of d.byCountry; track row.key) {
                    <tr class="border-t border-ink-100 hover:bg-ink-50">
                      <td class="px-3 py-2 uppercase font-mono">{{ row.key }}</td>
                      <td class="px-3 py-2 text-right">{{ row.clicks | number }}</td>
                      <td class="px-3 py-2 text-right">{{ row.impressions | number }}</td>
                      <td class="px-3 py-2 text-right">{{ row.ctr | number: '1.1-2' }}%</td>
                      <td class="px-3 py-2 text-right">{{ row.position | number: '1.1-1' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }

        <!-- Top pages -->
        @if (d.topPages.length > 0) {
          <div class="card">
            <h3 class="text-sm font-semibold text-ink-900 mb-3">Top pages</h3>
            <div class="rounded-md border border-ink-200 overflow-x-auto">
              <table class="w-full text-xs min-w-[520px]">
                <thead class="bg-ink-50 text-ink-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th class="px-3 py-2 text-left">Page</th>
                    <th class="px-3 py-2 text-right">Clicks</th>
                    <th class="px-3 py-2 text-right">Impressions</th>
                    <th class="px-3 py-2 text-right">CTR</th>
                    <th class="px-3 py-2 text-right">Avg position</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of d.topPages; track row.key) {
                    <tr class="border-t border-ink-100 hover:bg-ink-50">
                      <td class="px-3 py-2 truncate max-w-md">
                        <a [href]="row.key" target="_blank"
                           class="text-brand-500 hover:underline truncate inline-block max-w-full"
                           [title]="row.key">{{ shortPage(row.key) }}</a>
                      </td>
                      <td class="px-3 py-2 text-right font-semibold text-ink-900">{{ row.clicks | number }}</td>
                      <td class="px-3 py-2 text-right">{{ row.impressions | number }}</td>
                      <td class="px-3 py-2 text-right">{{ row.ctr | number: '1.1-2' }}%</td>
                      <td class="px-3 py-2 text-right">{{ row.position | number: '1.1-1' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      } @else if (loading()) {
        <div class="card text-center py-10 text-ink-400 italic text-sm">Loading…</div>
      } @else if (!error()) {
        <div class="card text-center py-10 text-ink-400 italic text-sm">
          Click <strong>Refresh</strong> above to pull insights from GSC.
        </div>
      }
    </div>
  `,
})
export class ClientGscInsightsTab implements OnChanges {
  @Input({ required: true }) clientId!: string;

  private svc = inject(GoogleIntegrationsService);

  preset = signal<'last7' | 'last28' | 'last90' | 'custom'>('last28');
  from = daysAgoIso(28);
  to = todayIso();
  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<GscBreakdown | null>(null);

  ngOnChanges() {
    this.data.set(null);
    this.error.set(null);
  }

  setPreset(preset: 'last7' | 'last28' | 'last90' | 'custom') {
    this.preset.set(preset);
    if (preset === 'last7') {
      this.from = daysAgoIso(7);
      this.to = todayIso();
    } else if (preset === 'last28') {
      this.from = daysAgoIso(28);
      this.to = todayIso();
    } else if (preset === 'last90') {
      this.from = daysAgoIso(90);
      this.to = todayIso();
    }
  }

  load() {
    if (!this.from || !this.to) {
      this.error.set('Pick a from and to date.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.svc.gscBreakdown(this.clientId, this.from, this.to).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not load GSC insights.',
        );
      },
    });
  }

  deviceShare(row: { clicks: number }, all: { clicks: number }[]): number {
    const total = all.reduce((acc, r) => acc + r.clicks, 0);
    if (total === 0) return 0;
    return (row.clicks / total) * 100;
  }

  shortPage(url: string): string {
    try {
      const u = new URL(url);
      const path = (u.pathname || '/') + (u.search || '');
      return path === '/' ? u.hostname : path;
    } catch {
      return url;
    }
  }
}
