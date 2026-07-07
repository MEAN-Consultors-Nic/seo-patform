import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Task, TimeBlock } from '@seo/shared';
import { ClientsService, ClientWithStats } from '../../core/clients.service';
import {
  PriorityQueueItem,
  PriorityQueueResponse,
  PriorityQueueService,
} from '../../core/priority-queue.service';
import { TasksService } from '../../core/tasks.service';
import { TimeBlocksService } from '../../core/time-blocks.service';

interface PendingByClient {
  clientId: string;
  name: string;
  tier: 'A' | 'B' | 'C';
  logoUrl?: string;
  pending: number;
  inProgress: number;
  blocked: number;
}

interface RecentActivity {
  taskId: string;
  title: string;
  clientId: string;
  clientName: string;
  tier: 'A' | 'B' | 'C';
  category: string;
  when: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Overview of your SEO portfolio</p>
        </div>
      </header>

      <!-- Today's priority queue. Computed daily score across cycle
           urgency, GSC momentum (week-over-week) and pending high-priority
           work. Aimed at the 10-15min daily triage of which clients
           deserve attention first. -->
      <section class="card mb-4">
        <header class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-sm font-bold text-ink-900 flex items-center gap-2">
              <span class="text-base">⚡</span>
              <span>Today's priority queue</span>
            </h2>
            <p class="text-[11px] text-ink-500 mt-0.5">
              Ranked by cycle urgency, week-over-week GSC drop and pending high-priority work.
            </p>
          </div>
          @if (priorityQueue(); as q) {
            @if (q.hasStaleMomentum) {
              <span class="text-[10px] text-ink-400 italic"
                    title="At least one client's GSC momentum was refreshed today; others are still stale.">
                Momentum partially refreshed
              </span>
            }
          }
        </header>

        @if (priorityLoading()) {
          <div class="py-6 text-center text-xs text-ink-500">
            Computing scores — first daily run pulls fresh GSC data, can take a few seconds.
          </div>
        } @else if (topPriorityItems().length === 0) {
          <div class="py-6 text-center text-xs text-ink-500">
            No clients need urgent attention right now. Nice. 🎉
          </div>
        } @else {
          <ol class="space-y-2">
            @for (it of topPriorityItems(); track it.clientId; let i = $index) {
              <li>
                <a [routerLink]="['/clients', it.clientId]"
                   class="flex items-start gap-3 p-3 rounded-md border border-ink-200 bg-white hover:border-brand-500 hover:shadow-sm transition-all">
                  <div class="text-lg font-bold text-ink-400 w-6 text-center flex-shrink-0">
                    {{ i + 1 }}
                  </div>
                  @if (it.logoUrl) {
                    <img [src]="it.logoUrl" [alt]="it.name"
                         class="w-10 h-10 rounded-md object-contain bg-white border border-ink-200 flex-shrink-0" />
                  } @else {
                    <div class="w-10 h-10 rounded-md bg-ink-100 flex items-center justify-center text-sm font-bold text-ink-600 flex-shrink-0">
                      {{ it.name.charAt(0) }}
                    </div>
                  }
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2 flex-wrap">
                      <span class="text-sm font-bold text-ink-900 truncate">{{ it.name }}</span>
                      <span [class]="tierClass(it.tier)">{{ it.tier }}</span>
                    </div>
                    @if (it.reasons.length) {
                      <ul class="mt-1 space-y-0.5">
                        @for (r of it.reasons.slice(0, 2); track r.tag) {
                          <li class="text-[11px] text-ink-600 leading-snug">
                            <span class="font-semibold text-ink-700">{{ r.tag }}:</span>
                            {{ r.detail }}
                          </li>
                        }
                      </ul>
                    }
                  </div>
                  <div [class]="'flex-shrink-0 px-2.5 py-1 rounded-md text-sm font-bold ' + scoreClass(it.score)">
                    {{ it.score }}
                  </div>
                </a>
              </li>
            }
          </ol>
        }
      </section>

      <div class="card mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider">Portfolio</div>
          <div class="text-lg font-bold text-ink-900">{{ clientsWithStats().length }} active clients</div>
        </div>
        <a routerLink="/reports" class="btn-primary text-xs sm:text-sm">Reports</a>
      </div>

