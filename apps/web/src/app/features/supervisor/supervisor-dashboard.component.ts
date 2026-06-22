import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SanitizerService } from '../../core/sanitizer.service';
import {
  SupervisorDashboard,
  SupervisorService,
  SupervisorTask,
} from '../../core/supervisor.service';

type Tab = 'tasks' | 'kpis';

@Component({
  selector: 'app-supervisor-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, DecimalPipe],
  template: `
    <div class="min-h-screen bg-ink-50">
      <header class="bg-white border-b border-ink-200 px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <a [routerLink]="['/supervisor', 'clients', clientId()]"
             class="text-sm text-ink-500 hover:text-ink-900">← Cycles</a>
          @if (data(); as d) {
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-semibold text-ink-900 truncate">{{ d.client.name }}</span>
              <span class="text-ink-400">·</span>
              <span class="text-sm text-ink-700">{{ d.cycle.label }}</span>
              <span class="badge-neutral capitalize text-[10px]">{{ d.cycle.status }}</span>
            </div>
          }
        </div>
        <button class="text-xs text-ink-500 hover:text-ink-900" (click)="logout()">
          Sign out
        </button>
      </header>

      @if (loading()) {
        <div class="max-w-5xl mx-auto px-4 py-10 text-center text-ink-400 italic">Loading…</div>
      } @else if (data(); as d) {
        <div class="max-w-5xl mx-auto px-4 py-6">
          <!-- Tab strip -->
          <div class="flex items-center gap-1 mb-4 border-b border-ink-200">
            <button class="px-3 py-2 text-sm font-medium"
                    [class.text-brand-600]="tab() === 'tasks'"
                    [class.border-b-2]="tab() === 'tasks'"
                    [class.border-brand-500]="tab() === 'tasks'"
                    [class.text-ink-500]="tab() !== 'tasks'"
                    (click)="tab.set('tasks')">
              Tasks ({{ d.tasks.length }})
            </button>
            <button class="px-3 py-2 text-sm font-medium"
                    [class.text-brand-600]="tab() === 'kpis'"
                    [class.border-b-2]="tab() === 'kpis'"
                    [class.border-brand-500]="tab() === 'kpis'"
                    [class.text-ink-500]="tab() !== 'kpis'"
                    (click)="tab.set('kpis')">
              KPIs & Notes
            </button>
          </div>

          @if (tab() === 'tasks') {
            <!-- Status filter -->
            <div class="flex flex-wrap items-center gap-2 mb-4">
              @for (s of statusFilters; track s.key) {
                <button
                  type="button"
                  (click)="statusFilter.set(s.key)"
                  [class]="'px-3 py-1 text-xs font-semibold rounded-md border transition ' +
                    (statusFilter() === s.key ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400')">
                  {{ s.label }}
                  <span class="ml-1 text-[10px] opacity-70">{{ count(s.key) }}</span>
                </button>
              }
            </div>

            @if (filteredTasks().length === 0) {
              <div class="card py-10 text-center text-ink-400 italic text-sm">
                No tasks in this view.
              </div>
            } @else {
              <div class="space-y-3">
                @for (t of filteredTasks(); track t._id) {
                  <article class="card p-4">
                    <div class="flex items-start justify-between gap-3 mb-2">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5 mb-1">
                          <span [class]="'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' + statusPill(t.status)">
                            {{ t.status.replace('_', ' ') }}
                          </span>
                          <span class="badge-neutral text-[10px]">{{ t.category }}</span>
                          <span [class]="'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' + priorityClass(t.priority)">
                            {{ t.priority }}
                          </span>
                        </div>
                        <h3 class="font-semibold text-ink-900">{{ t.title }}</h3>
                      </div>
                      <div class="text-right flex-shrink-0">
                        <div class="text-[10px] text-ink-500">Hours</div>
                        <div class="text-sm font-semibold text-ink-900">
                          {{ t.actualHours | number: '1.1-1' }} / {{ t.estimatedHours | number: '1.0-1' }}
                        </div>
                      </div>
                    </div>

                    @if (t.description) {
                      <div class="rich-content text-xs text-ink-700 leading-relaxed mt-1 mb-3"
                           [innerHTML]="sanitizer.trustRichHtml(t.description)"></div>
                    }

                    <!-- Subtasks -->
                    @if (t.subtasks && t.subtasks.length) {
                      <div class="border-t border-ink-100 pt-2 mt-2">
                        <div class="text-[10px] font-semibold text-ink-500 uppercase tracking-wider mb-1">Subtasks</div>
                        <ul class="space-y-0.5">
                          @for (s of t.subtasks; track s.title) {
                            <li class="text-xs text-ink-700 flex items-center gap-1.5">
                              <span [class]="s.done ? 'text-positive-500' : 'text-ink-400'">
                                {{ s.done ? '✓' : '○' }}
                              </span>
                              <span [class.line-through]="s.done">{{ s.title }}</span>
                            </li>
                          }
                        </ul>
                      </div>
                    }

                    <!-- Comments thread -->
                    <div class="border-t border-ink-100 pt-3 mt-3">
                      <div class="text-[10px] font-semibold text-ink-500 uppercase tracking-wider mb-2">
                        Comments ({{ t.comments.length }})
                      </div>
                      @if (t.comments.length) {
                        <div class="space-y-2 mb-3">
                          @for (c of t.comments; track c.createdAt) {
                            <div [class]="'rounded-md px-3 py-2 text-xs ' +
                                  (c.authorRole === 'supervisor'
                                    ? 'bg-brand-50 border border-brand-500/20'
                                    : 'bg-ink-50 border border-ink-200')">
                              <div class="flex items-center justify-between text-[10px] text-ink-500 mb-1">
                                <span class="font-semibold">
                                  {{ c.authorName || (c.authorRole === 'supervisor' ? 'Supervisor' : 'Team') }}
                                </span>
                                <span>{{ c.createdAt | date: 'short' }}</span>
                              </div>
                              <div class="text-ink-800 whitespace-pre-wrap">{{ c.content }}</div>
                            </div>
                          }
                        </div>
                      }

                      <div class="flex gap-2">
                        <textarea class="input text-xs flex-1"
                                  rows="2"
                                  [(ngModel)]="commentDrafts[t._id]"
                                  placeholder="Add a note for the team…"></textarea>
                        <button class="btn-primary text-xs whitespace-nowrap"
                                [disabled]="!commentDrafts[t._id]?.trim() || posting()[t._id]"
                                (click)="postComment(t)">
                          {{ posting()[t._id] ? '…' : 'Post' }}
                        </button>
                      </div>
                    </div>
                  </article>
                }
              </div>
            }
          } @else if (tab() === 'kpis') {
            @if (!d.report) {
              <div class="card py-10 text-center text-ink-400 italic text-sm">
                No report saved for this cycle yet.
              </div>
            } @else {
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                @for (k of kpiTiles(); track k.key) {
                  <div class="card px-3 py-3">
                    <div class="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">
                      {{ k.label }}
                    </div>
                    <div class="text-xl font-bold text-ink-900 mt-0.5">
                      {{ k.value !== null && k.value !== undefined ? k.value : '—' }}
                    </div>
                  </div>
                }
              </div>

              @if (d.report.executiveSummary) {
                <section class="card p-4 mb-3">
                  <h3 class="text-sm font-bold text-ink-900 mb-2">Executive Summary</h3>
                  <div class="rich-content text-sm text-ink-700"
                       [innerHTML]="sanitizer.trustRichHtml(d.report.executiveSummary)"></div>
                </section>
              }
              @if (d.report.clientBlockers) {
                <section class="card p-4 mb-3">
                  <h3 class="text-sm font-bold text-ink-900 mb-2">Client Blockers</h3>
                  <div class="rich-content text-sm text-ink-700"
                       [innerHTML]="sanitizer.trustRichHtml(d.report.clientBlockers)"></div>
                </section>
              }
              @if (d.report.finalConsiderations) {
                <section class="card p-4 mb-3">
                  <h3 class="text-sm font-bold text-ink-900 mb-2">Final Considerations</h3>
                  <div class="rich-content text-sm text-ink-700"
                       [innerHTML]="sanitizer.trustRichHtml(d.report.finalConsiderations)"></div>
                </section>
              }
            }
          }
        </div>
      }
    </div>
  `,
})
export class SupervisorDashboardComponent implements OnInit {
  private svc = inject(SupervisorService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  sanitizer = inject(SanitizerService);

  clientId = signal<string>('');
  cycleId = signal<string>('');
  data = signal<SupervisorDashboard | null>(null);
  loading = signal(true);
  tab = signal<Tab>('tasks');
  statusFilter = signal<string>('all');
  commentDrafts: Record<string, string> = {};
  posting = signal<Record<string, boolean>>({});

  statusFilters = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'blocked', label: 'Blocked' },
  ];

  filteredTasks = computed<SupervisorTask[]>(() => {
    const d = this.data();
    if (!d) return [];
    if (this.statusFilter() === 'all') return d.tasks;
    return d.tasks.filter((t) => t.status === this.statusFilter());
  });

  kpiTiles = computed(() => {
    const r = this.data()?.report;
    if (!r) return [];
    const k = (r.kpis || {}) as Record<string, number | null | undefined>;
    return [
      { key: 'sessions', label: 'Organic sessions', value: k['organicSessions'] },
      { key: 'users', label: 'New users', value: k['newUsers'] },
      { key: 'conversions', label: 'Conversions', value: k['conversions'] },
      { key: 'ctr', label: 'CTR (%)', value: k['ctr'] },
      { key: 'clicks', label: 'Clicks', value: k['clicks'] },
      { key: 'impressions', label: 'Impressions', value: k['impressions'] },
      { key: 'avgPos', label: 'Avg position', value: k['avgPosition'] },
      { key: 'indexed', label: 'Indexed pages', value: k['indexedPages'] },
    ];
  });

  ngOnInit() {
    const cid = this.route.snapshot.paramMap.get('clientId');
    const yid = this.route.snapshot.paramMap.get('cycleId');
    if (!cid || !yid) {
      this.router.navigate(['/supervisor/clients']);
      return;
    }
    this.clientId.set(cid);
    this.cycleId.set(yid);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.svc.getDashboard(this.clientId(), this.cycleId()).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.svc.logout();
        this.router.navigate(['/supervisor']);
      },
    });
  }

  count(filter: string): number {
    const d = this.data();
    if (!d) return 0;
    if (filter === 'all') return d.tasks.length;
    return d.tasks.filter((t) => t.status === filter).length;
  }

  statusPill(s: string): string {
    if (s === 'completed') return 'bg-positive-100 text-positive-500';
    if (s === 'in_progress') return 'bg-sky-100 text-sky-700';
    if (s === 'blocked') return 'bg-danger-100 text-danger-500';
    return 'bg-ink-100 text-ink-600';
  }

  priorityClass(p: string): string {
    if (p === 'high') return 'bg-danger-100 text-danger-500';
    if (p === 'medium') return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-500';
  }

  postComment(t: SupervisorTask) {
    const content = (this.commentDrafts[t._id] || '').trim();
    if (!content) return;
    this.posting.set({ ...this.posting(), [t._id]: true });
    this.svc.addComment(t._id, content).subscribe({
      next: (comments) => {
        const data = this.data();
        if (data) {
          const updated = {
            ...data,
            tasks: data.tasks.map((x) =>
              x._id === t._id ? { ...x, comments } : x,
            ),
          };
          this.data.set(updated);
        }
        this.commentDrafts[t._id] = '';
        const next = { ...this.posting() };
        delete next[t._id];
        this.posting.set(next);
      },
      error: () => {
        const next = { ...this.posting() };
        delete next[t._id];
        this.posting.set(next);
      },
    });
  }

  logout() {
    this.svc.logout();
    this.router.navigate(['/supervisor']);
  }
}
