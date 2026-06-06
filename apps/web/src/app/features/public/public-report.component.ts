import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import type { ApexOptions } from 'ng-apexcharts';
import { ReportsService } from '../../core/reports.service';
import { SanitizerService } from '../../core/sanitizer.service';

interface TaskAttachmentPayload {
  publicId: string;
  url: string;
  thumbnailUrl?: string;
  format?: string;
  label?: 'before' | 'after' | 'other';
  caption?: string;
}

interface PublicPayload {
  report: {
    kpis: Record<string, number>;
    kpisPrevious?: Record<string, number>;
    executiveSummary: string | string[];
    findings: string;
    nextPeriodPlan: string;
    clientBlockers: string;
    finalConsiderations?: string;
    generatedAt: string;
  };
  client: {
    name: string;
    tier: string;
    url: string;
    logoUrl?: string;
    industry?: string;
  };
  cycle: { label: string; startDate: string; endDate: string };
  tasks: Array<{
    title: string;
    category: string;
    priority: string;
    status: string;
    notes?: string;
    description?: string;
    attachments?: TaskAttachmentPayload[];
  }>;
  keywords: Array<{
    text: string;
    group?: string;
    volume?: number;
    currentPosition?: number;
    previousPosition?: number;
    bestPosition?: number;
    currentRankingUrl?: string;
  }>;
  movements: {
    gainers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
    losers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
    fresh: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
  };
  backlinks: {
    total: number;
    dofollow: number;
    perStatus: Array<{ _id: string; count: number; avgDr: number }>;
  };
  kpiHistory: Array<{
    cycleLabel?: string;
    generatedAt: string;
    kpis: Record<string, number>;
  }>;
}

