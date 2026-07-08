import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Client,
  Cycle,
  Task,
  TimeBlock,
  WorkingHoursConfig,
} from '@seo/shared';
import { CyclesService } from '../../core/cycles.service';
import { ClientsService } from '../../core/clients.service';
import { TasksService } from '../../core/tasks.service';
import {
  PullFromCalendarSummary,
  TimeBlocksService,
  WeeklyPlan,
} from '../../core/time-blocks.service';
import { WorkingHoursService } from '../../core/working-hours.service';

interface DayColumn {
  date: string;
  label: string;
  weekday: string;
  isToday: boolean;
  isWeekend: boolean;
  blocks: TimeBlock[];
}

interface BlockEditor {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  clientId: string;
  taskId: string;
  notes: string;
}

const HOUR_PX = 40; // pixels per hour in the grid
const MIN_PX = HOUR_PX / 60;

const CLIENT_COLORS = [
  { bg: 'bg-brand-50', border: 'border-brand-500', text: 'text-brand-700' },
  { bg: 'bg-sky-50', border: 'border-sky-500', text: 'text-sky-700' },
  { bg: 'bg-positive-100', border: 'border-positive-500', text: 'text-positive-500' },
  { bg: 'bg-warning-100', border: 'border-warning-500', text: 'text-warning-500' },
  { bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-700' },
  { bg: 'bg-danger-100', border: 'border-danger-500', text: 'text-danger-500' },
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns the Monday of the current week in YYYY-MM-DD format. Sunday
 * counts as belonging to the following week's Monday so the planner
 * defaults to "next Monday" when the user opens it on a Sunday.
 */
function todayMondayIso(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  // Sunday → advance to NEXT Monday (about to start a new week).
  // Mon-Sat → snap back to THIS week's Monday.
  const offset = day === 0 ? 1 : 1 - day;
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function weekdayLabel(iso: string): { weekday: string; label: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">My Schedule</h1>
          <p class="page-subtitle">
            Plan in your Google Calendar (primary calendar) — put the
            client name in the event title so the sync can match it.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <a routerLink="/settings/working-hours" class="btn-secondary">⚙ Working hours</a>
          <button class="btn-primary"
                  (click)="runPullFromCalendar()"
                  [disabled]="!cycle() || pulling()"
                  title="Reads events from the PRIMARY calendar of the Google account you connected in Settings → Integrations. Each event title must contain the client name to be matched.">
            {{ pulling() ? 'Pulling…' : '📅 Pull from Calendar' }}
          </button>
        </div>
      </header>

      <!-- Weekly plan generator. Sorts active clients by tier + last
           worked, drops one 5h slot per client into Mon-Fri × 2/day, and
           overflows to subsequent weeks when there are more than 10.
           Slots already present on Google Calendar (matched by client
           name) are preserved instead of re-created. -->
      <section class="card mb-4">
        <header class="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 class="text-sm font-bold text-ink-900 flex items-center gap-2">
              <span class="text-base">🗓️</span>
              <span>Weekly plan</span>
            </h2>
            <p class="text-[11px] text-ink-500 mt-0.5 leading-snug">
              5h per client, 10 clients per week. Tier A → B → C, oldest-worked first. Slots already on Google Calendar are preserved.
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="text-[11px] text-ink-500 inline-flex items-center gap-1.5">
              Week starting
              <input type="date" class="input !py-1 !text-xs !w-auto"
                     [(ngModel)]="planWeekStart"
                     (change)="loadPlan()" />
            </label>
            <button class="btn-secondary text-xs"
                    (click)="loadPlan()"
                    [disabled]="loadingPlan()">
              {{ loadingPlan() ? 'Loading…' : '↻ Regenerate' }}
            </button>
            <button class="btn-primary text-xs"
                    (click)="commitAndPush()"
                    [disabled]="!plan() || committing() || pushing()">
              {{ committing() || pushing() ? 'Sending…' : '📅 Send to Google Calendar' }}
            </button>
          </div>
        </header>

        @if (planError(); as e) {
          <div class="text-xs text-danger-500 bg-danger-100 border border-danger-500/30 rounded-md px-3 py-2 mb-3">
            {{ e }}
          </div>
        }
        @if (planMessage(); as m) {
          <div class="text-xs text-positive-500 bg-positive-100 border border-positive-500/30 rounded-md px-3 py-2 mb-3">
            {{ m }}
          </div>
        }

        @if (loadingPlan() && !plan()) {
          <div class="py-6 text-center text-xs text-ink-500">
            Computing weekly plan…
          </div>
        } @else if (plan(); as p) {
          @if (p.weeks.length === 0) {
            <div class="py-6 text-center text-xs text-ink-500">
              No active clients to schedule.
            </div>
          } @else {
            <div class="space-y-3">
              @for (w of p.weeks; track w.start; let i = $index) {
                <div class="border border-ink-200 rounded-md">
                  <header class="flex items-center justify-between px-3 py-2 border-b border-ink-100 bg-ink-50/40">
                    <div class="text-[11px] font-bold uppercase tracking-wider text-ink-700">
                      Week {{ i + 1 }} · {{ w.start | date: 'MMM d' }} – {{ w.end | date: 'MMM d' }}
                    </div>
                    <div class="text-[10px] text-ink-500">
                      {{ w.slots.length }} client{{ w.slots.length === 1 ? '' : 's' }}
                    </div>
                  </header>
                  <ul class="divide-y divide-ink-100">
                    @for (s of w.slots; track s.clientId + s.date + s.startTime) {
                      <li class="flex items-center gap-3 px-3 py-2 text-xs">
                        <span [class]="'tier-' + s.tier">{{ s.tier }}</span>
                        <span class="font-semibold text-ink-900 flex-1 truncate">{{ s.clientName }}</span>
                        @if (s.source === 'calendar') {
                          <span class="text-[10px] font-semibold text-sky-600 bg-sky-100 px-1.5 py-0.5 rounded">
                            On calendar
                          </span>
                        }
                        @if (s.conflict) {
                          <span class="text-[10px] font-semibold text-warning-500 bg-warning-100 px-1.5 py-0.5 rounded"
                                [title]="s.conflict.existingTitle">
                            No free slot
                          </span>
                        } @else {
                          <span class="text-ink-600 tabular-nums">
                            {{ dayLabel(s.date) }} · {{ s.startTime }}–{{ s.endTime }}
                          </span>
                        }
                        @if (s.googleEventLink) {
                          <a [href]="s.googleEventLink" target="_blank" rel="noopener"
                             class="text-[10px] text-sky-600 hover:underline">Open</a>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
            @if (p.unassigned > 0) {
              <div class="mt-3 text-[11px] text-warning-500">
                ⚠ {{ p.unassigned }} slot{{ p.unassigned === 1 ? '' : 's' }} could not be placed automatically — the week is already full of pre-existing calendar events.
              </div>
            }
          }
        }
      </section>

      <!-- Cycle bar -->
      @if (cycle(); as c) {
        <div class="card mb-4 flex items-center justify-between gap-3">
          <div>
            <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider">Planning cycle</div>
            <div class="flex items-baseline gap-2 mt-0.5">
              <span class="text-lg font-bold text-ink-900">{{ c.label }}</span>
              <span class="badge-neutral capitalize">{{ c.status }}</span>
            </div>
            <div class="text-xs text-ink-500 mt-0.5">
              {{ c.startDate | date: 'mediumDate' }} → {{ c.endDate | date: 'mediumDate' }}
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="text-right">
              <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Scheduled</div>
              <div class="text-base font-bold text-ink-900">{{ scheduledHours() | number: '1.1-1' }}h</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Completed</div>
              <div class="text-base font-bold text-positive-500">{{ completedHours() | number: '1.1-1' }}h</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-400">Capacity</div>
              <div class="text-base font-bold text-ink-700">{{ totalCapacityHours() | number: '1.0-0' }}h</div>
            </div>
          </div>
        </div>
      }

      <!-- Week navigator -->
      <div class="card mb-4 flex items-center justify-between gap-2">
        <button class="btn-ghost" (click)="shiftWeek(-1)" [disabled]="!canShiftBack()">← Prev week</button>
        <div class="text-sm font-semibold text-ink-900">
          {{ weekStartLabel() }} — {{ weekEndLabel() }}
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-ghost" (click)="goToToday()">Today</button>
          <button class="btn-ghost" (click)="shiftWeek(1)" [disabled]="!canShiftForward()">Next week →</button>
        </div>
      </div>

      @if (pullResult(); as r) {
        <div class="card mb-4 border-l-4 border-positive-500 bg-positive-100/30 text-sm">
          <div class="font-semibold text-ink-900 mb-1">
            ✓ Pulled {{ r.totalEvents }} event(s) from Google Calendar
          </div>
          <div class="text-xs text-ink-600">
            {{ r.created }} block(s) created
            @if (r.removed) { · {{ r.removed }} previous planned block(s) replaced }
            @if (r.skippedKept) { · {{ r.skippedKept }} kept (in-progress / completed) }
          </div>
          @if (r.unmatched.length) {
            <div class="mt-2 text-xs text-warning-500">
              <strong>{{ r.unmatched.length }} event(s) skipped — no matching client name in title:</strong>
              <ul class="list-disc pl-5 mt-1">
                @for (u of r.unmatched.slice(0, 6); track u.startsAt) {
                  <li>{{ u.title }} <span class="text-ink-500">· {{ u.startsAt | date: 'short' }}</span></li>
                }
                @if (r.unmatched.length > 6) {
                  <li class="text-ink-500">…and {{ r.unmatched.length - 6 }} more</li>
                }
              </ul>
            </div>
          }
          <button class="text-[11px] text-ink-500 hover:text-ink-900 mt-2"
                  (click)="pullResult.set(null)">
            Dismiss
          </button>
        </div>
      }
      @if (pullError(); as e) {
        <div class="card mb-4 border-l-4 border-danger-500 bg-danger-100/30 text-sm">
          <div class="font-semibold text-ink-900 mb-1">Pull failed</div>
          <div class="text-xs text-ink-600">{{ e }}</div>
          @if (e.includes('Calendar') || e.includes('Google')) {
            <a routerLink="/profile/integrations" class="text-xs text-brand-600 underline mt-2 inline-block">
              Connect Google Calendar →
            </a>
          }
          <button class="text-[11px] text-ink-500 hover:text-ink-900 mt-2 block"
                  (click)="pullError.set(null)">
            Dismiss
          </button>
        </div>
      }

      <!-- Weekly grid -->
      @if (loading()) {
        <div class="card py-20 text-center text-ink-400 italic text-sm">Loading…</div>
      } @else {
        <div class="card-flush overflow-x-auto">
          <div class="grid" [style.gridTemplateColumns]="'60px repeat(7, minmax(140px, 1fr))'">
            <!-- Headers -->
            <div class="border-b border-ink-200"></div>
            @for (col of weekColumns(); track col.date) {
              <div [class]="'border-b border-ink-200 px-3 py-2 ' +
                            (col.isToday ? 'bg-brand-50' : (col.isWeekend ? 'bg-ink-50' : ''))">
                <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-500">{{ col.weekday }}</div>
                <div class="text-sm font-bold mt-0.5" [class.text-brand-600]="col.isToday">{{ col.label }}</div>
              </div>
            }

            <!-- Time slots -->
            <div class="relative" [style.height.px]="gridHeight()">
              @for (h of hourLabels(); track h) {
                <div class="absolute left-0 right-0 text-[10px] text-ink-400 pr-2 text-right" [style.top.px]="(h - dayStart()) * HOUR_PX">
                  {{ formatHour(h) }}
                </div>
              }
            </div>
            @for (col of weekColumns(); track col.date) {
              <div [class]="'relative border-l border-ink-100 ' +
                            (col.isToday ? 'bg-brand-50/40' : (col.isWeekend ? 'bg-ink-50/50' : ''))"
                   [style.height.px]="gridHeight()">
                <!-- Hour grid lines -->
                @for (h of hourLabels(); track h) {
                  <div class="absolute left-0 right-0 border-t border-ink-100"
                       [style.top.px]="(h - dayStart()) * HOUR_PX"></div>
                }
                <!-- Now indicator -->
                @if (col.isToday && nowOffset() !== null) {
                  <div class="absolute left-0 right-0 h-px bg-danger-500 z-20"
                       [style.top.px]="nowOffset()">
                    <div class="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-danger-500"></div>
                  </div>
                }
                <!-- Blocks -->
                @for (b of col.blocks; track b._id) {
                  <button type="button"
                          (click)="editBlock(b)"
                          [class]="'absolute left-1 right-1 rounded-md border-l-4 px-2 py-1.5 text-left shadow-card hover:shadow-elevated transition overflow-hidden text-[11px] ' +
                                   (isReporting(b)
                                     ? 'bg-brand-50 border-brand-500'
                                     : (clientColor(asId(b.clientId)).bg + ' ' + clientColor(asId(b.clientId)).border)) + ' ' +
                                   (b.status === 'completed' ? 'opacity-60' : '') + ' ' +
                                   (b.status === 'in_progress' ? 'ring-2 ring-sky-500' : '')"
                          [style.top.px]="topOf(b)"
                          [style.height.px]="heightOf(b)">
                    <div class="font-semibold text-ink-900 truncate flex items-center gap-1">
                      @if (b.status === 'completed') { <span>✓</span> }
                      @else if (b.status === 'in_progress') { <span>▶</span> }
                      {{ clientName(b) }}
                    </div>
                    <div class="text-[10px] text-ink-500 truncate">
                      {{ b.startTime }} – {{ b.endTime }}
                    </div>
                    @if (taskTitle(b)) {
                      <div class="text-[10px] text-ink-600 truncate mt-0.5">{{ taskTitle(b) }}</div>
                    } @else if (isReporting(b)) {
                      <div class="text-[10px] text-brand-600 truncate mt-0.5">
                        Cycle close · review &amp; send reports
                      </div>
                    }
                  </button>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Per-client allocation summary -->
      @if (perClientStats().length > 0) {
        <div class="card mt-4">
          <h3 class="text-sm font-semibold text-ink-900 mb-3">Allocation this cycle</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            @for (s of perClientStats(); track s.clientId) {
              <div class="border border-ink-200 rounded-md p-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span [class]="'tier-' + s.tier">{{ s.tier }}</span>
                    <span class="font-semibold text-ink-900 text-sm truncate">{{ s.name }}</span>
                  </div>
                  <div class="text-xs font-bold" [ngClass]="allocationColor(s)">
                    {{ s.scheduledHours | number: '1.1-1' }} / {{ s.targetHours | number: '1.0-1' }}h
                  </div>
                </div>
                <div class="h-1.5 bg-ink-100 rounded-full overflow-hidden mt-2">
                  <div class="h-full transition-all" [ngClass]="allocationBar(s)"
                       [style.width.%]="Math.min((s.scheduledHours / Math.max(s.targetHours, 0.1)) * 100, 100)"></div>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Block editor modal -->
      @if (editor(); as e) {
        <div class="fixed inset-0 bg-ink-900/60 z-50 flex items-center justify-center p-4"
             (click)="closeEditor()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
               (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-bold text-ink-900">
                {{ e.id ? 'Edit block' : 'New block' }}
              </h2>
              <button (click)="closeEditor()" class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
            </div>

            <div class="space-y-3">
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="label">Date</label>
                  <input type="date" class="input" [(ngModel)]="e.date" />
                </div>
                <div>
                  <label class="label">Start</label>
                  <input type="time" class="input" [(ngModel)]="e.startTime" />
                </div>
                <div>
                  <label class="label">End</label>
                  <input type="time" class="input" [(ngModel)]="e.endTime" />
                </div>
              </div>
              <div>
                <label class="label">Client</label>
                <select class="input" [(ngModel)]="e.clientId">
                  <option value="">— pick one —</option>
                  @for (c of clients(); track c._id) {
                    <option [value]="c._id">{{ c.name }} ({{ c.tier }})</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Task (optional)</label>
                <select class="input" [(ngModel)]="e.taskId">
                  <option value="">— generic block —</option>
                  @for (t of tasksForClient(e.clientId); track t._id) {
                    <option [value]="t._id">{{ t.title }} ({{ t.category }})</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Notes</label>
                <textarea class="input" rows="2" [(ngModel)]="e.notes"></textarea>
              </div>

              @if (editorError()) {
                <div class="text-xs text-danger-500">{{ editorError() }}</div>
              }
            </div>

            <div class="flex items-center justify-between mt-5 pt-4 border-t border-ink-100">
              @if (e.id && editingStatus()) {
                <div class="flex gap-1">
                  @if (editingStatus() !== 'completed') {
                    <button class="btn-secondary" (click)="completeBlock()">✓ Complete</button>
                  }
                  <button class="btn-ghost text-danger-500" (click)="deleteBlock()">Delete</button>
                </div>
              } @else {
                <div></div>
              }
              <div class="flex gap-2">
                <button class="btn-secondary" (click)="closeEditor()">Cancel</button>
                <button class="btn-primary" (click)="saveEditor()" [disabled]="savingEditor()">
                  {{ savingEditor() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ScheduleComponent implements OnInit {
  HOUR_PX = HOUR_PX;
  Math = Math;

  private cyclesSvc = inject(CyclesService);
  private clientsSvc = inject(ClientsService);
  private tasksSvc = inject(TasksService);
  private blocksSvc = inject(TimeBlocksService);
  private workingHoursSvc = inject(WorkingHoursService);

  cycle = signal<Cycle | null>(null);
  clients = signal<Client[]>([]);
  tasks = signal<Task[]>([]);
  workingHours = signal<WorkingHoursConfig | null>(null);
  blocks = signal<TimeBlock[]>([]);
  loading = signal(true);

  weekStart = signal<string>('');
  nowOffsetMin = signal<number | null>(null);

  pulling = signal(false);
  pullResult = signal<PullFromCalendarSummary | null>(null);
  pullError = signal<string | null>(null);

  // Weekly-plan state
  planWeekStart = todayMondayIso();
  plan = signal<WeeklyPlan | null>(null);
  loadingPlan = signal(false);
  planError = signal<string | null>(null);
  planMessage = signal<string | null>(null);
  committing = signal(false);
  pushing = signal(false);

  editor = signal<BlockEditor | null>(null);
  editingStatus = signal<string | null>(null);
  editorError = signal<string | null>(null);
  savingEditor = signal(false);

  // --- Derived --------------------------------------------------------------

  dayStart = computed(() => {
    const wh = this.workingHours();
    if (!wh || !wh.timeBlocks.length) return 7;
    const min = wh.timeBlocks.reduce(
      (acc, tb) => Math.min(acc, Number(tb.start.split(':')[0])),
      24,
    );
    return Math.max(0, min - 1);
  });

  dayEnd = computed(() => {
    const wh = this.workingHours();
    if (!wh || !wh.timeBlocks.length) return 19;
    const max = wh.timeBlocks.reduce(
      (acc, tb) => Math.max(acc, Number(tb.end.split(':')[0]) + (tb.end.endsWith(':00') ? 0 : 1)),
      0,
    );
    return Math.min(24, max + 1);
  });

  hourLabels = computed(() => {
    const arr: number[] = [];
    for (let h = this.dayStart(); h <= this.dayEnd(); h++) arr.push(h);
    return arr;
  });

  gridHeight = computed(() => (this.dayEnd() - this.dayStart()) * HOUR_PX);

  weekColumns = computed<DayColumn[]>(() => {
    const start = this.weekStart();
    if (!start) return [];
    const today = todayIso();
    const blocksByDate = new Map<string, TimeBlock[]>();
    for (const b of this.blocks()) {
      const arr = blocksByDate.get(b.date) || [];
      arr.push(b);
      blocksByDate.set(b.date, arr);
    }
    const cols: DayColumn[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDays(start, i);
      const [y, m, d] = iso.split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const { weekday, label } = weekdayLabel(iso);
      cols.push({
        date: iso,
        weekday,
        label,
        isToday: iso === today,
        isWeekend: dow === 0 || dow === 6,
        blocks: (blocksByDate.get(iso) || []).slice().sort((a, b) => a.startTime.localeCompare(b.startTime)),
      });
    }
    return cols;
  });

  nowOffset = computed(() => {
    const offset = this.nowOffsetMin();
    if (offset == null) return null;
    return offset * MIN_PX;
  });

  scheduledHours = computed(
    () => this.blocks().reduce((acc, b) => acc + b.durationMinutes / 60, 0),
  );

  completedHours = computed(() =>
    this.blocks()
      .filter((b) => b.status === 'completed')
      .reduce((acc, b) => acc + ((b.actualMinutes ?? b.durationMinutes) / 60), 0),
  );

  totalCapacityHours = computed(() => {
    const wh = this.workingHours();
    const c = this.cycle();
    if (!wh || !c) return 0;
    const start = new Date(c.startDate);
    const end = new Date(c.endDate);
    const daysOff = new Set(wh.daysOff || []);
    const workDays = new Set(wh.workDays || []);
    let days = 0;
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (!workDays.has(d.getUTCDay())) continue;
      if (daysOff.has(iso)) continue;
      days++;
    }
    return days * wh.dailyCapHours;
  });

  perClientStats = computed(() => {
    const clientsById = new Map(this.clients().map((c) => [String(c._id), c]));
    const grouped = new Map<string, { scheduledHours: number }>();
    for (const b of this.blocks()) {
      const cid = this.asId(b.clientId);
      const entry = grouped.get(cid) || { scheduledHours: 0 };
      entry.scheduledHours += b.durationMinutes / 60;
      grouped.set(cid, entry);
    }
    return Array.from(grouped.entries())
      .map(([cid, g]) => {
        const client = clientsById.get(cid);
        return {
          clientId: cid,
          name: client?.name || 'Unknown',
          tier: (client?.tier as 'A' | 'B' | 'C') || 'C',
          scheduledHours: g.scheduledHours,
          targetHours: client?.hoursPerCycle || 0,
        };
      })
      .sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name));
  });

  weekStartLabel = computed(() => {
    const ws = this.weekStart();
    if (!ws) return '';
    return weekdayLabel(ws).label;
  });

  weekEndLabel = computed(() => {
    const ws = this.weekStart();
    if (!ws) return '';
    return weekdayLabel(addDays(ws, 6)).label;
  });

  canShiftBack = computed(() => {
    const c = this.cycle();
    if (!c || !this.weekStart()) return true;
    const cs = new Date(c.startDate);
    const cycleStart = `${cs.getUTCFullYear()}-${String(cs.getUTCMonth() + 1).padStart(2, '0')}-${String(cs.getUTCDate()).padStart(2, '0')}`;
    return this.weekStart() > cycleStart;
  });

  canShiftForward = computed(() => {
    const c = this.cycle();
    if (!c || !this.weekStart()) return true;
    const ce = new Date(c.endDate);
    const cycleEnd = `${ce.getUTCFullYear()}-${String(ce.getUTCMonth() + 1).padStart(2, '0')}-${String(ce.getUTCDate()).padStart(2, '0')}`;
    return addDays(this.weekStart(), 6) < cycleEnd;
  });

  // --- Lifecycle ------------------------------------------------------------

  ngOnInit() {
    this.workingHoursSvc.me().subscribe({
      next: (wh) => this.workingHours.set(wh),
      error: () => null,
    });

    this.cyclesSvc.current().subscribe({
      next: (c) => {
        this.cycle.set(c);
        this.setWeekStartFromCycle(c);
        if (c?._id) {
          this.loadCycleData(c._id);
        } else {
          this.loading.set(false);
        }
      },
      error: () => {
        this.cycle.set(null);
        this.loading.set(false);
      },
    });

    this.clientsSvc.list().subscribe((cs) => this.clients.set(cs));
    this.updateNow();
    setInterval(() => this.updateNow(), 60_000);
    this.loadPlan();
  }

  private setWeekStartFromCycle(c: Cycle | null) {
    if (!c) return;
    const today = new Date();
    const start = new Date(c.startDate);
    const end = new Date(c.endDate);
    const target = today >= start && today <= end ? today : start;
    const targetIso = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
    const [y, m, d] = targetIso.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    // Move back to Monday (1). If Sunday (0), back 6 days.
    const offset = dow === 0 ? 6 : dow - 1;
    this.weekStart.set(addDays(targetIso, -offset));
  }

  private loadCycleData(cycleId: string) {
    this.loading.set(true);
    this.blocksSvc.list({ cycleId }).subscribe({
      next: (bs) => {
        this.blocks.set(bs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.tasksSvc.list({ cycleId }).subscribe((t) => this.tasks.set(t));
  }

  shiftWeek(n: number) {
    this.weekStart.set(addDays(this.weekStart(), 7 * n));
  }

  goToToday() {
    const c = this.cycle();
    if (c) this.setWeekStartFromCycle(c);
    else this.weekStart.set(addDays(todayIso(), -((new Date().getDay() || 7) - 1)));
  }

  // --- Pull from Google Calendar -------------------------------------------

  // --- Weekly plan ---------------------------------------------------------

  loadPlan() {
    if (!this.planWeekStart) return;
    this.loadingPlan.set(true);
    this.planError.set(null);
    this.planMessage.set(null);
    this.blocksSvc.weeklyPlan(this.planWeekStart).subscribe({
      next: (p) => {
        this.plan.set(p);
        this.loadingPlan.set(false);
      },
      error: (err) => {
        this.loadingPlan.set(false);
        this.planError.set(
          err?.error?.message || 'Could not generate the weekly plan.',
        );
      },
    });
  }

  /**
   * One-click flow: persist the plan as TimeBlocks, then push
   * calendar-less slots to Google Calendar. Conflict detection happens
   * server-side inside pushWeeklyPlanToCalendar so the user sees a
   * count of conflicts in the success message.
   */
  commitAndPush() {
    const p = this.plan();
    if (!p) return;
    this.committing.set(true);
    this.planError.set(null);
    this.planMessage.set(null);
    this.blocksSvc.commitWeeklyPlan(this.planWeekStart, p).subscribe({
      next: (commitRes) => {
        this.committing.set(false);
        this.pushing.set(true);
        this.blocksSvc.pushWeeklyPlanToCalendar(p).subscribe({
          next: (pushRes) => {
            this.pushing.set(false);
            const parts: string[] = [];
            if (commitRes.created > 0)
              parts.push(`${commitRes.created} block(s) saved`);
            if (pushRes.pushed > 0)
              parts.push(`${pushRes.pushed} event(s) pushed to Google Calendar`);
            if (pushRes.conflicts > 0)
              parts.push(`${pushRes.conflicts} skipped (calendar conflict)`);
            this.planMessage.set(
              parts.length ? parts.join(' · ') : 'Everything already scheduled.',
            );
            const c = this.cycle();
            if (c?._id) this.loadCycleData(c._id);
            setTimeout(() => this.planMessage.set(null), 6000);
          },
          error: (err) => {
            this.pushing.set(false);
            this.planError.set(
              err?.error?.message ||
                'Blocks saved but pushing to Google Calendar failed.',
            );
          },
        });
      },
      error: (err) => {
        this.committing.set(false);
        this.planError.set(
          err?.error?.message || 'Could not save the weekly plan.',
        );
      },
    });
  }

  dayLabel(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  runPullFromCalendar() {
    const c = this.cycle();
    if (!c?._id) return;
    this.pulling.set(true);
    this.pullResult.set(null);
    this.pullError.set(null);
    this.blocksSvc.pullFromCalendar(c._id).subscribe({
      next: (res) => {
        this.pullResult.set(res);
        this.pulling.set(false);
        this.loadCycleData(c._id!);
      },
      error: (err) => {
        this.pulling.set(false);
        this.pullError.set(
          err?.error?.message ||
            'Could not pull events from Google Calendar. Make sure Google Calendar is connected in Settings → Integrations.',
        );
      },
    });
  }

  // --- Editor ---------------------------------------------------------------

  editBlock(b: TimeBlock) {
    this.editor.set({
      id: b._id,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      clientId: this.asId(b.clientId),
      taskId: b.taskId ? this.asId(b.taskId) : '',
      notes: b.notes || '',
    });
    this.editingStatus.set(b.status);
    this.editorError.set(null);
  }

  newBlock(date: string) {
    this.editor.set({
      date,
      startTime: '09:00',
      endTime: '10:30',
      clientId: '',
      taskId: '',
      notes: '',
    });
    this.editingStatus.set(null);
    this.editorError.set(null);
  }

  closeEditor() {
    this.editor.set(null);
    this.editingStatus.set(null);
    this.editorError.set(null);
  }

  saveEditor() {
    const e = this.editor();
    const c = this.cycle();
    if (!e || !c?._id) return;
    if (!e.clientId) {
      this.editorError.set('Pick a client');
      return;
    }
    if (minutesBetween(e.startTime, e.endTime) <= 0) {
      this.editorError.set('End time must be after start time');
      return;
    }
    this.savingEditor.set(true);
    const dto = {
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      clientId: e.clientId,
      taskId: e.taskId || undefined,
      notes: e.notes,
    };
    const obs = e.id
      ? this.blocksSvc.update(e.id, { ...dto, taskId: e.taskId || null })
      : this.blocksSvc.create({ ...dto, cycleId: c._id });
    obs.subscribe({
      next: () => {
        this.savingEditor.set(false);
        this.closeEditor();
        this.loadCycleData(c._id!);
      },
      error: (err) => {
        this.savingEditor.set(false);
        this.editorError.set(err?.error?.message || 'Could not save');
      },
    });
  }

  completeBlock() {
    const e = this.editor();
    if (!e?.id || !this.cycle()?._id) return;
    this.blocksSvc.complete(e.id).subscribe({
      next: () => {
        this.closeEditor();
        this.loadCycleData(this.cycle()!._id!);
      },
    });
  }

  deleteBlock() {
    const e = this.editor();
    if (!e?.id || !this.cycle()?._id) return;
    if (!confirm('Delete this block?')) return;
    this.blocksSvc.remove(e.id).subscribe({
      next: () => {
        this.closeEditor();
        this.loadCycleData(this.cycle()!._id!);
      },
    });
  }

  // --- Helpers --------------------------------------------------------------

  tasksForClient(clientId: string): Task[] {
    if (!clientId) return [];
    return this.tasks()
      .filter((t) => String(t.clientId) === clientId && t.status !== 'completed')
      .sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.priority] || 5) - (order[b.priority] || 5);
      });
  }

  asId(ref: unknown): string {
    if (!ref) return '';
    if (typeof ref === 'string') return ref;
    if (typeof ref === 'object' && '_id' in ref) return String((ref as { _id: unknown })._id);
    return String(ref);
  }

  clientName(b: TimeBlock): string {
    if (b.kind === 'reporting') return '📊 Send client reports';
    const ref = b.clientId as unknown;
    if (ref && typeof ref === 'object' && 'name' in ref) {
      return (ref as { name: string }).name;
    }
    return '—';
  }

  isReporting(b: TimeBlock): boolean {
    return b.kind === 'reporting';
  }

  taskTitle(b: TimeBlock): string | null {
    const ref = b.taskId as unknown;
    if (ref && typeof ref === 'object' && 'title' in ref) {
      return (ref as { title: string }).title;
    }
    return null;
  }

  topOf(b: TimeBlock): number {
    const [h, m] = b.startTime.split(':').map(Number);
    return (h * 60 + m - this.dayStart() * 60) * MIN_PX;
  }

  heightOf(b: TimeBlock): number {
    return b.durationMinutes * MIN_PX;
  }

  formatHour(h: number): string {
    if (h === 0) return '12am';
    if (h < 12) return `${h}am`;
    if (h === 12) return '12pm';
    return `${h - 12}pm`;
  }

  clientColor(clientId: string) {
    return CLIENT_COLORS[hash(clientId) % CLIENT_COLORS.length];
  }

  allocationColor(s: { scheduledHours: number; targetHours: number }): string {
    const pct = s.targetHours > 0 ? (s.scheduledHours / s.targetHours) * 100 : 0;
    if (pct > 110) return 'text-danger-500';
    if (pct < 80) return 'text-warning-500';
    return 'text-positive-500';
  }

  allocationBar(s: { scheduledHours: number; targetHours: number }): string {
    const pct = s.targetHours > 0 ? (s.scheduledHours / s.targetHours) * 100 : 0;
    if (pct > 110) return 'bg-danger-500';
    if (pct < 80) return 'bg-warning-500';
    return 'bg-positive-500';
  }

  private updateNow() {
    const today = todayIso();
    const cols = this.weekColumns();
    if (!cols.some((c) => c.date === today)) {
      this.nowOffsetMin.set(null);
      return;
    }
    const n = new Date();
    const minutes = n.getHours() * 60 + n.getMinutes();
    const startMin = this.dayStart() * 60;
    const endMin = this.dayEnd() * 60;
    if (minutes < startMin || minutes > endMin) {
      this.nowOffsetMin.set(null);
      return;
    }
    this.nowOffsetMin.set(minutes - startMin);
  }
}
