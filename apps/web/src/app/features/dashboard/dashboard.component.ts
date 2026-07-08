import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PipelineStats } from '@seo/shared';
import { AuthService } from '../../core/auth.service';
import { ClientsService } from '../../core/clients.service';
import { PipelineService } from '../../core/pipeline.service';

/**
 * Agency ops dashboard — the front door of the platform. This is
 * intentionally broader than SEO now: it surfaces client counts across
 * SEO / PPC / Websites and links out to Pipeline. Older widgets
 * (priority queue, task rollup, today's plan) were removed on purpose
 * — they belong on their own pages, not on the home screen.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-full bg-[#FDF7F3]">
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">

        <!-- Top command bar -->
        <div class="mb-6 flex items-center gap-2 sm:gap-3">
          <div class="flex-1 relative">
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </span>
            <input
              type="text"
              placeholder="Search clients, plans, tools…"
              class="w-full rounded-2xl border border-ink-200 bg-white pl-10 pr-16 py-2.5 text-sm text-ink-900 placeholder-ink-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-ink-400 border border-ink-200 rounded px-1.5 py-0.5 bg-ink-50">
              ⌘K
            </span>
          </div>
          <button type="button" title="Notifications"
                  class="w-10 h-10 rounded-xl bg-white border border-ink-200 shadow-sm flex items-center justify-center text-ink-600 hover:text-ink-900 hover:border-ink-300 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          </button>
          <button type="button" title="Toggle theme (coming soon)"
                  class="w-10 h-10 rounded-xl bg-white border border-ink-200 shadow-sm flex items-center justify-center text-ink-600 hover:text-ink-900 hover:border-ink-300 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          </button>
          <button type="button" title="Filters"
                  class="w-10 h-10 rounded-xl bg-white border border-ink-200 shadow-sm flex items-center justify-center text-ink-600 hover:text-ink-900 hover:border-ink-300 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </button>
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            {{ userInitial() }}
          </div>
        </div>

        <!-- Greeting hero -->
        <div class="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 class="text-2xl sm:text-[28px] font-bold tracking-tight text-ink-900">
              {{ greetingPrefix() }}, {{ firstName() }} <span aria-hidden="true">👋</span>
              <span> let's make today </span>
              <span class="bg-gradient-to-r from-sky-500 to-sky-600 bg-clip-text text-transparent">spearhead-sharp</span>.
            </h1>
            <p class="mt-1.5 text-sm text-ink-500">
              Here's where everything lives. Pulse and Pipeline are one tap away.
            </p>
          </div>
          <div class="inline-flex items-center gap-2 self-start sm:self-auto rounded-full bg-white border border-ink-200 px-3.5 py-1.5 text-xs font-semibold text-ink-700 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-sky-500"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {{ dateLabel() }}
          </div>
        </div>

        <!-- KPI row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <!-- Active clients -->
          <div class="rounded-2xl bg-white border border-ink-200 shadow-sm hover:shadow-md transition p-5">
            <div class="flex items-start justify-between mb-4">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Portfolio</span>
            </div>
            <div class="text-4xl font-bold text-ink-900 leading-none">{{ activeClientsDisplay() }}</div>
            <div class="mt-1 text-sm font-semibold text-ink-700">Active clients</div>
            <a routerLink="/clients"
               class="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700">
              unique clients
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </a>
          </div>

          <!-- Active PPC clients -->
          <!-- TODO: filter Clients by PPC service line once packages carry a
               service classifier. For now this is a placeholder. -->
          <div class="rounded-2xl bg-white border border-ink-200 shadow-sm hover:shadow-md transition p-5">
            <div class="flex items-start justify-between mb-4">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Paid</span>
            </div>
            <div class="text-4xl font-bold text-ink-900 leading-none">—</div>
            <div class="mt-1 text-sm font-semibold text-ink-700">Active PPC clients</div>
            <span class="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold px-2 py-0.5">
              Google Ads
            </span>
          </div>

          <!-- Active SEO plans -->
          <!-- TODO: replace with a count of active SEO plans (packages) once
               packages carry a service classifier. -->
          <div class="rounded-2xl bg-white border border-ink-200 shadow-sm hover:shadow-md transition p-5">
            <div class="flex items-start justify-between mb-4">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-positive-500 to-emerald-600 flex items-center justify-center text-white shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              </div>
              <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Organic</span>
            </div>
            <div class="text-4xl font-bold text-ink-900 leading-none">—</div>
            <div class="mt-1 text-sm font-semibold text-ink-700">Active SEO plans</div>
            <span class="mt-3 inline-flex items-center gap-1 rounded-full bg-positive-100 text-positive-500 text-[11px] font-semibold px-2 py-0.5">
              Search visibility
            </span>
          </div>

          <!-- Websites -->
          <!-- TODO: wire once we track site builds explicitly (WP / Shopify /
               custom). Placeholder for now. -->
          <div class="rounded-2xl bg-white border border-ink-200 shadow-sm hover:shadow-md transition p-5">
            <div class="flex items-start justify-between mb-4">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </div>
              <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Build</span>
            </div>
            <div class="text-4xl font-bold text-ink-900 leading-none">—</div>
            <div class="mt-1 text-sm font-semibold text-ink-700">Websites</div>
            <span class="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold px-2 py-0.5">
              active builds
            </span>
          </div>
        </div>

        <!-- WORK THE BOOK section -->
        <div class="flex items-center gap-2 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-brand-500"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span class="text-[11px] uppercase tracking-[0.14em] font-bold text-ink-500">Work the book</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <!-- Pipeline card -->
          <a routerLink="/pipeline"
             class="group rounded-2xl bg-white border border-ink-200 shadow-sm hover:shadow-md transition p-5 sm:p-6 flex flex-col">
            <div class="flex items-start justify-between mb-4">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
              </div>
              <span class="text-ink-400 group-hover:text-ink-700 transition">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
              </span>
            </div>
            <h3 class="text-lg font-bold text-ink-900">Pipeline</h3>
            <p class="mt-1 text-sm text-ink-500">Your live sales pipeline, deal by deal.</p>
            <div class="mt-5 grid grid-cols-2 gap-3">
              <div class="rounded-xl bg-ink-50 border border-ink-100 p-3">
                <div class="text-2xl font-bold text-ink-900 leading-none">{{ openDealsDisplay() }}</div>
                <div class="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Open deals</div>
              </div>
              <div class="rounded-xl bg-ink-50 border border-ink-100 p-3">
                <div class="text-2xl font-bold text-ink-900 leading-none">{{ pipelineMrrDisplay() }}</div>
                <div class="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">In play (MRR)</div>
              </div>
            </div>
          </a>

          <div class="flex flex-col gap-4">
            <!-- Needs attention -->
            <div class="rounded-2xl bg-white border border-ink-200 shadow-sm p-5 sm:p-6">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div class="flex items-center gap-2.5">
                  <span class="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </span>
                  <h3 class="text-base font-bold text-ink-900">Needs attention today</h3>
                </div>
                <span class="rounded-full bg-ink-100 text-ink-700 text-xs font-bold px-2.5 py-0.5">
                  {{ needsAttentionCount() }}
                </span>
              </div>
              @if (needsAttentionCount() === 0) {
                <p class="text-sm text-ink-500">
                  All clear — every client is healthy today.
                </p>
              } @else {
                <p class="text-sm text-ink-500">
                  Clients to touch before end of day.
                </p>
              }
            </div>

            <!-- LATEST FROM GOOGLE -->
            <!-- NOTE: hardcoded placeholder. When we wire an RSS/JSON feed
                 (Search Central / Ads blog), it would live here. -->
            <div class="rounded-2xl bg-white border border-ink-200 shadow-sm overflow-hidden">
              <div class="px-5 pt-4 pb-2 flex items-center justify-between border-b border-ink-100">
                <div class="flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-danger-500/70"></span>
                  <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                  <span class="w-2.5 h-2.5 rounded-full bg-positive-500/70"></span>
                </div>
                <span class="text-[10px] uppercase tracking-[0.14em] font-bold text-ink-400">Latest from Google</span>
              </div>
              <div class="p-5">
                <h4 class="text-sm font-bold text-ink-900 leading-snug">
                  New Performance Max asset reporting rolls out
                </h4>
                <p class="mt-1.5 text-xs text-ink-500 leading-relaxed">
                  Advertisers can now see conversions attributed to individual creative assets inside Performance Max campaigns — clearer signal for what's actually pulling weight.
                </p>
                <button
                  type="button"
                  (click)="turnIntoClientEmail()"
                  class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold px-3 py-2 hover:bg-brand-600 transition shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Turn into client email
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- REPORTING & DELIVERY section -->
        <div class="flex items-center gap-2 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-sky-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <span class="text-[11px] uppercase tracking-[0.14em] font-bold text-ink-500">Reporting &amp; delivery</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          @for (p of comingSoonCards; track p.title) {
            <div class="rounded-2xl bg-white border border-ink-200 shadow-sm p-5">
              <div class="flex items-center justify-between mb-3">
                <div class="w-10 h-10 rounded-xl bg-ink-100 text-ink-500 flex items-center justify-center">
                  <span [innerHTML]="p.iconHtml"></span>
                </div>
                <span class="rounded-full bg-sky-100 text-sky-600 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                  Coming soon
                </span>
              </div>
              <h4 class="text-sm font-bold text-ink-900">{{ p.title }}</h4>
              <p class="mt-1 text-xs text-ink-500 leading-relaxed">{{ p.blurb }}</p>
            </div>
          }
        </div>

      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private clientsSvc = inject(ClientsService);
  private pipelineSvc = inject(PipelineService);
  private auth = inject(AuthService);

  activeClientCount = signal<number | null>(null);
  pipelineStats = signal<PipelineStats | null>(null);

  // Placeholder — future ops-digests module (e.g. flagged accounts,
  // overdue reports, silent PPC accounts) will populate this signal.
  needsAttentionCount = signal<number>(0);

  firstName = computed(() => {
    const name = this.auth.user()?.name;
    if (!name) return 'there';
    return name.split(' ')[0] || 'there';
  });

  userInitial = computed(() => {
    const n = this.firstName();
    return n.charAt(0).toUpperCase();
  });

  greetingPrefix = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  });

  dateLabel = computed(() =>
    new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
  );

  activeClientsDisplay = computed(() => {
    const n = this.activeClientCount();
    return n === null ? '—' : String(n);
  });

  openDealsDisplay = computed(() => {
    const s = this.pipelineStats();
    return s ? String(s.openLeads) : '—';
  });

  pipelineMrrDisplay = computed(() => {
    const s = this.pipelineStats();
    if (!s) return '—';
    return this.formatCurrency(s.pipelineMrr);
  });

  comingSoonCards = [
    {
      title: 'Client report scheduler',
      blurb:
        'Queue monthly SEO + PPC recaps, auto-send on the right day, log the delivery.',
      iconHtml:
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    },
    {
      title: 'Deliverables board',
      blurb:
        'A single kanban view of everything owed to clients this week, across service lines.',
      iconHtml:
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    },
    {
      title: 'Retention pulse',
      blurb:
        'Health signals per account — usage, comms cadence, results — before churn shows up in the P&L.',
      iconHtml:
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
    },
  ];

  ngOnInit() {
    this.clientsSvc.list({ active: true }).subscribe({
      next: (clients) => this.activeClientCount.set(clients.length),
      error: () => this.activeClientCount.set(0),
    });

    this.pipelineSvc.stats().subscribe({
      next: (s) => this.pipelineStats.set(s),
      // Pipeline endpoint may be forbidden for some roles — fail
      // gracefully and leave the display as an em-dash placeholder.
      error: () => this.pipelineStats.set(null),
    });
  }

  turnIntoClientEmail() {
    // Placeholder — will hook into the Comms / drafts module once the
    // "Latest from Google" feed is wired up.
    alert('coming soon');
  }

  private formatCurrency(value: number): string {
    if (!Number.isFinite(value)) return '—';
    if (value >= 1000) {
      const k = value / 1000;
      const s = k >= 10 ? k.toFixed(0) : k.toFixed(1);
      return `$${s}k`;
    }
    return `$${Math.round(value)}`;
  }
}