      <!-- Tier stats -->
      <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
        @for (s of stats(); track s._id) {
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <span class="stat-label">Tier {{ s._id }}</span>
              <span [class]="'tier-' + s._id">{{ s._id }}</span>
            </div>
            <div class="stat-value">{{ s.count }}</div>
            <div class="text-xs text-ink-500 mt-1">
              <span class="font-semibold text-ink-700">{{ s.totalHours }}h</span> / week
            </div>
          </div>
        }

        @if (totalHours()) {
          <div class="stat-card bg-ink-900 text-white border-ink-900">
            <span class="stat-label !text-ink-300">Total capacity</span>
            <div class="text-2xl font-bold text-white mt-1">{{ totalHours() }}h</div>
            <div class="text-xs text-ink-300 mt-1">billable / week</div>
          </div>
        }
      </div>

      <!-- Today's plan -->
      <div class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-sm font-semibold text-ink-900">Today's plan</h3>
            <p class="text-[11px] text-ink-500">{{ todayDateLabel() }}</p>
          </div>
        </div>

        @if (loadingToday()) {
          <div class="text-center py-8 text-ink-400 italic text-sm">Loading…</div>
        } @else if (todayBlocks().length === 0) {
          <div class="text-center py-8">
            <div class="text-3xl mb-2">📅</div>
            <div class="text-sm text-ink-500">
              No blocks scheduled for today.
            </div>
          </div>
        } @else {
          <div class="space-y-2">
            @for (b of todayBlocks(); track b._id) {
              <div [class]="'flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 transition ' +
                            (b.status === 'completed' ? 'border-positive-500/30 bg-positive-100/30' :
                             b.status === 'in_progress' ? 'border-sky-500 bg-sky-50' :
                             'border-ink-200 hover:bg-ink-50')">
                <div class="text-center flex-shrink-0 w-14">
                  <div class="text-xs font-bold text-ink-900">{{ b.startTime }}</div>
                  <div class="text-[10px] text-ink-400">{{ formatDuration(b.durationMinutes) }}</div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 min-w-0">
                    <span [class]="'tier-' + clientTier(b)">{{ clientTier(b) }}</span>
                    <span class="font-semibold text-ink-900 text-sm truncate">{{ clientName(b) }}</span>
                  </div>
                  @if (taskTitle(b)) {
                    <div class="text-xs text-ink-500 truncate mt-0.5">{{ taskTitle(b) }}</div>
                  } @else {
                    <div class="text-xs text-ink-400 italic mt-0.5">Generic block</div>
                  }
                </div>
                <div class="flex items-center gap-1 flex-shrink-0 w-full sm:w-auto justify-end">
                  @if (b.status === 'completed') {
                    <span class="text-positive-500 text-xs font-bold">✓ Done</span>
                  } @else {
                    @if (b.status === 'planned') {
                      <button class="text-[11px] font-semibold px-2 py-1 rounded border border-ink-200 hover:border-sky-500 hover:text-sky-600 transition"
                              (click)="startBlock(b)">▶ Start</button>
                    }
                    <button class="text-[11px] font-semibold px-2 py-1 rounded border border-ink-200 hover:border-positive-500 hover:text-positive-500 transition"
                            (click)="completeBlock(b)">✓ Done</button>
                  }
                </div>
              </div>
            }
          </div>
          <div class="mt-3 pt-3 border-t border-ink-100 text-xs text-ink-500 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong class="text-ink-900">{{ todayPlannedMinutes() / 60 | number: '1.1-1' }}h</strong> planned
              · <strong class="text-positive-500">{{ todayCompletedMinutes() / 60 | number: '1.1-1' }}h</strong> completed
            </span>
            <span class="text-ink-400">{{ todayBlocks().length }} block(s)</span>
          </div>
        }
      </div>

      <!-- Portfolio health -->
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <div class="stat-card">
          <span class="stat-label">Pending work</span>
          <div class="text-2xl font-bold text-ink-900 mt-1">{{ totals().pending + totals().inProgress }}</div>
          <div class="text-xs text-ink-500 mt-1">
            <span class="text-ink-600 font-semibold">{{ totals().inProgress }}</span> in progress
            · <span class="text-ink-600 font-semibold">{{ totals().pending }}</span> pending
          </div>
        </div>

