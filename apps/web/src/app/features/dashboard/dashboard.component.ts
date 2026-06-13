import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cycle, Task, TimeBlock } from '@seo/shared';
import { ClientsService, ClientWithStats } from '../../core/clients.service';
import { CyclesService } from '../../core/cycles.service';
import { TaskTemplatesService } from '../../core/task-templates.service';
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
  total: number;
  completed: number;
  hoursPct: number;
  hoursActual: number;
  hoursAssigned: number;
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

interface CapacityAlert {
  clientId: string;
  name: string;
  tier: 'A' | 'B' | 'C';
  pct: number;
  actual: number;
  assigned: number;
  level: 'over' | 'warning' | 'idle';
  message: string;
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

      <!-- Cycle banner -->
      @if (cycle(); as c) {
        <div class="card mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div class="flex items-center gap-3 sm:gap-4 min-w-0">
              <div class="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center text-brand-500 text-xl flex-shrink-0">◐</div>
              <div class="min-w-0">
                <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider">Current cycle</div>
                <div class="flex items-baseline gap-2 mt-0.5 flex-wrap">
                  <span class="text-lg font-bold text-ink-900 truncate">{{ c.label }}</span>
                  <span class="badge-neutral capitalize">{{ c.status }}</span>
                </div>
                <div class="text-xs text-ink-500 mt-0.5">
                  {{ c.startDate | date: 'mediumDate' }} → {{ c.endDate | date: 'mediumDate' }}
                  · {{ daysRemaining() }} days remaining
                </div>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 sm:flex-shrink-0">
              <button class="btn-secondary text-xs sm:text-sm"
                      (click)="generateRecurring()"
                      [disabled]="applying() || !cycle()">
                @if (applying()) { Generating… } @else { ⚡ Generate cycle tasks }
              </button>
              <a routerLink="/reports" class="btn-primary text-xs sm:text-sm">Reports</a>
            </div>
          </div>
          <!-- Cycle progress -->
          <div class="mt-4">
            <div class="flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              <span>Cycle progress</span>
              <span>{{ cycleProgressPct() | number: '1.0-0' }}%</span>
            </div>
            <div class="h-1.5 bg-ink-100 rounded-full overflow-hidden">
              <div class="h-full bg-brand-500 transition-all" [style.width.%]="Math.min(cycleProgressPct(), 100)"></div>
            </div>
          </div>
        </div>
      }

