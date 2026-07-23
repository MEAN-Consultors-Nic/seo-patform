import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import type { ApexOptions } from 'ng-apexcharts';
import {
  GoogleIntegrationsService,
  GscDrillDimension,
  GscFilter,
  GscSearchType,
  GscTimeseriesResponse,
  GscTimeseriesRow,
  GscTopForDateResponse,
  GscTopValueRow,
} from '../../../core/google-integrations.service';
import { countryDisplayName } from '../../../shared/country-names';

type Preset = '7d' | '28d' | '3m' | 'custom';

interface KpiCard {
  key: 'clicks' | 'impressions' | 'ctr' | 'position';
  label: string;
  color: string;
  active: boolean;
  yaxis: 'left' | 'right';
  format: (n: number) => string;
}

/**
 * GSC console-style performance chart. Mirrors the top-of-dashboard
 * panel in Search Console: timeframe pills, search-type dropdown,
 * optional query/page/country/device filters, 4 toggleable KPI
 * cards, and a dual-axis daily line chart. Clicking a point in the
 * chart opens a drill-down modal with the top queries / pages /
 * countries / devices for that day.
 */
@Component({
  selector: 'app-gsc-performance-chart',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe, NgApexchartsModule],
  template: `
    <div class="card space-y-3">
      <!-- Header + timeframe -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-ink-900">Performance</h3>
          <p class="text-[11px] text-ink-500">
            Daily clicks · impressions · CTR · avg position from Search Console.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="inline-flex rounded-md border border-ink-200 p-0.5 bg-white">
            @for (p of presets; track p.key) {
              <button type="button"
                      class="px-2.5 py-1 text-[11px] font-semibold rounded transition"
                      [class.bg-ink-900]="preset() === p.key"
                      [class.text-white]="preset() === p.key"
                      [class.text-ink-600]="preset() !== p.key"
                      [class.hover:text-ink-900]="preset() !== p.key"
                      (click)="setPreset(p.key)">
                {{ p.label }}
              </button>
            }
          </div>
          <select class="input input-sm w-32"
                  [ngModel]="searchType()"
                  (ngModelChange)="setSearchType($event)">
            <option value="web">Web</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="news">News</option>
            <option value="discover">Discover</option>
          </select>
        </div>
      </div>

      @if (preset() === 'custom') {
        <div class="flex items-center gap-2">
          <input type="date" class="input input-sm" [ngModel]="from()" (ngModelChange)="from.set($event); load()" />
          <span class="text-ink-400 text-sm">→</span>
          <input type="date" class="input input-sm" [ngModel]="to()" (ngModelChange)="to.set($event); load()" />
        </div>
      }

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-1.5">
        @for (f of filters(); track $index) {
          <span class="inline-flex items-center gap-1 px-2 py-1 rounded bg-ink-100 text-xs">
            <span class="font-semibold text-ink-700">{{ f.dimension }}</span>
            <span class="text-ink-500">{{ f.operator || 'contains' }}</span>
            <span class="text-ink-900">"{{ f.expression }}"</span>
            <button type="button"
                    class="ml-1 text-ink-400 hover:text-danger-500 leading-none"
                    (click)="removeFilter($index)">×</button>
          </span>
        }
        <button type="button"
                class="text-[11px] font-semibold px-2 py-1 rounded border border-dashed border-ink-300 text-ink-500 hover:border-brand-500 hover:text-brand-500"
                (click)="openFilterModal()">
          + Add filter
        </button>
      </div>

      <!-- KPI cards (toggleable) -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        @for (k of kpis(); track k.key) {
          <button type="button"
                  class="text-left rounded-lg border-2 px-3 py-2 transition"
                  [class.bg-white]="!k.active"
                  [class.border-ink-200]="!k.active"
                  [style.borderColor]="k.active ? k.color : ''"
                  [style.background]="k.active ? k.color + '15' : ''"
                  (click)="toggleKpi(k.key)">
            <div class="flex items-center gap-1.5">
              <span class="w-3 h-3 rounded-sm inline-block"
                    [style.background]="k.active ? k.color : '#D1D5DB'"></span>
              <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-500">
                {{ k.label }}
              </span>
            </div>
            <div class="text-lg font-bold text-ink-900 mt-0.5">
              {{ kpiValue(k.key) }}
            </div>
          </button>
        }
      </div>

      @if (error()) {
        <div class="text-xs text-danger-500 border-l-4 border-danger-500 bg-danger-100/30 px-3 py-2">
          {{ error() }}
        </div>
      }

      @if (loading()) {
        <div class="py-16 text-center text-sm text-ink-400 italic">
          Loading…
        </div>
      } @else if (data() && (data()?.rows?.length || 0) > 0) {
        <div class="min-h-[320px]">
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
        </div>
      } @else if (data()) {
        <div class="py-16 text-center text-sm text-ink-400 italic">
          No data for this range. Search Console usually lags 2-3 days.
        </div>
      }
    </div>

    <!-- Add filter modal -->
    @if (filterModalOpen()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="filterModalOpen.set(false)">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-5 max-h-[85vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <h4 class="text-base font-bold text-ink-900 mb-3">Add filter</h4>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label class="label">Dimension</label>
              <select class="input input-sm"
                      [ngModel]="filterDraft.dimension"
                      (ngModelChange)="onFilterDimensionChange($event)">
                <option value="query">Query</option>
                <option value="page">Page</option>
                <option value="country">Country</option>
                <option value="device">Device</option>
              </select>
            </div>
            <div>
              <label class="label">Operator</label>
              <select class="input input-sm" [(ngModel)]="filterDraft.operator">
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="notContains">does not contain</option>
                <option value="notEquals">does not equal</option>
              </select>
            </div>
          </div>

          <!-- Value input branches by dimension. Enumerable dimensions
               (country / device) get a picker of values that actually
               show up in the client's data — same UX as GSC console's
               own Country filter. Free-text dimensions (query / page)
               keep the input field. -->
          <label class="label">Value</label>

          @if (filterDraft.dimension === 'country') {
            @if (topValuesLoading()) {
              <div class="text-xs text-ink-500 italic py-3 text-center">
                Loading countries with impressions…
              </div>
            } @else if (topValues().length === 0) {
              <div class="text-xs text-ink-400 italic py-3 text-center">
                No country data for the current range. Try widening the timeframe.
              </div>
            } @else {
              <div class="border border-ink-200 rounded-md max-h-64 overflow-y-auto">
                @for (v of topValues(); track v.key) {
                  <label class="flex items-center justify-between px-3 py-1.5 hover:bg-ink-50 cursor-pointer border-b border-ink-100 last:border-0">
                    <span class="flex items-center gap-2">
                      <input type="radio" name="countryPick"
                             [value]="v.key"
                             [checked]="filterDraft.expression === v.key"
                             (change)="filterDraft.expression = v.key" />
                      <span class="text-sm text-ink-900">
                        {{ countryName(v.key) }}
                        <span class="text-[10px] text-ink-400 font-mono ml-1">{{ v.key.toUpperCase() }}</span>
                      </span>
                    </span>
                    <span class="text-[10px] text-ink-500 font-semibold">
                      {{ v.impressions | number }} impr
                    </span>
                  </label>
                }
              </div>
            }
          } @else if (filterDraft.dimension === 'device') {
            <div class="border border-ink-200 rounded-md">
              @for (d of deviceOptions; track d.value) {
                <label class="flex items-center px-3 py-2 hover:bg-ink-50 cursor-pointer border-b border-ink-100 last:border-0">
                  <input type="radio" name="devicePick"
                         [value]="d.value"
                         [checked]="filterDraft.expression === d.value"
                         (change)="filterDraft.expression = d.value" />
                  <span class="ml-2 text-sm text-ink-900">{{ d.label }}</span>
                </label>
              }
            </div>
          } @else {
            <input class="input input-sm w-full"
                   [(ngModel)]="filterDraft.expression"
                   placeholder="e.g. brand name, /pricing, /blog/…"
                   (keyup.enter)="commitFilter()" />
            <div class="text-[11px] text-ink-500 mt-1 leading-tight">
              @if (filterDraft.dimension === 'query') {
                Matches the search query text (case-insensitive substring by default).
              } @else {
                Matches the URL path or full URL of the page.
              }
            </div>
          }

          <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-ink-100">
            <button class="btn-secondary text-xs" (click)="filterModalOpen.set(false)">Cancel</button>
            <button class="btn-primary text-xs"
                    [disabled]="!filterDraft.expression"
                    (click)="commitFilter()">
              Add filter
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Drill-down modal -->
    @if (drillDown(); as dd) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="drillDown.set(null)">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 max-h-[85vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h4 class="text-base font-bold text-ink-900">Top for {{ dd.date | date: 'mediumDate' }}</h4>
              <p class="text-[11px] text-ink-500">Click a dimension to switch grouping.</p>
            </div>
            <button (click)="drillDown.set(null)"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="inline-flex rounded-md border border-ink-200 p-0.5 bg-white mb-3">
            @for (dim of dimensions; track dim.key) {
              <button type="button"
                      class="px-2.5 py-1 text-[11px] font-semibold rounded transition"
                      [class.bg-ink-900]="drillDimension() === dim.key"
                      [class.text-white]="drillDimension() === dim.key"
                      [class.text-ink-600]="drillDimension() !== dim.key"
                      (click)="setDrillDimension(dim.key, dd.date)">
                {{ dim.label }}
              </button>
            }
          </div>

          @if (drillLoading()) {
            <div class="py-8 text-center text-sm text-ink-400 italic">Loading…</div>
          } @else if (drillDown()?.rows?.length) {
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="text-[10px] uppercase tracking-wider text-ink-500 border-b border-ink-200">
                  <tr>
                    <th class="text-left py-1.5">{{ drillDimensionLabel() }}</th>
                    <th class="text-right py-1.5 w-16">Clicks</th>
                    <th class="text-right py-1.5 w-20">Impr.</th>
                    <th class="text-right py-1.5 w-16">CTR</th>
                    <th class="text-right py-1.5 w-16">Pos</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-ink-100">
                  @for (row of drillDown()?.rows; track row.key) {
                    <tr class="hover:bg-ink-50">
                      <td class="py-1.5 text-xs text-ink-700 truncate max-w-md" [title]="row.key">
                        {{ row.key }}
                      </td>
                      <td class="text-right py-1.5 text-xs font-semibold text-ink-900">{{ row.clicks | number }}</td>
                      <td class="text-right py-1.5 text-xs text-ink-700">{{ row.impressions | number }}</td>
                      <td class="text-right py-1.5 text-xs text-ink-700">{{ row.ctr | number: '1.0-1' }}%</td>
                      <td class="text-right py-1.5 text-xs text-ink-700">{{ row.position | number: '1.0-1' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="py-8 text-center text-sm text-ink-400 italic">
              No rows for this day.
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class GscPerformanceChartComponent implements OnChanges {
  @Input({ required: true }) clientId!: string;

  private svc = inject(GoogleIntegrationsService);

  readonly presets: { key: Preset; label: string }[] = [
    { key: '7d', label: '7d' },
    { key: '28d', label: '28d' },
    { key: '3m', label: '3m' },
    { key: 'custom', label: 'Custom' },
  ];
  readonly dimensions: { key: GscDrillDimension; label: string }[] = [
    { key: 'query', label: 'Query' },
    { key: 'page', label: 'Page' },
    { key: 'country', label: 'Country' },
    { key: 'device', label: 'Device' },
  ];

  preset = signal<Preset>('3m');
  searchType = signal<GscSearchType>('web');
  from = signal<string>('');
  to = signal<string>('');
  filters = signal<GscFilter[]>([]);
  data = signal<GscTimeseriesResponse | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);

  filterModalOpen = signal(false);
  filterDraft: GscFilter = {
    dimension: 'query',
    operator: 'contains',
    expression: '',
  };

  // Enumerable dimension picker state. Country populates from GSC on
  // demand; device is a fixed short list because Google publishes
  // exactly three (DESKTOP / MOBILE / TABLET) and the endpoint would
  // return the same three every time.
  topValues = signal<GscTopValueRow[]>([]);
  topValuesLoading = signal(false);
  readonly deviceOptions: { value: string; label: string }[] = [
    { value: 'DESKTOP', label: '🖥️  Desktop' },
    { value: 'MOBILE', label: '📱  Mobile' },
    { value: 'TABLET', label: '💻  Tablet' },
  ];

  countryName(code: string): string {
    return countryDisplayName(code);
  }

  drillDown = signal<GscTopForDateResponse | null>(null);
  drillDimension = signal<GscDrillDimension>('query');
  drillLoading = signal(false);

  kpis = signal<KpiCard[]>([
    {
      key: 'clicks',
      label: 'Total clicks',
      color: '#1E40AF',
      active: true,
      yaxis: 'left',
      format: (n) => this.formatK(n),
    },
    {
      key: 'impressions',
      label: 'Total impressions',
      color: '#6D28D9',
      active: true,
      yaxis: 'right',
      format: (n) => this.formatK(n),
    },
    {
      key: 'ctr',
      label: 'Avg CTR',
      color: '#059669',
      active: false,
      yaxis: 'left',
      format: (n) => `${n.toFixed(1)}%`,
    },
    {
      key: 'position',
      label: 'Avg position',
      color: '#DC2626',
      active: false,
      yaxis: 'left',
      format: (n) => n.toFixed(1),
    },
  ]);

  drillDimensionLabel = computed(() => {
    const dim = this.drillDimension();
    return this.dimensions.find((d) => d.key === dim)?.label || dim;
  });

  ngOnChanges() {
    this.applyPreset(this.preset());
    this.load();
  }

  setPreset(p: Preset) {
    this.preset.set(p);
    this.applyPreset(p);
    if (p !== 'custom') this.load();
  }

  setSearchType(t: GscSearchType) {
    this.searchType.set(t);
    this.load();
  }

  private applyPreset(p: Preset) {
    if (p === 'custom') return;
    const today = new Date();
    const to = new Date(today);
    // GSC has 2-3 day lag; back off 2 days so we don't chart empty days.
    to.setDate(to.getDate() - 2);
    const from = new Date(to);
    if (p === '7d') from.setDate(from.getDate() - 6);
    if (p === '28d') from.setDate(from.getDate() - 27);
    if (p === '3m') from.setDate(from.getDate() - 89);
    this.from.set(this.iso(from));
    this.to.set(this.iso(to));
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  load() {
    if (!this.clientId || !this.from() || !this.to()) return;
    this.loading.set(true);
    this.error.set(null);
    this.svc
      .gscTimeseries(
        this.clientId,
        this.from(),
        this.to(),
        this.searchType(),
        this.filters(),
      )
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err?.error?.message || 'Could not load Search Console data.',
          );
        },
      });
  }

  toggleKpi(key: KpiCard['key']) {
    this.kpis.update((list) =>
      list.map((k) => (k.key === key ? { ...k, active: !k.active } : k)),
    );
  }

  kpiValue(key: KpiCard['key']): string {
    const t = this.data()?.totals;
    if (!t) return '—';
    const kpi = this.kpis().find((k) => k.key === key);
    if (!kpi) return '—';
    if (key === 'clicks') return kpi.format(t.clicks);
    if (key === 'impressions') return kpi.format(t.impressions);
    if (key === 'ctr') return kpi.format(t.ctr);
    return kpi.format(t.avgPosition);
  }

  formatK(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return `${n}`;
  }

  openFilterModal() {
    this.filterDraft = {
      dimension: 'query',
      operator: 'contains',
      expression: '',
    };
    this.topValues.set([]);
    this.topValuesLoading.set(false);
    this.filterModalOpen.set(true);
  }

  /**
   * Called when the user changes the Dimension select in the filter
   * modal. Resets the expression + operator to what makes sense for
   * the picked dimension and — for enumerable dimensions — fetches
   * the list of values that actually appear in the client's data.
   */
  onFilterDimensionChange(dim: GscDrillDimension) {
    this.filterDraft = {
      dimension: dim,
      operator: dim === 'country' || dim === 'device' ? 'equals' : 'contains',
      expression: '',
    };
    if (dim === 'country') {
      this.loadTopValuesForFilter('country');
    } else {
      this.topValues.set([]);
    }
  }

  private loadTopValuesForFilter(dim: 'country' | 'query' | 'page' | 'device') {
    if (!this.clientId || !this.from() || !this.to()) return;
    this.topValuesLoading.set(true);
    this.topValues.set([]);
    this.svc
      .gscTopValues(this.clientId, this.from(), this.to(), dim, 50)
      .subscribe({
        next: (res) => {
          this.topValues.set(res.rows);
          this.topValuesLoading.set(false);
        },
        error: () => {
          this.topValuesLoading.set(false);
        },
      });
  }

  commitFilter() {
    const draft = { ...this.filterDraft };
    if (!draft.expression) return;
    this.filters.update((list) => [...list, draft]);
    this.filterDraft = {
      dimension: 'query',
      operator: 'contains',
      expression: '',
    };
    this.filterModalOpen.set(false);
    this.load();
  }

  removeFilter(index: number) {
    this.filters.update((list) => list.filter((_, i) => i !== index));
    this.load();
  }

  setDrillDimension(dim: GscDrillDimension, date: string) {
    this.drillDimension.set(dim);
    this.loadDrillDown(date);
  }

  private loadDrillDown(date: string) {
    if (!this.clientId) return;
    this.drillLoading.set(true);
    this.svc
      .gscTopForDate(
        this.clientId,
        date,
        this.drillDimension(),
        this.searchType(),
        this.filters(),
      )
      .subscribe({
        next: (res) => {
          this.drillDown.set(res);
          this.drillLoading.set(false);
        },
        error: () => {
          this.drillLoading.set(false);
        },
      });
  }

  chartSeries = computed(() => {
    const rows = this.data()?.rows ?? [];
    const activeKpis = this.kpis().filter((k) => k.active);
    return activeKpis.map((k) => ({
      name: k.label,
      type: 'line',
      data: rows.map((r: GscTimeseriesRow) => ({
        x: r.date,
        y:
          k.key === 'clicks'
            ? r.clicks
            : k.key === 'impressions'
              ? r.impressions
              : k.key === 'ctr'
                ? Number(r.ctr.toFixed(2))
                : Number(r.position.toFixed(2)),
      })),
    }));
  });

  get chartOpts(): Partial<ApexOptions> {
    const activeKpis = this.kpis().filter((k) => k.active);
    // Build per-series y-axis config so clicks + impressions can share
    // the chart with independent scales (GSC's dual-axis behavior).
    const yaxis = activeKpis.map((k, idx) => ({
      opposite: k.yaxis === 'right',
      seriesName: k.label,
      title: { text: k.label, style: { fontSize: '10px', color: '#6B7280' } },
      labels: {
        style: { colors: [k.color], fontSize: '10px' },
        formatter: (v: number) =>
          k.key === 'ctr'
            ? `${v.toFixed(1)}%`
            : k.key === 'position'
              ? v.toFixed(1)
              : this.formatK(v),
      },
      // GSC style: reverse Y for position (lower = better)
      reversed: k.key === 'position',
      show: idx < 2,
    }));
    return {
      chart: {
        type: 'line',
        height: 340,
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: 'Inter, system-ui, sans-serif',
        animations: { enabled: true, speed: 400 },
        events: {
          markerClick: (
            _event: unknown,
            _ctx: unknown,
            opts: { dataPointIndex: number },
          ) => {
            const rows = this.data()?.rows ?? [];
            const row = rows[opts.dataPointIndex];
            if (row) {
              this.drillDimension.set('query');
              this.drillDown.set({
                date: row.date,
                dimension: 'query',
                rows: [],
              });
              this.loadDrillDown(row.date);
            }
          },
        },
      },
      stroke: { curve: 'smooth', width: 2 },
      dataLabels: { enabled: false },
      colors: activeKpis.map((k) => k.color),
      grid: {
        borderColor: '#F0F2F5',
        strokeDashArray: 4,
        padding: { top: 0, right: 8, bottom: 0, left: 8 },
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#6B7280', fontSize: '11px', fontWeight: 500 },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis,
      tooltip: {
        theme: 'light',
        x: { format: 'MMM d, yyyy' },
        shared: true,
        intersect: false,
      },
      legend: {
        show: false,
      },
      markers: { size: 3, hover: { size: 6 } },
    };
  }
}
