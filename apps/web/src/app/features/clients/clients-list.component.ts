import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  CLIENT_SERVICE_LABELS,
  ClientHealthStatus,
  ClientRosterStats,
  ClientServiceLine,
} from '@seo/shared';
import { ClientsService, ClientWithStats } from '../../core/clients.service';

/**
 * Re-export the roster row shape under the historical name so any
 * downstream code that imported `Client` from this module keeps
 * compiling. The rest of the page treats each row as a
 * `ClientWithStats` internally.
 */
export type Client = ClientWithStats;

type RosterFilter =
  | 'all'
  | 'ppc'
  | 'seo'
  | 'combo'
  | 'at-risk'
  | 'expansion'
  | 'canceled';

/**
 * MVP zero-value roster stats. Used as a safe fallback while the
 * roster-stats request is in flight or when it fails — keeps the
 * template arithmetic simple (no null-guards on every field).
 */
const EMPTY_ROSTER_STATS: ClientRosterStats = {
  totalActive: 0,
  atRisk: 0,
  expansion: 0,
  canceled: 0,
  perService: { seo: 0, ppc: 0, website: 0, other: 0, combo: 0 },
};

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-container space-y-6">
      <!-- 1. Header block -->
      <header>
        <h1 class="text-2xl font-bold text-ink-900">Clients</h1>
        <p class="text-sm text-ink-500 mt-1">
          Everyone you manage — what they pay, how they're doing, and when you
          last touched them.
        </p>
      </header>

      <!-- 2. Utility button row -->
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" (click)="comingSoon('Client Health')" class="util-pill">
          Client Health
        </button>
        <button type="button" (click)="comingSoon('Delivery')" class="util-pill">
          Delivery
        </button>
        <button
          type="button"
          (click)="comingSoon('Sync roles from ClickUp')"
          class="util-pill"
        >
          Sync roles from ClickUp
        </button>
        <button
          type="button"
          (click)="comingSoon('Revenue to verify')"
          class="util-pill"
        >
          Revenue to verify
        </button>
        <button
          type="button"
          (click)="comingSoon('Sync live data')"
          class="util-pill"
        >
          Sync live data
        </button>
        <button type="button" (click)="reload()" class="util-pill">
          Refresh
        </button>
        <div class="flex-1"></div>
        <a
          routerLink="/clients/new"
          class="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-md bg-ink-900 text-white text-sm font-semibold hover:bg-ink-800 transition"
        >
          + Add client
        </a>
      </div>

      <!-- 3. KPI tiles row -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div class="kpi-tile">
          <div class="kpi-value">{{ stats().totalActive }}</div>
          <div class="kpi-label">
            <span class="w-2 h-2 rounded-full bg-ink-900"></span>
            Active clients
          </div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-value">{{ stats().perService.ppc }}</div>
          <div class="kpi-label">
            <span class="w-2 h-2 rounded-full bg-sky-500"></span>
            PPC
          </div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-value">{{ stats().perService.seo }}</div>
          <div class="kpi-label">
            <span class="w-2 h-2 rounded-full bg-positive-500"></span>
            SEO
          </div>
        </div>
        <div class="kpi-tile">
          <div class="kpi-value">{{ stats().perService.combo }}</div>
          <div class="kpi-label">
            <span class="w-2 h-2 rounded-full bg-brand-500"></span>
            PPC + SEO
          </div>
        </div>
        <div class="kpi-tile bg-danger-100/60 border-danger-100">
          <div class="kpi-value text-danger-500">{{ stats().atRisk }}</div>
          <div class="kpi-label">
            <span class="w-2 h-2 rounded-full bg-danger-500"></span>
            At risk
          </div>
        </div>
      </div>

      <!-- 4. At-risk banner -->
      @if (stats().atRisk > 0) {
        <div
          class="flex flex-wrap items-center gap-3 rounded-lg border border-danger-100 bg-danger-100/40 p-4"
        >
          <div class="text-danger-500 text-lg leading-none">⚠</div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-ink-900">
              {{ stats().atRisk }} clients at high risk of churning ·
              {{ watchCount() }} to watch
            </div>
            <div class="text-xs text-ink-500 mt-0.5">
              Reach out before they cancel.
            </div>
          </div>
          <button
            type="button"
            (click)="setFilter('at-risk')"
            class="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-md bg-danger-500 text-white text-xs font-semibold hover:bg-danger-500/90 transition"
          >
            Open save list →
          </button>
        </div>
      }

      <!-- 5. Search + filter row -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-[240px]">
          <span
            class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            aria-hidden="true"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" stroke-linecap="round" />
            </svg>
          </span>
          <input
            type="search"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
            placeholder="Search by business, contact, or email…"
            class="w-full h-9 pl-9 pr-3 rounded-md border border-ink-200 bg-white text-sm placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          @for (p of filterPills(); track p.value) {
            <button
              type="button"
              (click)="setFilter(p.value)"
              [class]="pillClass(p.value)"
            >
              {{ p.label }}
              <span class="ml-1 text-[11px] opacity-80">{{ p.count }}</span>
            </button>
          }
        </div>
      </div>

      <!-- 6. Roster table -->
      <div class="bg-white rounded-lg border border-ink-200 shadow-card overflow-hidden">
        @if (visibleRows().length) {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-ink-50/50">
                <tr class="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  <th class="px-4 py-3 w-[32%]">Client</th>
                  <th class="px-4 py-3 w-[28%]">Email</th>
                  <th class="px-4 py-3 w-[18%]">Service</th>
                  <th class="px-4 py-3 w-[22%]">Health &amp; activity</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-ink-100">
                @for (c of visibleRows(); track c._id) {
                  <tr
                    (click)="open(c._id!)"
                    [class]="'cursor-pointer transition-colors hover:bg-ink-50 ' + borderColor(healthStatusFor(c))"
                  >
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3 min-w-0">
                        @if (c.logoUrl) {
                          <img
                            [src]="c.logoUrl"
                            [alt]="c.name"
                            class="w-8 h-8 rounded-md object-contain bg-white border border-ink-200 flex-shrink-0"
                          />
                        } @else {
                          <div
                            class="w-8 h-8 rounded-md bg-ink-100 border border-ink-200 flex items-center justify-center text-xs font-bold text-ink-500 flex-shrink-0"
                          >
                            {{ c.name.charAt(0) }}
                          </div>
                        }
                        <div class="min-w-0">
                          <div class="font-semibold text-ink-900 truncate">
                            {{ c.name }}
                          </div>
                          @if (primaryContactName(c); as cn) {
                            <div class="text-xs text-ink-400 truncate">
                              {{ cn }}
                            </div>
                          }
                        </div>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-ink-600 truncate">
                      {{ primaryContactEmail(c) || '—' }}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex flex-wrap gap-1">
                        @if (serviceLinesFor(c).length) {
                          @for (s of serviceLinesFor(c); track s) {
                            <span [class]="serviceChipClass(s)">
                              {{ serviceLabel(s) }}
                            </span>
                          }
                        } @else {
                          <span class="text-xs text-ink-400">—</span>
                        }
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex flex-col gap-0.5">
                        <span
                          [class]="
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold w-fit ' +
                            healthBadgeClass(healthStatusFor(c))
                          "
                        >
                          {{ healthLabel(healthStatusFor(c)) }} ·
                          {{ c.stats.healthScore ?? '—' }}
                        </span>
                        <span class="text-[11px] text-ink-400">
                          {{ activityLine(c) }}
                        </span>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <!-- 7. Empty state -->
          <div class="text-center py-16 text-ink-400 italic text-sm">
            No clients match this filter.
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .util-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.375rem 0.875rem;
        border-radius: 9999px;
        background-color: #ffffff;
        border: 1px solid #e4e7eb;
        font-size: 0.75rem;
        font-weight: 600;
        color: #334155;
        transition: background-color 0.15s, color 0.15s, border-color 0.15s;
      }
      .util-pill:hover {
        background-color: #f7f8fa;
        color: #0f172a;
      }
      .kpi-tile {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1rem 1.125rem;
        background-color: #ffffff;
        border: 1px solid #e4e7eb;
        border-radius: 0.5rem;
      }
      .kpi-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: #0f172a;
        line-height: 1;
      }
      .kpi-label {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.75rem;
        font-weight: 600;
        color: #475569;
      }
    `,
  ],
})
export class ClientsListComponent implements OnInit {
  private svc = inject(ClientsService);
  private router = inject(Router);

  // --- Health rollup styling helpers (kept at the top of the class for
  // easy tuning if the tailwind palette shifts). ---
  healthBadgeClass(status: ClientHealthStatus | 'unknown'): string {
    switch (status) {
      case 'healthy':
        return 'bg-positive-100 text-positive-500';
      case 'watch':
        return 'bg-amber-50 text-amber-600';
      case 'at-risk':
        return 'bg-danger-100 text-danger-500';
      default:
        return 'bg-ink-100 text-ink-500';
    }
  }

  borderColor(status: ClientHealthStatus | 'unknown'): string {
    switch (status) {
      case 'healthy':
        return 'border-l-4 border-l-positive-500';
      case 'watch':
        return 'border-l-4 border-l-sky-500';
      case 'at-risk':
        return 'border-l-4 border-l-danger-500';
      default:
        return 'border-l-4 border-l-ink-200';
    }
  }

  serviceChipClass(service: ClientServiceLine): string {
    const base =
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold';
    switch (service) {
      case 'seo':
        return `${base} bg-positive-100 text-positive-500`;
      case 'ppc':
        return `${base} bg-sky-100 text-sky-600`;
      case 'website':
        return `${base} bg-amber-50 text-amber-600`;
      default:
        return `${base} bg-ink-100 text-ink-600`;
    }
  }

  // --- Signals + reactive state ---
  active = signal<ClientWithStats[]>([]);
  inactive = signal<ClientWithStats[]>([]);
  stats = signal<ClientRosterStats>(EMPTY_ROSTER_STATS);
  filter = signal<RosterFilter>('all');
  search = signal<string>('');

  /**
   * Clients whose health is "watch" — surfaced in the at-risk banner
   * copy so the user has a full picture of imminent + softening
   * accounts without opening the save list.
   */
  watchCount = computed(
    () =>
      this.active().filter((c) => c.stats?.healthStatus === 'watch').length,
  );

  filterPills = computed(() => {
    const s = this.stats();
    return [
      { value: 'all' as RosterFilter, label: 'All', count: s.totalActive },
      { value: 'ppc' as RosterFilter, label: 'PPC', count: s.perService.ppc },
      { value: 'seo' as RosterFilter, label: 'SEO', count: s.perService.seo },
      {
        value: 'combo' as RosterFilter,
        label: 'PPC+SEO',
        count: s.perService.combo,
      },
      { value: 'at-risk' as RosterFilter, label: 'At risk', count: s.atRisk },
      {
        value: 'expansion' as RosterFilter,
        label: 'Expansion',
        count: s.expansion,
      },
      {
        value: 'canceled' as RosterFilter,
        label: 'Canceled',
        count: s.canceled,
      },
    ];
  });

  /**
   * Filter the pre-fetched active + inactive rows in memory. Simpler
   * than firing off a second request every time a pill flips, and the
   * roster size (tens-to-hundreds) makes this cheap.
   */
  visibleRows = computed<ClientWithStats[]>(() => {
    const f = this.filter();
    const q = this.search().trim().toLowerCase();
    let rows: ClientWithStats[];
    if (f === 'canceled') {
      rows = this.inactive();
    } else {
      rows = this.active().filter((c) => {
        const lines = this.serviceLinesFor(c);
        if (f === 'ppc') return lines.includes('ppc');
        if (f === 'seo') return lines.includes('seo');
        if (f === 'combo' || f === 'expansion') return lines.length > 1;
        if (f === 'at-risk') return c.stats?.healthStatus === 'at-risk';
        return true;
      });
    }
    if (!q) return rows;
    return rows.filter((c) => {
      if (c.name?.toLowerCase().includes(q)) return true;
      const contact = c.contacts?.[0];
      if (contact?.name?.toLowerCase().includes(q)) return true;
      if (contact?.email?.toLowerCase().includes(q)) return true;
      return false;
    });
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    // Fetch active + inactive in parallel so the "Canceled" pill lands
    // instantly instead of triggering a second network round-trip.
    this.svc.listWithStats({ active: true }).subscribe({
      next: (rows) => this.active.set(rows),
      error: () => this.active.set([]),
    });
    this.svc.listWithStats({ active: false }).subscribe({
      next: (rows) => this.inactive.set(rows),
      error: () => this.inactive.set([]),
    });
    this.svc.rosterStats().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set(EMPTY_ROSTER_STATS),
    });
  }

  setFilter(f: RosterFilter): void {
    this.filter.set(f);
  }

  pillClass(value: RosterFilter): string {
    const base =
      'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition border';
    return this.filter() === value
      ? `${base} bg-ink-900 text-white border-ink-900`
      : `${base} bg-white text-ink-700 border-ink-200 hover:bg-ink-50`;
  }

  open(id: string): void {
    this.router.navigate(['/clients', id]);
  }

  comingSoon(label: string): void {
    // Explicit placeholder — the user asked for this to be transparent
    // while the underlying features are being built out.
    alert(`${label}: coming soon`);
  }

  // --- Row-level accessors ---
  serviceLinesFor(c: ClientWithStats): ClientServiceLine[] {
    return (c.serviceLines ?? []) as ClientServiceLine[];
  }

  healthStatusFor(c: ClientWithStats): ClientHealthStatus | 'unknown' {
    return c.stats?.healthStatus ?? 'unknown';
  }

  healthLabel(status: ClientHealthStatus | 'unknown'): string {
    switch (status) {
      case 'healthy':
        return 'Healthy';
      case 'watch':
        return 'Watch';
      case 'at-risk':
        return 'At risk';
      default:
        return 'Unknown';
    }
  }

  serviceLabel(s: ClientServiceLine): string {
    return CLIENT_SERVICE_LABELS[s] ?? s;
  }

  primaryContactName(c: ClientWithStats): string | null {
    return c.contacts?.[0]?.name || null;
  }

  primaryContactEmail(c: ClientWithStats): string | null {
    return c.contacts?.[0]?.email || null;
  }

  /**
   * Small caption under the health badge. Prefers a real
   * days-since-last-email number; falls back to a "no opt yet" note
   * so brand-new clients read as intentional rather than broken.
   */
  activityLine(c: ClientWithStats): string {
    const days = c.stats?.daysSinceLastEmail;
    if (days === null || days === undefined) return 'No opt yet';
    if (days >= 60) return `Stale (${days}d)`;
    return `Opt ${days}d ago`;
  }
}