      @if (applyResult()) {
        <div class="card mb-4 border-l-4 border-l-positive-500 text-sm bg-positive-100/40">
          ✓ <strong>{{ applyResult()!.created }}</strong> tasks created
          · <strong>{{ applyResult()!.skipped }}</strong> already existed
          · {{ applyResult()!.clientsProcessed }} clients processed
        </div>
      }

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
              <span class="font-semibold text-ink-700">{{ s.totalHours }}h</span> / cycle
            </div>
          </div>
        }

        @if (totalHours()) {
          <div class="stat-card bg-ink-900 text-white border-ink-900">
            <span class="stat-label !text-ink-300">Total capacity</span>
            <div class="text-2xl font-bold text-white mt-1">{{ totalHours() }}h</div>
            <div class="text-xs text-ink-300 mt-1">billable / cycle</div>
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
          <a routerLink="/schedule" class="text-xs text-brand-500 hover:text-brand-600 font-semibold">
            Full schedule →
          </a>
        </div>

        @if (loadingToday()) {
          <div class="text-center py-8 text-ink-400 italic text-sm">Loading…</div>
        } @else if (todayBlocks().length === 0) {
          <div class="text-center py-8">
            <div class="text-3xl mb-2">📅</div>
            <div class="text-sm text-ink-500 mb-3">
              No blocks scheduled for today.
            </div>
            <a routerLink="/schedule" class="btn-primary inline-flex items-center gap-1">
              ⚡ Plan my cycle
            </a>
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
      @if (cycle()) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div class="stat-card">
            <span class="stat-label">Tasks completed</span>
            <div class="flex items-baseline gap-2 mt-1">
              <div class="text-2xl font-bold text-positive-500">{{ totals().completed }}</div>
              <div class="text-sm text-ink-400">/ {{ totals().total }}</div>
            </div>
            <div class="h-1.5 bg-ink-100 rounded-full overflow-hidden mt-2">
              <div class="h-full bg-positive-500 transition-all"
                   [style.width.%]="totals().total ? (totals().completed / totals().total) * 100 : 0"></div>
            </div>
          </div>

          <div class="stat-card">
            <span class="stat-label">Hours invested</span>
            <div class="flex items-baseline gap-2 mt-1">
              <div class="text-2xl font-bold" [ngClass]="hoursColor(totals().hoursPct)">
                {{ totals().hoursActual | number: '1.0-1' }}h
              </div>
              <div class="text-sm text-ink-400">/ {{ totals().hoursAssigned }}h</div>
            </div>
            <div class="h-1.5 bg-ink-100 rounded-full overflow-hidden mt-2">
              <div class="h-full transition-all" [ngClass]="hoursBarColor(totals().hoursPct)"
                   [style.width.%]="Math.min(totals().hoursPct, 100)"></div>
            </div>
          </div>

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
        </div>
      }

      <!-- Capacity alerts -->
      @if (capacityAlerts().length > 0) {
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-ink-900">⚠ Capacity attention</h3>
            <span class="text-xs text-ink-500">{{ capacityAlerts().length }} client(s)</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            @for (a of capacityAlerts(); track a.clientId) {
              <a [routerLink]="['/clients', a.clientId]"
                 class="flex items-center justify-between gap-3 rounded-md border border-ink-200 px-3 py-2 hover:border-brand-500/40 hover:bg-ink-50 transition">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-ink-900 truncate">{{ a.name }}</div>
                  <div class="text-[11px] mt-0.5" [ngClass]="alertTextClass(a.level)">{{ a.message }}</div>
                </div>
                <span [class]="'tier-' + a.tier + ' flex-shrink-0'">{{ a.tier }}</span>
              </a>
            }
          </div>
        </div>
      }

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
                          <span class="font-semibold text-ink-700">{{ p.completed }}/{{ p.total }}</span>
                          done
                          @if (p.pending > 0) {
                            <span class="text-ink-300">·</span>
                            <span><strong class="text-ink-700">{{ p.pending }}</strong> pending</span>
                          }
                          @if (p.inProgress > 0) {
                            <span class="text-ink-300">·</span>
                            <span class="text-sky-600"><strong>{{ p.inProgress }}</strong> in progress</span>
                          }
                          @if (p.blocked > 0) {
                            <span class="text-ink-300">·</span>
                            <span class="text-danger-500"><strong>{{ p.blocked }}</strong> blocked</span>
                          }
                        </div>
                      </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                      <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Hours</div>
                      <div class="text-sm font-bold" [ngClass]="hoursColor(p.hoursPct)">
                        {{ p.hoursActual | number: '1.0-1' }} / {{ p.hoursAssigned }}h
                      </div>
                      <div class="w-20 h-1 bg-ink-100 rounded-full overflow-hidden mt-1">
                        <div class="h-full transition-all" [ngClass]="hoursBarColor(p.hoursPct)"
                             [style.width.%]="Math.min(p.hoursPct, 100)"></div>
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
              No completed tasks yet in this cycle.
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
  private cyclesSvc = inject(CyclesService);
  private templates = inject(TaskTemplatesService);
  private tasksSvc = inject(TasksService);
  private blocksSvc = inject(TimeBlocksService);

  cycle = signal<Cycle | null>(null);
  stats = signal<Array<{ _id: string; count: number; totalHours: number }>>([]);
  totalHours = signal<number>(0);
  applying = signal(false);
  applyResult = signal<{ created: number; skipped: number; clientsProcessed: number } | null>(null);

  clientsWithStats = signal<ClientWithStats[]>([]);
  cycleTasks = signal<Task[]>([]);
  todayBlocks = signal<TimeBlock[]>([]);
  loading = signal(true);
  loadingToday = signal(true);

  Math = Math;

  // --- Derived data ---------------------------------------------------------

  daysRemaining = computed(() => {
    const c = this.cycle();
    if (!c) return 0;
    const end = new Date(c.endDate).getTime();
    const now = Date.now();
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  });

  cycleProgressPct = computed(() => {
    const c = this.cycle();
    if (!c) return 0;
    const start = new Date(c.startDate).getTime();
    const end = new Date(c.endDate).getTime();
    const now = Date.now();
    if (end <= start) return 100;
    const pct = ((now - start) / (end - start)) * 100;
    return Math.max(0, Math.min(100, pct));
  });

  totals = computed(() => {
    const list = this.clientsWithStats();
    const tasks = this.cycleTasks();
    let total = 0;
    let completed = 0;
    let pending = 0;
    let inProgress = 0;
    let blocked = 0;
    let hoursActual = 0;
    let hoursAssigned = 0;
    for (const c of list) {
      total += c.stats.currentCycleTasks.total;
      completed += c.stats.currentCycleTasks.completed;
      hoursActual += c.stats.currentCycleHours.actual;
      hoursAssigned += c.stats.currentCycleHours.assigned;
    }
    for (const t of tasks) {
      if (t.status === 'pending') pending++;
      else if (t.status === 'in_progress') inProgress++;
      else if (t.status === 'blocked') blocked++;
    }
    const hoursPct = hoursAssigned > 0 ? (hoursActual / hoursAssigned) * 100 : 0;
    return {
      total,
      completed,
      pending,
      inProgress,
      blocked,
      hoursActual,
      hoursAssigned,
      hoursPct,
    };
  });

  pendingByClient = computed<PendingByClient[]>(() => {
    const tasks = this.cycleTasks();
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
          total: c.stats.currentCycleTasks.total,
          completed: c.stats.currentCycleTasks.completed,
          hoursPct: c.stats.currentCycleHours.pct,
          hoursActual: c.stats.currentCycleHours.actual,
          hoursAssigned: c.stats.currentCycleHours.assigned,
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
    return this.cycleTasks()
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

  capacityAlerts = computed<CapacityAlert[]>(() => {
    const alerts: CapacityAlert[] = [];
    const cyclePct = this.cycleProgressPct();
    for (const c of this.clientsWithStats()) {
      const pct = c.stats.currentCycleHours.pct;
      const assigned = c.stats.currentCycleHours.assigned;
      const actual = c.stats.currentCycleHours.actual;
      if (assigned <= 0) continue;
      if (pct > 100) {
        alerts.push({
          clientId: String(c._id),
          name: c.name,
          tier: c.tier,
          pct,
          actual,
          assigned,
          level: 'over',
          message: `Over budget · ${actual.toFixed(1)}/${assigned}h (${pct.toFixed(0)}%)`,
        });
      } else if (pct >= 85) {
        alerts.push({
          clientId: String(c._id),
          name: c.name,
          tier: c.tier,
          pct,
          actual,
          assigned,
          level: 'warning',
          message: `Near limit · ${pct.toFixed(0)}% with ${this.daysRemaining()} days left`,
        });
      } else if (cyclePct >= 60 && pct < 25) {
        // Cycle is past 60% but barely any work logged
        alerts.push({
          clientId: String(c._id),
          name: c.name,
          tier: c.tier,
          pct,
          actual,
          assigned,
          level: 'idle',
          message: `Cycle ${cyclePct.toFixed(0)}% in, only ${pct.toFixed(0)}% logged`,
        });
      }
    }
    return alerts.sort((a, b) => {
      const order = { over: 0, warning: 1, idle: 2 };
      return order[a.level] - order[b.level];
    });
  });

  // --- Lifecycle ------------------------------------------------------------

  ngOnInit() {
    this.loadTodayBlocks();
    this.cyclesSvc.current().subscribe({
      next: (c) => {
        this.cycle.set(c);
        if (c?._id) {
          this.tasksSvc.list({ cycleId: c._id }).subscribe({
            next: (tasks) => {
              this.cycleTasks.set(tasks);
              this.loading.set(false);
            },
            error: () => this.loading.set(false),
          });
        } else {
          this.loading.set(false);
        }
      },
      error: () => {
        this.cycle.set(null);
        this.loading.set(false);
      },
    });

    this.clientsSvc.stats().subscribe((s) => {
      this.stats.set(s.perTier);
      this.totalHours.set(s.totalHoursPerCycle);
    });

    this.clientsSvc.listWithStats().subscribe((list) => {
      this.clientsWithStats.set(list);
    });
  }

  generateRecurring() {
    const c = this.cycle();
    if (!c?._id) return;
    this.applying.set(true);
    this.templates.applyRecurring(c._id).subscribe({
      next: (res) => {
        this.applyResult.set(res);
        this.applying.set(false);
        setTimeout(() => this.applyResult.set(null), 8000);
        // Refresh the data after generation
        if (c._id) {
          this.tasksSvc.list({ cycleId: c._id }).subscribe((tasks) => this.cycleTasks.set(tasks));
        }
        this.clientsSvc.listWithStats().subscribe((list) => this.clientsWithStats.set(list));
      },
      error: () => this.applying.set(false),
    });
  }

  // --- Helpers --------------------------------------------------------------

  hoursColor(pct: number): string {
    if (pct > 100) return 'text-danger-500';
    if (pct >= 80) return 'text-warning-500';
    if (pct >= 50) return 'text-positive-500';
    return 'text-ink-700';
  }

  hoursBarColor(pct: number): string {
    if (pct > 100) return 'bg-danger-500';
    if (pct >= 80) return 'bg-warning-500';
    if (pct >= 50) return 'bg-positive-500';
    return 'bg-ink-300';
  }

  alertTextClass(level: CapacityAlert['level']): string {
    if (level === 'over') return 'text-danger-500';
    if (level === 'warning') return 'text-warning-500';
    return 'text-ink-500';
  }

  // --- Today widget --------------------------------------------------------

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
    const ref = b.clientId as unknown;
    if (ref && typeof ref === 'object' && 'name' in ref) {
      return (ref as { name: string }).name;
    }
    return '—';
  }

  clientTier(b: TimeBlock): string {
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
      next: () => {
        this.loadTodayBlocks();
        // Refresh cycle tasks so actualHours updates propagate
        const c = this.cycle();
        if (c?._id) {
          this.tasksSvc.list({ cycleId: c._id }).subscribe((tasks) => this.cycleTasks.set(tasks));
        }
      },
    });
  }
}