@Component({
  selector: 'app-public-report',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe, FormsModule, NgApexchartsModule],
  template: `
    @if (loading()) {
      <div class="min-h-screen flex flex-col items-center justify-center bg-ink-50">
        <div class="spinner mb-4" style="width: 28px; height: 28px;"></div>
        <p class="text-sm text-ink-500">Loading report…</p>
      </div>
    } @else if (error()) {
      <div class="min-h-screen flex flex-col items-center justify-center bg-ink-50 px-4">
        <div class="card max-w-md text-center">
          <div class="text-4xl mb-3">🔒</div>
          <h1 class="text-xl font-bold text-ink-900 mb-2">Invalid link</h1>
          <p class="text-sm text-ink-500">{{ error() }}</p>
        </div>
      </div>
    } @else if (locked() && meta(); as m) {
      <!-- PIN GATE -->
      <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-ink-50 via-white to-ink-100 px-4">
        <div class="w-full max-w-md">
          <!-- Branding -->
          <div class="flex items-center justify-center gap-2 mb-6">
            <div class="w-9 h-9 rounded-md bg-brand-500 text-white flex items-center justify-center font-bold text-sm">S</div>
            <div class="text-sm font-semibold text-ink-900">Media Spearhead</div>
          </div>

          <div class="bg-white rounded-2xl shadow-elevated border border-ink-200 p-8">
            <div class="flex flex-col items-center text-center mb-6">
              <div class="w-14 h-14 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF7A59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h1 class="text-xl font-bold text-ink-900 mb-1">Protected report</h1>
              <p class="text-sm text-ink-500 leading-relaxed">
                Enter the 6-digit PIN sent to you by Media Spearhead to view the report for
                <span class="font-semibold text-ink-900">{{ m.client.name }}</span>.
              </p>
            </div>

            <div class="flex justify-center gap-2 mb-3" (paste)="onPinPaste($event)">
              @for (d of pinDigits; track $index) {
                <input
                  type="text"
                  inputmode="numeric"
                  maxlength="1"
                  [attr.data-pin-input]="$index"
                  [value]="d"
                  (input)="onPinInput($index, $event)"
                  (keydown)="onPinKeydown($index, $event)"
                  [disabled]="unlocking()"
                  class="w-11 h-13 text-center text-xl font-bold rounded-lg border-2 transition-all focus:outline-none disabled:opacity-50"
                  [class.border-ink-200]="!pinError()"
                  [class.border-danger-500]="pinError()"
                  [class.focus:border-brand-500]="!pinError()" />
              }
            </div>

            @if (pinError()) {
              <div class="text-center text-xs text-danger-500 font-medium mb-3">{{ pinError() }}</div>
            }

            <button (click)="submitPin()"
                    [disabled]="!pinComplete() || unlocking()"
                    class="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition mt-2">
              @if (unlocking()) {
                <span class="inline-flex items-center gap-2">
                  <span class="spinner" style="border-color: rgba(255,255,255,0.3); border-top-color: white;"></span>
                  Verifying…
                </span>
              } @else {
                Unlock report
              }
            </button>

            <div class="mt-5 pt-5 border-t border-ink-100 text-center">
              <p class="text-[11px] text-ink-400 leading-relaxed">
                Need a new PIN? Contact <a [href]="'mailto:contact@mediaspearhead.com'" class="text-brand-500 hover:underline">your account manager</a>.
              </p>
            </div>
          </div>

          <p class="text-center text-[10px] text-ink-400 mt-5 uppercase tracking-wider">
            Cycle {{ m.cycle.label }} · {{ m.cycle.startDate | date: 'mediumDate' }} – {{ m.cycle.endDate | date: 'mediumDate' }}
          </p>
        </div>
      </div>
    } @else if (data(); as d) {
      <div class="min-h-screen bg-ink-50">
        <!-- HERO -->
        <header class="bg-gradient-to-br from-ink-900 via-ink-900 to-brand-900 text-white relative overflow-hidden">
          <!-- Decorative shapes -->
          <div class="absolute top-0 right-0 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
          <div class="absolute bottom-0 left-1/3 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl"></div>

          <div class="relative max-w-6xl mx-auto px-8 pt-10 pb-12">
            <!-- Top bar -->
            <div class="flex items-center justify-between mb-12">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-md bg-brand-500 flex items-center justify-center font-bold">S</div>
                <div>
                  <div class="text-sm font-bold">SEO Platform</div>
                  <div class="text-[10px] uppercase tracking-wider text-white/60">Media Spearhead</div>
                </div>
              </div>
              <button (click)="downloadPdf()" [disabled]="downloading()"
                      class="bg-white text-ink-900 hover:bg-brand-50 px-4 py-2 rounded-md text-sm font-semibold transition flex items-center gap-2 disabled:opacity-50">
                @if (downloading()) {
                  <span class="spinner" style="border-color: rgba(255,122,89,0.3); border-top-color: #FF7A59;"></span>
                  Generating…
                } @else {
                  <span>⬇</span>
                  Download PDF
                }
              </button>
            </div>

            <!-- Title block -->
            <div>
              <div class="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-300 mb-3">
                Bi-Weekly SEO Report
              </div>
              <h1 class="text-5xl md:text-6xl font-black tracking-tight leading-tight">{{ d.client.name }}</h1>
              <div class="flex items-center gap-3 mt-3 text-sm">
                <span class="bg-white/10 backdrop-blur px-2.5 py-0.5 rounded-md text-xs font-bold">
                  Tier {{ d.client.tier }}
                </span>
                <a [href]="d.client.url" target="_blank" class="text-white/80 hover:text-white hover:underline">
                  {{ d.client.url }}
                </a>
              </div>
            </div>

            <!-- Period strip -->
            <div class="grid grid-cols-3 gap-6 mt-10 pt-6 border-t border-white/10">
              <div>
                <div class="text-[10px] uppercase tracking-wider text-white/50 mb-1">Period</div>
                <div class="text-lg font-semibold">
                  {{ d.cycle.startDate | date: 'MMM d' }} – {{ d.cycle.endDate | date: 'MMM d, yyyy' }}
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-white/50 mb-1">Cycle</div>
                <div class="text-lg font-semibold">{{ d.cycle.label }}</div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-white/50 mb-1">Generated</div>
                <div class="text-lg font-semibold">{{ d.report.generatedAt | date: 'mediumDate' }}</div>
              </div>
            </div>
          </div>
        </header>

        <main class="max-w-6xl mx-auto px-8 py-12 space-y-12">
          <!-- Executive Summary / Intro -->
          @if (sanitizer.hasVisibleContent(introHtml())) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">01</span>
                <h2 class="text-3xl font-bold text-ink-900">Executive Summary</h2>
              </div>
              <div class="bg-white rounded-xl border-l-4 border-brand-500 border-y border-r border-ink-200 shadow-card p-7 md:p-8">
                <div class="rich-content text-lg" [innerHTML]="sanitizer.trustRichHtml(introHtml())"></div>
              </div>
            </section>
          }

          <!-- KPIs -->
          @if (hasKpis()) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">02</span>
                <h2 class="text-3xl font-bold text-ink-900">Key Metrics</h2>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                @for (k of kpiCards(); track k.key) {
                  <div class="bg-white rounded-xl p-5 border border-ink-200 shadow-card">
                    <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-2">
                      {{ k.label }}
                    </div>
                    <div class="text-3xl font-black text-ink-900 leading-none">
                      {{ formatNum(k.current) }}
                    </div>
                    @if (k.delta !== null) {
                      <div class="mt-3 flex items-center gap-2">
                        <div class="text-xs font-semibold flex items-center gap-1"
                             [class.text-positive-500]="k.good"
                             [class.text-danger-500]="!k.good">
                          <svg width="10" height="10" viewBox="0 0 10 10" *ngIf="k.delta > 0">
                            <polygon points="5,0 10,10 0,10" fill="currentColor"/>
                          </svg>
                          <svg width="10" height="10" viewBox="0 0 10 10" *ngIf="k.delta < 0">
                            <polygon points="0,0 10,0 5,10" fill="currentColor"/>
                          </svg>
                          <span>{{ k.deltaPct > 0 ? '+' : '' }}{{ k.deltaPct | number: '1.1-1' }}%</span>
                        </div>
                        <span class="text-xs text-ink-400">·</span>
                        <div class="text-xs text-ink-500">
                          vs <span class="font-semibold text-ink-700">{{ formatNum(k.previous) }}</span>
                        </div>
                      </div>
                    } @else {
                      <div class="text-xs text-ink-400 mt-3">no previous period</div>
                    }
                  </div>
                }
              </div>

              <!-- Trend chart (ApexCharts) -->
              @if (chartSeries().length && d.kpiHistory.length >= 2) {
                <div class="bg-white rounded-xl p-6 border border-ink-200 shadow-card">
                  <div class="flex items-center justify-between mb-4">
                    <div>
                      <h3 class="text-lg font-bold text-ink-900">Performance trend</h3>
                      <p class="text-xs text-ink-500 mt-0.5">Last {{ d.kpiHistory.length }} cycles</p>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      @for (m of metricToggles; track m.key) {
                        <button
                          (click)="toggleMetric(m.key)"
                          [class]="'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border transition ' +
                            (visibleMetrics().has(m.key)
                              ? 'bg-' + m.color + '-500 text-white border-' + m.color + '-500'
                              : 'bg-white text-ink-500 border-ink-200 hover:border-ink-300')">
                          {{ m.label }}
                        </button>
                      }
                    </div>
                  </div>
                  <apx-chart
                    [series]="chartSeries()"
                    [chart]="chartOpts.chart!"
                    [xaxis]="chartOpts.xaxis!"
                    [yaxis]="chartOpts.yaxis!"
                    [stroke]="chartOpts.stroke!"
                    [colors]="chartColors()"
                    [dataLabels]="chartOpts.dataLabels!"
                    [grid]="chartOpts.grid!"
                    [tooltip]="chartOpts.tooltip!"
                    [legend]="chartOpts.legend!"
                    [fill]="chartOpts.fill!"
                    [markers]="chartOpts.markers!"
                  ></apx-chart>
                </div>
              } @else if (d.kpiHistory.length < 2) {
                <div class="bg-white rounded-xl p-6 border border-ink-200 shadow-card text-center text-sm text-ink-400">
                  Need at least 2 cycles with KPIs to render the trend chart.
                </div>
              }
            </section>
          }

          <!-- Keywords / Position Tracker -->
          @if (d.keywords.length > 0) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">03</span>
                <h2 class="text-3xl font-bold text-ink-900">Search Rankings</h2>
              </div>

              <!-- Keyword distribution stats -->
              <div class="grid grid-cols-4 gap-3 mb-6">
                <div class="bg-white rounded-xl p-4 border border-ink-200 shadow-card">
                  <div class="text-[10px] uppercase tracking-wider text-ink-500">Keywords</div>
                  <div class="text-2xl font-bold text-ink-900">{{ d.keywords.length }}</div>
                </div>
                <div class="bg-positive-100 rounded-xl p-4 border border-positive-500/30">
                  <div class="text-[10px] uppercase tracking-wider text-positive-500 font-bold">Top 3</div>
                  <div class="text-2xl font-bold text-positive-500">{{ countTop(3) }}</div>
                </div>
                <div class="bg-sky-50 rounded-xl p-4 border border-sky-500/30">
                  <div class="text-[10px] uppercase tracking-wider text-sky-600 font-bold">Top 10</div>
                  <div class="text-2xl font-bold text-sky-600">{{ countTop(10) }}</div>
                </div>
                <div class="bg-white rounded-xl p-4 border border-ink-200 shadow-card">
                  <div class="text-[10px] uppercase tracking-wider text-ink-500">Avg pos.</div>
                  <div class="text-2xl font-bold text-ink-900">
                    {{ avgPosition() !== null ? (avgPosition()! | number: '1.1-1') : '—' }}
                  </div>
                </div>
              </div>

              <!-- Gainers vs Losers -->
              @if (d.movements.gainers.length || d.movements.losers.length) {
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  <div class="bg-white rounded-xl border border-ink-200 shadow-card overflow-hidden">
                    <div class="bg-positive-100 px-5 py-3 border-b border-positive-500/20">
                      <h3 class="font-bold text-positive-500 text-sm flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 10 10"><polygon points="5,0 10,10 0,10" fill="currentColor"/></svg>
                        Improved position
                      </h3>
                    </div>
                    <div class="p-2">
                      @for (g of d.movements.gainers; track $index) {
                        <div class="flex items-center justify-between px-3 py-2 hover:bg-ink-50 rounded-md">
                          <span class="font-medium text-ink-900 text-sm truncate">{{ g.keyword.text }}</span>
                          <div class="flex items-center gap-3 text-xs flex-shrink-0">
                            <span class="text-positive-500 font-bold">+{{ g.delta }}</span>
                            <span class="text-ink-500">→ pos {{ g.keyword.currentPosition }}</span>
                          </div>
                        </div>
                      } @empty {
                        <div class="text-sm text-ink-400 italic p-4 text-center">No gainers</div>
                      }
                    </div>
                  </div>

                  <div class="bg-white rounded-xl border border-ink-200 shadow-card overflow-hidden">
                    <div class="bg-danger-100 px-5 py-3 border-b border-danger-500/20">
                      <h3 class="font-bold text-danger-500 text-sm flex items-center gap-2">
                        <svg width="12" height="12" viewBox="0 0 10 10"><polygon points="0,0 10,0 5,10" fill="currentColor"/></svg>
                        Dropped position
                      </h3>
                    </div>
                    <div class="p-2">
                      @for (l of d.movements.losers; track $index) {
                        <div class="flex items-center justify-between px-3 py-2 hover:bg-ink-50 rounded-md">
                          <span class="font-medium text-ink-900 text-sm truncate">{{ l.keyword.text }}</span>
                          <div class="flex items-center gap-3 text-xs flex-shrink-0">
                            <span class="text-danger-500 font-bold">−{{ Math.abs(l.delta) }}</span>
                            <span class="text-ink-500">→ pos {{ l.keyword.currentPosition }}</span>
                          </div>
                        </div>
                      } @empty {
                        <div class="text-sm text-ink-400 italic p-4 text-center">
                          No keyword dropped. Great signal.
                        </div>
                      }
                    </div>
                  </div>
                </div>
              }

              <!-- Full keywords table -->
              <div class="bg-white rounded-xl border border-ink-200 shadow-card overflow-hidden">
                <div class="px-5 py-3 border-b border-ink-200 bg-ink-50">
                  <h3 class="font-bold text-ink-900 text-sm">All tracked keywords</h3>
                </div>
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500">
                      <th class="text-left px-5 py-2.5 font-semibold">Keyword</th>
                      <th class="text-left px-3 py-2.5 font-semibold">Group</th>
                      <th class="text-right px-3 py-2.5 font-semibold">Vol.</th>
                      <th class="text-center px-3 py-2.5 font-semibold">Position</th>
                      <th class="text-left px-5 py-2.5 font-semibold">Ranking URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (k of sortedKeywords(); track $index) {
                      <tr class="border-b border-ink-100 hover:bg-ink-50">
                        <td class="px-5 py-3 font-medium text-ink-900">{{ k.text }}</td>
                        <td class="px-3 py-3 text-xs text-ink-500">{{ k.group || '—' }}</td>
                        <td class="px-3 py-3 text-right text-ink-500">{{ k.volume || '—' }}</td>
                        <td class="px-3 py-3 text-center">
                          @if (k.currentPosition !== undefined && k.currentPosition !== null) {
                            <span class="inline-flex items-center justify-center min-w-[36px] px-2 py-1 rounded-md font-bold"
                                  [ngClass]="positionBadgeClass(k.currentPosition)">
                              {{ k.currentPosition }}
                            </span>
                          } @else {
                            <span class="text-ink-400">—</span>
                          }
                        </td>
                        <td class="px-5 py-3 text-xs text-ink-500 truncate max-w-xs">
                          {{ k.currentRankingUrl || '—' }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          <!-- Actions taken -->
          @if (completedTasks().length > 0) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">04</span>
                <h2 class="text-3xl font-bold text-ink-900">Actions Taken</h2>
              </div>
              <p class="text-ink-500 mb-5">
                <strong class="text-ink-900">{{ completedTasks().length }}</strong>
                SEO actions executed in this period, organized by category.
              </p>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                @for (t of completedTasks(); track $index) {
                  <article class="bg-white rounded-xl border border-ink-200 shadow-card flex gap-3 p-4">
                    <div class="w-1 rounded-full flex-shrink-0" [ngClass]="categoryBarClass(t.category)"></div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1.5">
                        <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                              [ngClass]="categoryBadgeClass(t.category)">
                          {{ t.category }}
                        </span>
                      </div>
                      <h3 class="font-semibold text-ink-900 text-sm leading-snug">{{ t.title }}</h3>
                      @if (t.description) {
                        <div class="rich-content text-xs text-ink-500 mt-1 leading-relaxed"
                             [innerHTML]="sanitizer.trustRichHtml(t.description)"></div>
                      }
                      @if (t.notes) {
                        <div class="text-xs text-ink-700 mt-1 italic">{{ t.notes }}</div>
                      }

                      <!-- Compact attachments row -->
                      @if (t.attachments && t.attachments.length) {
                        <div class="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-ink-100">
                          @for (a of t.attachments; track a.publicId) {
                            <button (click)="publicLightbox.set(a)"
                                    class="relative group block w-12 h-12 rounded border border-ink-200 overflow-hidden hover:border-brand-500 hover:shadow-md transition"
                                    [title]="a.caption || (a.label !== 'other' ? (a.label | titlecase) : 'Open')">
                              <img [src]="a.thumbnailUrl || a.url" [alt]="a.caption"
                                   class="w-full h-full object-cover" />
                              @if (a.label && a.label !== 'other') {
                                <span class="absolute -top-1 -right-1 text-[8px] font-bold px-1 py-0.5 rounded-sm uppercase tracking-wider shadow-sm"
                                      [class]="attachmentLabelClass(a.label)">
                                  {{ a.label }}
                                </span>
                              }
                            </button>
                          }
                          <span class="text-[10px] text-ink-400 ml-1">Click to enlarge</span>
                        </div>
                      }
                    </div>
                  </article>
                }
              </div>
            </section>
          }

          <!-- Next period plan -->
          @if (plannedTasks().length > 0) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">05</span>
                <h2 class="text-3xl font-bold text-ink-900">Next Period Plan</h2>
              </div>
              <div class="space-y-2">
                @for (t of plannedTasks(); track $index) {
                  <div class="bg-white rounded-lg p-4 border border-ink-200 shadow-card flex items-center gap-3">
                    <span class="text-[10px] uppercase font-bold px-2 py-1 rounded flex-shrink-0"
                          [ngClass]="priorityBadgeClass(t.priority)">
                      {{ priorityLabel(t.priority) }}
                    </span>
                    <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded flex-shrink-0"
                          [ngClass]="categoryBadgeClass(t.category)">
                      {{ t.category }}
                    </span>
                    <span class="font-medium text-ink-800 text-sm flex-1">{{ t.title }}</span>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Backlinks -->
          @if (d.backlinks.total > 0) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">06</span>
                <h2 class="text-3xl font-bold text-ink-900">Backlinks Profile</h2>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-white rounded-xl p-5 border border-ink-200 shadow-card">
                  <div class="text-[10px] uppercase tracking-wider text-ink-500 font-bold">Total backlinks</div>
                  <div class="text-3xl font-black text-ink-900 mt-1">{{ d.backlinks.total }}</div>
                </div>
                <div class="bg-positive-100 rounded-xl p-5 border border-positive-500/30">
                  <div class="text-[10px] uppercase tracking-wider text-positive-500 font-bold">Dofollow</div>
                  <div class="text-3xl font-black text-positive-500 mt-1">{{ d.backlinks.dofollow }}</div>
                </div>
                @for (s of d.backlinks.perStatus; track s._id) {
                  <div class="bg-white rounded-xl p-5 border border-ink-200 shadow-card">
                    <div class="text-[10px] uppercase tracking-wider text-ink-500 font-bold capitalize">
                      {{ s._id }}
                    </div>
                    <div class="text-3xl font-black text-ink-900 mt-1">{{ s.count }}</div>
                    @if (s.avgDr) {
                      <div class="text-[10px] text-ink-500 mt-1">Avg DR: {{ s.avgDr | number: '1.0-0' }}</div>
                    }
                  </div>
                }
              </div>
            </section>
          }

          <!-- Pending from client -->
          @if (sanitizer.hasVisibleContent(d.report.clientBlockers)) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">07</span>
                <h2 class="text-3xl font-bold text-ink-900">Pending from your side</h2>
              </div>
              <div class="bg-warning-100 border-l-4 border-warning-500 rounded-xl p-6">
                <div class="rich-content text-ink-800" [innerHTML]="sanitizer.trustRichHtml(d.report.clientBlockers)"></div>
              </div>
            </section>
          }

          <!-- Final Considerations -->
          @if (sanitizer.hasVisibleContent(d.report.finalConsiderations)) {
            <section>
              <div class="flex items-center gap-3 mb-5">
                <span class="text-xs font-bold uppercase tracking-[0.2em] text-brand-500">08</span>
                <h2 class="text-3xl font-bold text-ink-900">Final considerations</h2>
              </div>
              <div class="bg-white rounded-xl border border-ink-200 shadow-card p-7 md:p-8">
                <div class="rich-content text-ink-800" [innerHTML]="sanitizer.trustRichHtml(d.report.finalConsiderations)"></div>
              </div>
            </section>
          }
        </main>

        <!-- Public lightbox for task attachments -->
        @if (publicLightbox(); as a) {
          <div class="fixed inset-0 bg-ink-900/90 z-50 flex items-center justify-center p-6"
               (click)="publicLightbox.set(null)">
            <div class="relative max-w-5xl w-full" (click)="$event.stopPropagation()">
              <img [src]="a.url" [alt]="a.caption"
                   class="w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
              <button (click)="publicLightbox.set(null)"
                      class="absolute top-2 right-2 w-9 h-9 rounded-full bg-ink-900/80 text-white hover:bg-ink-900 flex items-center justify-center text-lg">
                ×
              </button>
              @if (a.label || a.caption) {
                <div class="absolute bottom-0 left-0 right-0 bg-ink-900/90 backdrop-blur rounded-b-lg px-5 py-3 flex items-center gap-3 text-white">
                  @if (a.label && a.label !== 'other') {
                    <span class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded"
                          [class]="attachmentLabelClass(a.label)">
                      {{ a.label }}
                    </span>
                  }
                  @if (a.caption) {
                    <span class="text-sm">{{ a.caption }}</span>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- Footer with download CTA -->
        <footer class="bg-ink-900 text-white">
          <div class="max-w-6xl mx-auto px-8 py-12">
            <div class="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <div class="text-2xl font-bold mb-2">Want this report as a file?</div>
                <p class="text-white/60 text-sm">Download the PDF version to save or print it.</p>
              </div>
              <button (click)="downloadPdf()" [disabled]="downloading()"
                      class="bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 rounded-md font-semibold transition flex items-center gap-2 disabled:opacity-50">
                @if (downloading()) {
                  <span class="spinner"></span>
                  Generating…
                } @else {
                  <span>⬇</span>
                  Download PDF
                }
              </button>
            </div>
            <div class="border-t border-white/10 mt-10 pt-6 flex items-center justify-between text-xs text-white/50">
              <div>
                Prepared by <strong class="text-white">Joseph O.</strong> · Media Spearhead
              </div>
              <div>
                © {{ year() }} Media Spearhead
              </div>
            </div>
          </div>
        </footer>
      </div>
    }
  `,
})
export class PublicReportComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private svc = inject(ReportsService);
  protected sanitizer = inject(SanitizerService);

  loading = signal(true);
  error = signal<string | null>(null);
  data = signal<PublicPayload | null>(null);
  downloading = signal(false);
  publicLightbox = signal<TaskAttachmentPayload | null>(null);
  visibleMetrics = signal<Set<string>>(new Set(['organicSessions', 'clicks']));
  Math = Math;

  // PIN unlock state
  locked = signal(false);
  meta = signal<{ client: { name: string; url: string; industry?: string }; cycle: { label: string; startDate: string; endDate: string } } | null>(null);
  pinDigits: string[] = ['', '', '', '', '', ''];
  pinError = signal<string | null>(null);
  unlocking = signal(false);
  unlockToken: string | null = null;

  metricToggles = [
    { key: 'organicSessions', label: 'Sessions', color: 'brand' },
    { key: 'impressions', label: 'Impressions', color: 'sky' },
    { key: 'clicks', label: 'Clicks', color: 'ink' },
    { key: 'ctr', label: 'CTR', color: 'positive' },
    { key: 'conversions', label: 'Conv.', color: 'warning' },
  ];

  private metricColors: Record<string, string> = {
    organicSessions: '#FF7A59',
    impressions: '#0EA5E9',
    clicks: '#0F172A',
    ctr: '#16A34A',
    conversions: '#D97706',
  };

  kpiFields = [
    { key: 'organicSessions', label: 'Organic sessions', inverse: false },
    { key: 'impressions', label: 'Impressions', inverse: false },
    { key: 'clicks', label: 'Clicks', inverse: false },
    { key: 'ctr', label: 'CTR (%)', inverse: false },
    { key: 'avgPosition', label: 'Avg position', inverse: true },
    { key: 'conversions', label: 'Conversions', inverse: false },
    { key: 'indexedPages', label: 'Indexed pages', inverse: false },
    { key: 'gbpSearches', label: 'GBP searches', inverse: false },
    { key: 'gbpCalls', label: 'GBP calls', inverse: false },
    { key: 'gbpDirections', label: 'GBP directions', inverse: false },
    { key: 'gbpWebsiteClicks', label: 'GBP website clicks', inverse: false },
    { key: 'gbpReviews', label: 'GBP reviews', inverse: false },
  ];

  year = () => new Date().getFullYear();

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Invalid link');
      this.loading.set(false);
      return;
    }
    this.svc.publicMeta(token).subscribe({
      next: (m) => {
        this.meta.set({ client: m.client, cycle: m.cycle });
        if (!m.locked) {
          // Legacy link without PIN — unlock with empty pin to get pdf token + payload.
          this.svc.publicUnlock(token, '').subscribe({
            next: (res) => {
              this.applyUnlocked(token, res);
              this.loading.set(false);
            },
            error: (err) => {
              this.error.set(err?.error?.message || "We couldn't load the report");
              this.loading.set(false);
            },
          });
          return;
        }
        // Locked report: try to resume from saved 24h session before showing the PIN gate.
        const stored = this.readStoredSession(token);
        if (stored) {
          this.svc.publicResume(token, stored).subscribe({
            next: (res) => {
              this.applyUnlocked(token, res);
              this.loading.set(false);
            },
            error: () => {
              this.clearStoredSession(token);
              this.locked.set(true);
              this.loading.set(false);
              setTimeout(() => this.focusFirstPin(), 50);
            },
          });
          return;
        }
        this.locked.set(true);
        this.loading.set(false);
        setTimeout(() => this.focusFirstPin(), 50);
      },
      error: (err) => {
        this.error.set(err?.error?.message || "We couldn't load the report");
        this.loading.set(false);
      },
    });
  }

  private applyUnlocked(
    token: string,
    res: { pdfUnlockToken: string; sessionToken?: string; payload: PublicPayload },
  ) {
    this.unlockToken = res.pdfUnlockToken;
    this.data.set(res.payload);
    this.locked.set(false);
    if (res.sessionToken) this.writeStoredSession(token, res.sessionToken);
  }

  private sessionStorageKey(token: string) {
    return `report-session:${token}`;
  }

  private readStoredSession(token: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    const jwt = localStorage.getItem(this.sessionStorageKey(token));
    if (!jwt) return null;
    const exp = this.readJwtExp(jwt);
    if (exp && exp <= Date.now()) {
      this.clearStoredSession(token);
      return null;
    }
    return jwt;
  }

  private writeStoredSession(token: string, jwt: string) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.sessionStorageKey(token), jwt);
    } catch {
      /* storage full or disabled — ignore */
    }
  }

  private clearStoredSession(token: string) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(this.sessionStorageKey(token));
    } catch {
      /* ignore */
    }
  }

  private readJwtExp(jwt: string): number | null {
    try {
      const part = jwt.split('.')[1];
      if (!part) return null;
      const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(json) as { exp?: number };
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  // --- PIN entry handlers ---------------------------------------------------
  private focusFirstPin() {
    const el = document.querySelector<HTMLInputElement>('[data-pin-input="0"]');
    el?.focus();
  }

  onPinInput(i: number, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '');
    this.pinDigits[i] = v.slice(-1) || '';
    input.value = this.pinDigits[i];
    if (this.pinDigits[i] && i < 5) {
      const next = document.querySelector<HTMLInputElement>(`[data-pin-input="${i + 1}"]`);
      next?.focus();
    }
    if (this.pinDigits.every((d) => d.length === 1)) {
      this.submitPin();
    }
  }

  onPinKeydown(i: number, ev: KeyboardEvent) {
    if (ev.key === 'Backspace' && !this.pinDigits[i] && i > 0) {
      const prev = document.querySelector<HTMLInputElement>(`[data-pin-input="${i - 1}"]`);
      prev?.focus();
    }
  }

  onPinPaste(ev: ClipboardEvent) {
    const text = ev.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length) {
      ev.preventDefault();
      for (let i = 0; i < 6; i++) this.pinDigits[i] = digits[i] || '';
      const lastIdx = Math.min(digits.length, 5);
      document
        .querySelector<HTMLInputElement>(`[data-pin-input="${lastIdx}"]`)
        ?.focus();
      if (digits.length === 6) this.submitPin();
    }
  }

  pinComplete(): boolean {
    return this.pinDigits.every((d) => d.length === 1);
  }

  submitPin() {
    if (this.unlocking()) return;
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) return;
    const pin = this.pinDigits.join('');
    if (pin.length !== 6) {
      this.pinError.set('Enter all 6 digits.');
      return;
    }
    this.unlocking.set(true);
    this.pinError.set(null);
    this.svc.publicUnlock(token, pin).subscribe({
      next: (res) => {
        this.applyUnlocked(token, res);
        this.unlocking.set(false);
      },
      error: (err) => {
        this.unlocking.set(false);
        this.pinError.set(err?.error?.message || 'Incorrect PIN. Try again.');
        this.pinDigits = ['', '', '', '', '', ''];
        setTimeout(() => this.focusFirstPin(), 50);
      },
    });
  }

  toggleMetric(key: string) {
    const set = new Set(this.visibleMetrics());
    if (set.has(key)) {
      if (set.size > 1) set.delete(key);
    } else {
      set.add(key);
    }
    this.visibleMetrics.set(set);
  }

  chartSeries = (): { name: string; data: Array<number | null> }[] => {
    const d = this.data();
    if (!d) return [];
    const visible = this.visibleMetrics();
    return this.metricToggles
      .filter((m) => visible.has(m.key))
      .map((m) => ({
        name: m.label,
        data: d.kpiHistory.map(
          (h) => (h.kpis?.[m.key] as number | undefined) ?? null,
        ),
      }));
  };

  chartColors = (): string[] => {
    const visible = this.visibleMetrics();
    return this.metricToggles
      .filter((m) => visible.has(m.key))
      .map((m) => this.metricColors[m.key]);
  };

  get chartOpts(): Partial<ApexOptions> {
    const d = this.data();
    const labels = d ? d.kpiHistory.map((h) => h.cycleLabel || '') : [];
    return {
      chart: {
        type: 'area',
        height: 320,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: 'Inter, system-ui, sans-serif',
        animations: { enabled: true, speed: 600 },
      },
      stroke: { curve: 'smooth', width: 3 },
      dataLabels: { enabled: false },
      grid: {
        borderColor: '#F0F2F5',
        strokeDashArray: 4,
        padding: { top: 0, right: 8, bottom: 0, left: 8 },
      },
      xaxis: {
        categories: labels,
        labels: { style: { colors: '#6B7280', fontSize: '11px', fontWeight: 600 } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: '#6B7280', fontSize: '11px' },
          formatter: (v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`,
        },
      },
      tooltip: { theme: 'light', y: { formatter: (v: number) => v?.toLocaleString('en-US') } },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        markers: { size: 6 },
      },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.35,
          opacityTo: 0.05,
          stops: [0, 95, 100],
        },
      },
      markers: {
        size: 4,
        strokeWidth: 2,
        strokeColors: '#FFFFFF',
        hover: { size: 7 },
      },
    };
  }

  introText(): string {
    const raw = this.data()?.report.executiveSummary;
    if (!raw) return '';
    if (Array.isArray(raw)) return raw.join(' ');
    return raw;
  }

  introHtml(): string {
    const raw = this.data()?.report.executiveSummary;
    if (!raw) return '';
    if (Array.isArray(raw)) return raw.map((s) => `<p>${s}</p>`).join('');
    return raw;
  }

  hasKpis(): boolean {
    const d = this.data();
    if (!d) return false;
    return Object.values(d.report.kpis || {}).some((v) => typeof v === 'number');
  }

  kpiCards() {
    const d = this.data();
    if (!d) return [];
    return this.kpiFields
      .filter((f) => d.report.kpis?.[f.key] !== undefined)
      .map((f) => {
        const current = d.report.kpis?.[f.key];
        const previous = d.report.kpisPrevious?.[f.key];
        let delta: number | null = null;
        let deltaPct = 0;
        let good = true;
        if (typeof current === 'number' && typeof previous === 'number' && previous !== 0) {
          delta = current - previous;
          deltaPct = (delta / previous) * 100;
          const up = current > previous;
          good = f.inverse ? !up : up;
        }
        return { key: f.key, label: f.label, current, previous, delta, deltaPct, good };
      });
  }

  sortedKeywords() {
    const d = this.data();
    if (!d) return [];
    return [...d.keywords].sort(
      (a, b) => (a.currentPosition ?? 999) - (b.currentPosition ?? 999),
    );
  }

  countTop(n: number): number {
    const d = this.data();
    if (!d) return 0;
    return d.keywords.filter(
      (k) => typeof k.currentPosition === 'number' && k.currentPosition <= n,
    ).length;
  }

  avgPosition(): number | null {
    const d = this.data();
    if (!d) return null;
    const ranked = d.keywords.filter((k) => typeof k.currentPosition === 'number');
    if (!ranked.length) return null;
    return ranked.reduce((a, k) => a + (k.currentPosition || 0), 0) / ranked.length;
  }

  completedTasks() {
    return this.data()?.tasks.filter((t) => t.status === 'completed') || [];
  }

  plannedTasks() {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (this.data()?.tasks || [])
      .filter((t) => t.status !== 'completed')
      .sort((a, b) => (order[a.priority] || 9) - (order[b.priority] || 9));
  }

  formatNum(n: number | undefined): string {
    if (n === undefined || n === null) return '—';
    if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(2);
  }

  positionBadgeClass(pos: number): string {
    if (pos <= 3) return 'bg-positive-100 text-positive-500';
    if (pos <= 10) return 'bg-sky-50 text-sky-600';
    if (pos <= 20) return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-700';
  }

  categoryBarClass(cat: string): string {
    const map: Record<string, string> = {
      technical: 'bg-ink-900',
      onpage: 'bg-sky-500',
      content: 'bg-brand-500',
      offpage: 'bg-warning-500',
      'local-gbp': 'bg-positive-500',
      monitoring: 'bg-ink-500',
      reporting: 'bg-purple-500',
    };
    return map[cat] || 'bg-ink-300';
  }

  categoryBadgeClass(cat: string): string {
    const map: Record<string, string> = {
      technical: 'bg-ink-100 text-ink-900',
      onpage: 'bg-sky-50 text-sky-600',
      content: 'bg-brand-50 text-brand-700',
      offpage: 'bg-warning-100 text-warning-500',
      'local-gbp': 'bg-positive-100 text-positive-500',
      monitoring: 'bg-ink-100 text-ink-700',
      reporting: 'bg-purple-100 text-purple-700',
    };
    return map[cat] || 'bg-ink-100 text-ink-700';
  }

  priorityBadgeClass(p: string): string {
    if (p === 'high') return 'bg-danger-100 text-danger-500';
    if (p === 'medium') return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-500';
  }

  attachmentLabelClass(label: string): string {
    if (label === 'before') return 'bg-warning-100 text-warning-500';
    if (label === 'after') return 'bg-positive-100 text-positive-500';
    return 'bg-ink-100 text-ink-700';
  }

  priorityLabel(p: string): string {
    if (p === 'high') return 'High';
    if (p === 'medium') return 'Medium';
    return 'Low';
  }

  downloadPdf() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token || !this.unlockToken) return;
    this.downloading.set(true);
    const popup = window.open('about:blank', '_blank');
    this.svc.publicPdfBlob(token, this.unlockToken).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (popup) popup.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.downloading.set(false);
      },
      error: (err) => {
        if (popup) popup.close();
        // 401 means the 5-min PDF unlock expired.
        if (err?.status !== 401) {
          this.downloading.set(false);
          return;
        }
        // If we still hold a valid 24h session, transparently refresh the PDF
        // unlock token and retry the download without asking for the PIN again.
        const session = this.readStoredSession(token);
        if (!session) {
          this.downloading.set(false);
          this.unlockToken = null;
          this.data.set(null);
          this.locked.set(true);
          setTimeout(() => this.focusFirstPin(), 50);
          return;
        }
        this.svc.publicResume(token, session).subscribe({
          next: (res) => {
            this.applyUnlocked(token, res);
            const popup2 = window.open('about:blank', '_blank');
            this.svc.publicPdfBlob(token, res.pdfUnlockToken).subscribe({
              next: (blob) => {
                const url = URL.createObjectURL(blob);
                if (popup2) popup2.location.href = url;
                else window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                this.downloading.set(false);
              },
              error: () => {
                this.downloading.set(false);
                if (popup2) popup2.close();
              },
            });
          },
          error: () => {
            this.downloading.set(false);
            this.clearStoredSession(token);
            this.unlockToken = null;
            this.data.set(null);
            this.locked.set(true);
            setTimeout(() => this.focusFirstPin(), 50);
          },
        });
      },
    });
  }
}