        <div class="stat-card">
          <span class="stat-label">Blocked</span>
          <div class="text-2xl font-bold mt-1" [ngClass]="totals().blocked > 0 ? 'text-danger-500' : 'text-ink-300'">
            {{ totals().blocked }}
          </div>
          <div class="text-xs text-ink-500 mt-1">
            @if (totals().blocked > 0) {
              Tasks need unblocking
            } @else {
              Nothing blocked
            }
          </div>
        </div>

        <div class="stat-card">
          <span class="stat-label">Completed (last 30d)</span>
          <div class="text-2xl font-bold text-positive-500 mt-1">{{ totals().completed }}</div>
          <div class="text-xs text-ink-500 mt-1">Tasks closed in the last month</div>
        </div>
      </div>

      <!-- Two columns: Pending by client + Recent activity -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Pending by client (2 cols wide) -->
        <div class="lg:col-span-2 card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-ink-900">Pending work by client</h3>
            <a routerLink="/clients" class="text-xs text-brand-500 hover:text-brand-600 font-semibold">View all →</a>
          </div>
          @if (pendingByClient().length === 0) {
            <div class="text-center py-10 text-ink-400 italic text-sm">
              @if (loading()) {
                Loading…
              } @else {
                🎉 No pending tasks — everything is done.
              }
            </div>
          } @else {
            <div class="space-y-2">
              @for (p of pendingByClient(); track p.clientId) {
                <a [routerLink]="['/clients', p.clientId]"
                   class="block rounded-md border border-ink-200 hover:border-brand-500/40 hover:shadow-card transition p-3">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                      @if (p.logoUrl) {
                        <img [src]="p.logoUrl" [alt]="p.name"
                             class="w-9 h-9 rounded-md object-contain bg-white border border-ink-200 flex-shrink-0" />
                      } @else {
                        <div class="w-9 h-9 rounded-md bg-ink-100 border border-ink-200 flex items-center justify-center text-xs font-bold text-ink-500 flex-shrink-0">
                          {{ p.name.charAt(0) }}
                        </div>
                      }
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="font-semibold text-ink-900 text-sm truncate">{{ p.name }}</span>
                          <span [class]="'tier-' + p.tier + ' flex-shrink-0'">{{ p.tier }}</span>
                        </div>
                        <div class="mt-1 flex items-center gap-2 text-[11px] text-ink-500">
                          @if (p.pending > 0) {
                            <span><strong class="text-ink-700">{{ p.pending }}</strong> pending</span>
                          }
                          @if (p.inProgress > 0) {
                            @if (p.pending > 0) { <span class="text-ink-300">·</span> }
                            <span class="text-sky-600"><strong>{{ p.inProgress }}</strong> in progress</span>
                          }
                          @if (p.blocked > 0) {
                            <span class="text-ink-300">·</span>
                            <span class="text-danger-500"><strong>{{ p.blocked }}</strong> blocked</span>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              }
            </div>
          }
        </div>

        <!-- Recent activity -->
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-ink-900">Recent activity</h3>
            <span class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">{{ recentActivity().length }} latest</span>
          </div>
          @if (recentActivity().length === 0) {
            <div class="text-center py-8 text-ink-400 italic text-xs">
              No completed tasks yet.
            </div>
          } @else {
            <ul class="space-y-2">
              @for (r of recentActivity(); track r.taskId) {
                <li class="border-l-2 border-positive-500 pl-3 py-1">
                  <a [routerLink]="['/clients', r.clientId]" class="block hover:opacity-80">
                    <div class="text-[11px] text-ink-500 flex items-center gap-1.5">
                      <span [class]="'tier-' + r.tier">{{ r.tier }}</span>
                      <span class="font-semibold text-ink-700 truncate">{{ r.clientName }}</span>
                      <span class="text-ink-300">·</span>
                      <span class="text-ink-400">{{ r.when | date: 'MMM d' }}</span>
                    </div>
                    <div class="text-sm text-ink-900 leading-snug mt-0.5">{{ r.title }}</div>
                    <div class="text-[10px] text-ink-400 mt-0.5 uppercase tracking-wider">{{ r.category }}</div>
                  </a>
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private clientsSvc = inject(ClientsService);
  private tasksSvc = inject(TasksService);
  private blocksSvc = inject(TimeBlocksService);
  private prioritySvc = inject(PriorityQueueService);

  priorityQueue = signal<PriorityQueueResponse | null>(null);
  priorityLoading = signal(true);

  stats = signal<Array<{ _id: string; count: number; totalHours: number }>>([]);
  totalHours = signal<number>(0);

  clientsWithStats = signal<ClientWithStats[]>([]);
  /**
   * Recent tasks across all client portfolios — used by the pending-
   * by-client, recent-activity and totals widgets. Loaded once at
   * mount and covers a rolling 30-day window; completed items outside
   * that window drop off naturally.
   */
  recentTasks = signal<Task[]>([]);
  todayBlocks = signal<TimeBlock[]>([]);
  loading = signal(true);
  loadingToday = signal(true);

  Math = Math;

  // --- Derived data ---------------------------------------------------------

  totals = computed(() => {
    const tasks = this.recentTasks();
    let completed = 0;
    let pending = 0;
    let inProgress = 0;
    let blocked = 0;
    for (const t of tasks) {
      if (t.status === 'pending') pending++;
      else if (t.status === 'in_progress') inProgress++;
      else if (t.status === 'blocked') blocked++;
      else if (t.status === 'completed') completed++;
    }
    return { completed, pending, inProgress, blocked };
  });

  pendingByClient = computed<PendingByClient[]>(() => {
    const tasks = this.recentTasks();
    const tasksByClient = new Map<string, { pending: number; inProgress: number; blocked: number }>();
    for (const t of tasks) {
      const id = typeof t.clientId === 'string' ? t.clientId : String(t.clientId);
      const entry =
        tasksByClient.get(id) || { pending: 0, inProgress: 0, blocked: 0 };
      if (t.status === 'pending') entry.pending++;
      else if (t.status === 'in_progress') entry.inProgress++;
      else if (t.status === 'blocked') entry.blocked++;
      tasksByClient.set(id, entry);
    }
    return this.clientsWithStats()
      .map((c) => {
        const id = String(c._id);
        const t = tasksByClient.get(id) || { pending: 0, inProgress: 0, blocked: 0 };
        return {
          clientId: id,
          name: c.name,
          tier: c.tier,
          logoUrl: c.logoUrl,
          pending: t.pending,
          inProgress: t.inProgress,
          blocked: t.blocked,
        };
      })
      .filter((p) => p.pending + p.inProgress + p.blocked > 0)
      .sort((a, b) => {
        // Blocked first, then pending, then in_progress
        if (a.blocked !== b.blocked) return b.blocked - a.blocked;
        const aOpen = a.pending + a.inProgress;
        const bOpen = b.pending + b.inProgress;
        return bOpen - aOpen;
      });
  });

  recentActivity = computed<RecentActivity[]>(() => {
    const clientMap = new Map<string, ClientWithStats>();
    for (const c of this.clientsWithStats()) clientMap.set(String(c._id), c);
    return this.recentTasks()
      .filter((t) => t.status === 'completed' && (t.completedAt || t.updatedAt))
      .sort((a, b) => {
        const av = new Date(a.completedAt || a.updatedAt || 0).getTime();
        const bv = new Date(b.completedAt || b.updatedAt || 0).getTime();
        return bv - av;
      })
      .slice(0, 10)
      .map((t) => {
        const id = typeof t.clientId === 'string' ? t.clientId : String(t.clientId);
        const c = clientMap.get(id);
        return {
          taskId: String(t._id),
          title: t.title,
          clientId: id,
          clientName: c?.name || 'Unknown',
          tier: c?.tier || 'C',
          category: t.category,
          when: String(t.completedAt || t.updatedAt || ''),
        };
      });
  });

  // --- Lifecycle ------------------------------------------------------------

  ngOnInit() {
    this.loadPriorityQueue();
    this.loadTodayBlocks();

    // Load tasks completed within the last 30 days plus any currently
    // open task the caller has access to. Feeds the pending-by-client,
    // recent-activity, and portfolio-health widgets.
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    this.tasksSvc
      .list({
        completedFrom: from.toISOString(),
        completedTo: to.toISOString(),
      })
      .subscribe({
        next: (completed) => {
          // Second call: open tasks (pending / in_progress / blocked)
          // — those don't carry a completedAt so the date filter would
          // miss them. Merge and dedupe by _id.
          this.tasksSvc.list({}).subscribe({
            next: (all) => {
              const openOnes = all.filter(
                (t) => t.status !== 'completed',
              );
              const map = new Map<string, Task>();
              for (const t of [...completed, ...openOnes]) {
                if (t._id) map.set(t._id, t);
              }
              this.recentTasks.set(Array.from(map.values()));
              this.loading.set(false);
            },
            error: () => this.loading.set(false),
          });
        },
        error: () => this.loading.set(false),
      });

    this.clientsSvc.stats().subscribe((s) => {
      this.stats.set(s.perTier);
      this.totalHours.set(s.totalHoursPerCycle);
    });

    this.clientsSvc.listWithStats().subscribe((list) => {
      this.clientsWithStats.set(list);
    });
  }

  // --- Today widget --------------------------------------------------------

  /**
   * Pulls the ranked priority queue and renders it at the top of the
   * dashboard. First call of the day can take a few seconds because
   * GSC momentum hasn't been cached yet; subsequent loads are instant.
   */
  private loadPriorityQueue() {
    this.priorityLoading.set(true);
    this.prioritySvc.get().subscribe({
      next: (q) => {
        this.priorityQueue.set(q);
        this.priorityLoading.set(false);
      },
      error: () => this.priorityLoading.set(false),
    });
  }

  topPriorityItems(): PriorityQueueItem[] {
    const q = this.priorityQueue();
    if (!q) return [];
    return q.items.filter((i) => i.score > 0).slice(0, 5);
  }

  tierClass(tier: string): string {
    return 'tier-' + tier;
  }

  scoreClass(score: number): string {
    if (score >= 60) return 'bg-danger-100 text-danger-700';
    if (score >= 30) return 'bg-warning-100 text-warning-500';
    return 'bg-positive-100 text-positive-500';
  }

  private loadTodayBlocks() {
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.loadingToday.set(true);
    this.blocksSvc.list({ date: iso }).subscribe({
      next: (bs) => {
        this.todayBlocks.set(bs.sort((a, b) => a.startTime.localeCompare(b.startTime)));
        this.loadingToday.set(false);
      },
      error: () => this.loadingToday.set(false),
    });
  }

  todayDateLabel(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }

  todayPlannedMinutes = computed(() =>
    this.todayBlocks().reduce((acc, b) => acc + b.durationMinutes, 0),
  );

  todayCompletedMinutes = computed(() =>
    this.todayBlocks()
      .filter((b) => b.status === 'completed')
      .reduce((acc, b) => acc + (b.actualMinutes ?? b.durationMinutes), 0),
  );

  clientName(b: TimeBlock): string {
    if (b.kind === 'reporting') return '📊 Send client reports';
    const ref = b.clientId as unknown;
    if (ref && typeof ref === 'object' && 'name' in ref) {
      return (ref as { name: string }).name;
    }
    return '—';
  }

  clientTier(b: TimeBlock): string {
    if (b.kind === 'reporting') return 'A';
    const ref = b.clientId as unknown;
    if (ref && typeof ref === 'object' && 'tier' in ref) {
      return (ref as { tier: string }).tier;
    }
    return 'C';
  }

  taskTitle(b: TimeBlock): string | null {
    const ref = b.taskId as unknown;
    if (ref && typeof ref === 'object' && 'title' in ref) {
      return (ref as { title: string }).title;
    }
    return null;
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  startBlock(b: TimeBlock) {
    if (!b._id) return;
    this.blocksSvc.start(b._id).subscribe({
      next: () => this.loadTodayBlocks(),
    });
  }

  completeBlock(b: TimeBlock) {
    if (!b._id) return;
    this.blocksSvc.complete(b._id).subscribe({
      next: () => this.loadTodayBlocks(),
    });
  }
}
