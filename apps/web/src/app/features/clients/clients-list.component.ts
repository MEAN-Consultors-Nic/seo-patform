import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ClientTier } from '@seo/shared';
import { ClientsService, ClientWithStats } from '../../core/clients.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Clients</h1>
          <p class="page-subtitle">{{ clients().length }} active accounts</p>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex bg-white border border-ink-200 rounded-md p-0.5">
            @for (t of tierOptions; track t.value) {
              <button
                (click)="setTier(t.value)"
                [class]="'px-3 py-1 text-xs font-semibold rounded transition ' +
                  (tierFilter() === t.value ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')">
                {{ t.label }}
              </button>
            }
          </div>
          <a routerLink="/clients/new" class="btn-primary">+ New client</a>
        </div>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        @for (c of clients(); track c._id) {
          <article (click)="open(c._id!)"
                   class="bg-white rounded-lg border border-ink-200 shadow-card hover:shadow-elevated hover:border-brand-500/30 transition-all cursor-pointer overflow-hidden group">
            <!-- Header -->
            <div class="p-4 border-b border-ink-100">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  @if (c.logoUrl) {
                    <img [src]="c.logoUrl" [alt]="c.name"
                         class="w-10 h-10 rounded-md object-contain bg-white border border-ink-200 flex-shrink-0" />
                  } @else {
                    <div class="w-10 h-10 rounded-md bg-ink-100 border border-ink-200 flex items-center justify-center text-sm font-bold text-ink-500 flex-shrink-0">
                      {{ c.name.charAt(0) }}
                    </div>
                  }
                  <div class="min-w-0 flex-1">
                    <h3 class="font-semibold text-ink-900 truncate group-hover:text-brand-600 transition-colors">
                      {{ c.name }}
                    </h3>
                    <a [href]="c.url" target="_blank" (click)="$event.stopPropagation()"
                       class="text-xs text-ink-500 truncate block hover:text-sky-500 hover:underline">
                      {{ shortUrl(c.url) }}
                    </a>
                  </div>
                </div>
                <span [class]="'tier-' + c.tier">{{ c.tier }}</span>
              </div>
              @if (auth.isManager() && ownerName(c); as on) {
                <div class="mt-2.5 flex items-center gap-1.5 text-[10px] text-ink-500">
                  <span class="w-4 h-4 rounded-full bg-ink-100 flex items-center justify-center text-[8px] font-bold text-ink-600">
                    {{ on.charAt(0).toUpperCase() }}
                  </span>
                  <span>Owner: <span class="font-semibold text-ink-700">{{ on }}</span></span>
                </div>
              }
            </div>

            <!-- KPI grid -->
            <div class="grid grid-cols-4 divide-x divide-ink-100 border-b border-ink-100">
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Keywords</div>
                <div class="text-base font-bold text-ink-900 mt-0.5">{{ c.stats.keywords.total }}</div>
              </div>
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Top 10</div>
                <div class="text-base font-bold text-positive-500 mt-0.5">{{ c.stats.keywords.top10 }}</div>
              </div>
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Avg pos.</div>
                <div class="text-base font-bold text-ink-900 mt-0.5">
                  {{ c.stats.keywords.avgPosition !== null ? (c.stats.keywords.avgPosition | number: '1.1-1') : '—' }}
                </div>
              </div>
              <div class="px-3 py-2.5 text-center">
                <div class="text-[10px] font-medium text-ink-500 uppercase tracking-wider">Backlinks</div>
                <div class="text-base font-bold text-ink-900 mt-0.5">{{ c.stats.backlinks }}</div>
              </div>
            </div>

            <!-- Movements -->
            @if (c.stats.keywords.gainers || c.stats.keywords.losers) {
              <div class="px-4 py-2 border-b border-ink-100 flex items-center gap-3 text-xs">
                <span class="text-positive-500 font-semibold">▲ {{ c.stats.keywords.gainers }}</span>
                <span class="text-danger-500 font-semibold">▼ {{ c.stats.keywords.losers }}</span>
                <span class="text-ink-400">position changes this cycle</span>
              </div>
            }

            <!-- Cycle progress -->
            <div class="p-4">
              <div class="flex items-center justify-between mb-1.5">
                <div class="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">
                  Current cycle
                </div>
                <div class="text-xs">
                  <span class="font-bold" [ngClass]="hoursTextColor(c.stats.currentCycleHours.pct)">
                    {{ c.stats.currentCycleHours.actual }} / {{ c.stats.currentCycleHours.assigned }}h
                  </span>
                  <span class="text-ink-400 ml-1">({{ c.stats.currentCycleHours.pct }}%)</span>
                </div>
              </div>
              <div class="h-1.5 bg-ink-100 rounded-full overflow-hidden mb-3">
                <div class="h-full rounded-full transition-all"
                     [ngClass]="hoursBarColor(c.stats.currentCycleHours.pct)"
                     [style.width.%]="Math.min(c.stats.currentCycleHours.pct, 100)"></div>
              </div>
              <div class="flex items-center justify-between text-xs">
                <div class="text-ink-500">
                  <span class="font-semibold text-ink-900">{{ c.stats.currentCycleTasks.completed }}</span>
                  /
                  <span>{{ c.stats.currentCycleTasks.total }}</span>
                  tasks completed
                </div>
                <span class="text-brand-500 font-medium group-hover:translate-x-0.5 transition-transform">
                  Open →
                </span>
              </div>
            </div>
          </article>
        }
        @if (!clients().length) {
          <div class="col-span-full card text-center py-12 text-ink-400 italic">
            No clients to display
          </div>
        }
      </div>
    </div>
  `,
})
export class ClientsListComponent implements OnInit {
  private svc = inject(ClientsService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  clients = signal<ClientWithStats[]>([]);
  tierFilter = signal<ClientTier | ''>('');
  Math = Math;

  ownerName(c: ClientWithStats): string | null {
    const o = c.ownerId;
    if (!o) return null;
    if (typeof o === 'object' && 'name' in o) return o.name;
    return null;
  }

  tierOptions: Array<{ value: ClientTier | ''; label: string }> = [
    { value: '', label: 'All' },
    { value: 'A', label: 'A' },
    { value: 'B', label: 'B' },
    { value: 'C', label: 'C' },
  ];

  ngOnInit() {
    this.load();
  }

  setTier(t: ClientTier | '') {
    this.tierFilter.set(t);
    this.load();
  }

  load() {
    const filters = this.tierFilter() ? { tier: this.tierFilter() as ClientTier } : {};
    this.svc.listWithStats(filters).subscribe((cs) => this.clients.set(cs));
  }

  open(id: string) {
    this.router.navigate(['/clients', id]);
  }

  shortUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  hoursTextColor(pct: number) {
    if (pct > 100) return 'text-danger-500';
    if (pct >= 80) return 'text-warning-500';
    if (pct >= 50) return 'text-positive-500';
    return 'text-ink-700';
  }

  hoursBarColor(pct: number) {
    if (pct > 100) return 'bg-danger-500';
    if (pct >= 80) return 'bg-warning-500';
    if (pct >= 50) return 'bg-positive-500';
    return 'bg-ink-300';
  }
}
