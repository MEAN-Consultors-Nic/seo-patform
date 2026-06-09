import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  HostListener,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillEditorComponent } from 'ngx-quill';
import {
  Cycle,
  Task,
  TaskAttachment,
  TaskCategory,
  TaskStatus,
} from '@seo/shared';
import { CyclesService } from '../../../core/cycles.service';
import { TasksService } from '../../../core/tasks.service';
import { SanitizerService } from '../../../core/sanitizer.service';
import { AttachmentsStripComponent } from '../../../shared/attachments/attachments-strip.component';

type StatusFilter = TaskStatus | 'all';

interface StatusOption {
  value: TaskStatus;
  label: string;
  icon: string;
  bar: string;
  dot: string;
  text: string;
  pill: string;
}

const STATUS_META: Record<TaskStatus, StatusOption> = {
  pending: {
    value: 'pending',
    label: 'Pending',
    icon: '⏳',
    bar: 'bg-ink-300',
    dot: 'bg-ink-400',
    text: 'text-ink-600',
    pill: 'bg-ink-100 text-ink-700',
  },
  in_progress: {
    value: 'in_progress',
    label: 'In progress',
    icon: '🔄',
    bar: 'bg-sky-500',
    dot: 'bg-sky-500',
    text: 'text-sky-600',
    pill: 'bg-sky-50 text-sky-600',
  },
  completed: {
    value: 'completed',
    label: 'Completed',
    icon: '✓',
    bar: 'bg-positive-500',
    dot: 'bg-positive-500',
    text: 'text-positive-500',
    pill: 'bg-positive-100 text-positive-500',
  },
  blocked: {
    value: 'blocked',
    label: 'Blocked',
    icon: '⛔',
    bar: 'bg-danger-500',
    dot: 'bg-danger-500',
    text: 'text-danger-500',
    pill: 'bg-danger-100 text-danger-500',
  },
};

@Component({
  selector: 'app-client-tasks-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    QuillEditorComponent,
    AttachmentsStripComponent,
  ],
  template: `
    <div class="space-y-4">
      <!-- Cycle header -->
      @if (cycle(); as c) {
        <div class="card flex items-center justify-between">
          <div>
            <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider">Current cycle</div>
            <div class="flex items-baseline gap-2 mt-0.5">
              <span class="text-lg font-bold text-ink-900">{{ c.label }}</span>
              <span class="badge-neutral capitalize">{{ c.status }}</span>
              <span class="text-xs text-ink-500">closes {{ c.endDate | date: 'mediumDate' }}</span>
            </div>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <div class="text-right">
              <div class="text-xs text-ink-500">Hours invested</div>
              <div class="font-bold" [ngClass]="hoursTextColor()">
                {{ actualHours() | number: '1.1-1' }} / {{ assignedHours }} h
                <span class="text-xs font-normal">({{ pct() | number: '1.0-0' }}%)</span>
              </div>
            </div>
            <div class="w-32 h-2 bg-ink-100 rounded-full overflow-hidden">
              <div class="h-full transition-all" [ngClass]="hoursBarColor()" [style.width.%]="Math.min(pct(), 100)"></div>
            </div>
          </div>
        </div>
      }

      <!-- New task -->
      <div class="card">
        <h3 class="text-sm font-semibold text-ink-900 mb-3">+ New task</h3>
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input class="input md:col-span-3" [(ngModel)]="newTask.title" placeholder="Task title" />
          <select class="input" [(ngModel)]="newTask.category">
            @for (cat of categories; track cat) {
              <option [value]="cat">{{ cat }}</option>
            }
          </select>
          <select class="input" [(ngModel)]="newTask.priority">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <input type="number" class="input" [(ngModel)]="newTask.estimatedHours" step="0.5" min="0" placeholder="Est. h" />
        </div>
        <div class="mt-2">
          <quill-editor
            [(ngModel)]="newTask.description"
            [modules]="quillModules"
            placeholder="Short description — why this task is needed, scope, success criteria… (optional but recommended)"
            [styles]="{ minHeight: '110px' }"></quill-editor>
        </div>
        <button class="btn-primary mt-3" (click)="addTask()" [disabled]="!canAdd()">Create task</button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        @for (stat of statCards(); track stat.key) {
          <button
            type="button"
            (click)="setStatusFilter(stat.filter)"
            [class]="'text-left rounded-lg border bg-white px-4 py-3 transition shadow-card hover:shadow-elevated ' +
              (statusFilter() === stat.filter ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-ink-200')">
            <div class="text-[10px] uppercase tracking-wider font-semibold" [ngClass]="stat.labelClass">{{ stat.label }}</div>
            <div class="text-2xl font-bold text-ink-900 mt-0.5">{{ stat.value }}</div>
          </button>
        }
      </div>

      <!-- Toolbar -->
      <div class="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            (click)="setStatusFilter('all')"
            [class]="'px-3 py-1 text-xs font-semibold rounded-md border transition ' +
              (statusFilter() === 'all' ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400')">
            All
            <span class="ml-1 text-[10px] opacity-70">{{ tasks().length }}</span>
          </button>
          @for (opt of statusOptions; track opt.value) {
            <button
              type="button"
              (click)="setStatusFilter(opt.value)"
              [class]="'px-3 py-1 text-xs font-semibold rounded-md border transition inline-flex items-center gap-1.5 ' +
                (statusFilter() === opt.value ? 'border-ink-900' : 'border-ink-200 hover:border-ink-400')">
              <span class="w-1.5 h-1.5 rounded-full" [ngClass]="opt.dot"></span>
              {{ opt.label }}
              <span class="text-[10px] opacity-70">{{ countByStatus(opt.value) }}</span>
            </button>
          }
        </div>
        <div class="relative md:w-72">
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 text-sm">⌕</span>
          <input
            class="input pl-7"
            placeholder="Search title or notes…"
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)" />
        </div>
      </div>

      <!-- Cards -->
      @if (filteredTasks().length === 0) {
        <div class="card text-center py-12 text-ink-400 italic">
          @if (tasks().length === 0) {
            No tasks in this cycle yet. Add one above or use "Generate cycle tasks" in the Dashboard.
          } @else {
            No tasks match the current filter.
          }
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          @for (t of filteredTasks(); track t._id) {
            <article
              class="relative rounded-lg border border-ink-200 shadow-card hover:shadow-elevated transition-all flex flex-col"
              [class.bg-white]="t.status !== 'completed'"
              [class.bg-ink-50]="t.status === 'completed'">
              <!-- Status side bar -->
              <div class="absolute top-0 left-0 bottom-0 w-1 rounded-l-lg" [ngClass]="statusOf(t).bar"></div>

              <div class="pl-5 pr-4 py-4 flex-1 flex flex-col">
                <!-- Top row -->
                <div class="flex items-start justify-between gap-3">
                  <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span [class]="'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ' + statusOf(t).pill">
                      <span class="w-1.5 h-1.5 rounded-full" [ngClass]="statusOf(t).dot"></span>
                      {{ statusOf(t).label }}
                    </span>
                    <span class="badge-neutral text-[10px]">{{ t.category }}</span>
                    <span [class]="'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' + priorityBadgeClass(t.priority)">
                      {{ t.priority }}
                    </span>
                  </div>
                  <div class="relative flex-shrink-0">
                    <button type="button"
                            (click)="toggleMenu(t._id!, $event)"
                            [class.bg-ink-100]="menuOpenId() === t._id"
                            class="w-7 h-7 rounded-md flex items-center justify-center text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition"
                            aria-label="Task actions">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="8" cy="3" r="1.5" />
                        <circle cx="8" cy="8" r="1.5" />
                        <circle cx="8" cy="13" r="1.5" />
                      </svg>
                    </button>
                    @if (menuOpenId() === t._id) {
                      <div (click)="$event.stopPropagation()"
                           class="absolute right-0 top-8 z-50 w-56 bg-white border border-ink-200 rounded-md shadow-elevated py-1 text-sm">
                        <div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-400">Change status</div>
                        @for (opt of statusOptions; track opt.value) {
                          <button type="button"
                                  (click)="setStatus(t, opt.value)"
                                  [disabled]="t.status === opt.value"
                                  class="w-full text-left px-3 py-2 hover:bg-ink-50 disabled:opacity-50 disabled:cursor-not-allowed text-ink-700 inline-flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full" [ngClass]="opt.dot"></span>
                            {{ opt.label }}
                            @if (t.status === opt.value) {
                              <span class="ml-auto text-ink-400 text-xs">current</span>
                            }
                          </button>
                        }
                        <div class="border-t border-ink-100 my-1"></div>
                        <button type="button"
                                (click)="openEditModal(t)"
                                class="w-full text-left px-3 py-2 hover:bg-ink-50 text-ink-700 inline-flex items-center gap-2">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke-linejoin="round" />
                            <path d="M10 4l2 2" />
                          </svg>
                          Edit task
                        </button>
                        <button type="button"
                                (click)="duplicate(t)"
                                class="w-full text-left px-3 py-2 hover:bg-ink-50 text-ink-700 inline-flex items-center gap-2">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="3" y="3" width="9" height="9" rx="1.5" />
                            <path d="M5.5 5.5h7v7" stroke-linecap="round" />
                          </svg>
                          Duplicate task
                        </button>
                        <div class="border-t border-ink-100 my-1"></div>
                        <button type="button"
                                (click)="remove(t)"
                                class="w-full text-left px-3 py-2 hover:bg-danger-100 text-danger-500 inline-flex items-center gap-2">
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M3 4.5h10M6.5 7v5M9.5 7v5M5 4.5l.5-2h5l.5 2M4 4.5l.5 9h7l.5-9" stroke-linecap="round" stroke-linejoin="round" />
                          </svg>
                          Delete task
                        </button>
                      </div>
                    }
                  </div>
                </div>

                <!-- Title -->
                <h3 class="mt-2 text-base font-semibold text-ink-900 leading-snug"
                    [class.line-through]="t.status === 'completed'"
                    [class.text-ink-400]="t.status === 'completed'">
                  {{ t.title }}
                </h3>

                <!-- Description -->
                @if (t.description) {
                  <div class="mt-2 text-sm text-ink-600 leading-relaxed">
                    <div class="rich-content line-clamp-3"
                         [innerHTML]="sanitize(t.description)"></div>
                    @if (isDescriptionLong(t.description)) {
                      <button type="button"
                              (click)="openDetailModal(t)"
                              class="mt-1 text-xs font-semibold text-brand-500 hover:text-brand-600 inline-flex items-center gap-1">
                        View details
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
                          <path d="M3 1h6v6M9 1L3.5 6.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </button>
                    }
                  </div>
                }

                @if (t.notes) {
                  <div class="mt-2 rounded-md bg-ink-50 border border-ink-100 px-3 py-2 text-xs text-ink-700">
                    <span class="font-semibold uppercase text-[9px] tracking-wider text-ink-400 mr-1">Notes</span>
                    {{ t.notes }}
                  </div>
                }

                <!-- Attachments -->
                <app-attachments-strip
                  [taskId]="t._id!"
                  [attachments]="t.attachments || []"
                  (changed)="onAttachmentsChanged(t, $event)" />

                <!-- Footer: hours -->
                <div class="mt-auto pt-3 border-t border-ink-100 flex items-center justify-between gap-4 text-xs">
                  <div class="flex items-center gap-4">
                    <div>
                      <span class="text-ink-400 uppercase tracking-wider text-[10px] font-semibold mr-1">Est.</span>
                      <span class="font-semibold text-ink-900">{{ t.estimatedHours || 0 }}h</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <span class="text-ink-400 uppercase tracking-wider text-[10px] font-semibold">Actual</span>
                      <input type="number" class="input input-sm w-20 text-right"
                             [ngModel]="t.actualHours" (ngModelChange)="updateHours(t, $event)"
                             step="0.25" min="0" />
                      <span class="text-ink-500">h</span>
                    </div>
                  </div>
                  @if (t.completedAt && t.status === 'completed') {
                    <div class="text-[11px] text-ink-400">
                      Completed {{ t.completedAt | date: 'MMM d' }}
                    </div>
                  }
                </div>
              </div>
            </article>
          }
        </div>
      }
    </div>

    <!-- Edit task modal -->
    @if (editingTask(); as e) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="closeEditModal()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-4">
            <h2 class="text-lg font-bold text-ink-900">Edit task</h2>
            <button type="button"
                    (click)="closeEditModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="label">Title</label>
              <input class="input" [(ngModel)]="editForm.title" placeholder="Task title" />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label class="label">Category</label>
                <select class="input" [(ngModel)]="editForm.category">
                  @for (cat of categories; track cat) {
                    <option [value]="cat">{{ cat }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Priority</label>
                <select class="input" [(ngModel)]="editForm.priority">
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label class="label">Estimated hours</label>
                <input type="number" class="input" min="0" step="0.5"
                       [(ngModel)]="editForm.estimatedHours" />
              </div>
            </div>

            <div>
              <label class="label">Description</label>
              <quill-editor
                [(ngModel)]="editForm.description"
                [modules]="quillModules"
                placeholder="Why this task is needed, scope, success criteria…"
                [styles]="{ minHeight: '160px' }"></quill-editor>
            </div>

            <div>
              <label class="label">Notes (internal)</label>
              <textarea class="input" rows="3" [(ngModel)]="editForm.notes"
                        placeholder="Short notes only the team sees"></textarea>
            </div>

            @if (editError()) {
              <div class="text-xs text-danger-500">{{ editError() }}</div>
            }
          </div>

          <div class="flex items-center justify-between mt-6 pt-4 border-t border-ink-100">
            <div class="text-[11px] text-ink-400">
              Created {{ e.createdAt ? (e.createdAt | date: 'mediumDate') : 'just now' }}
            </div>
            <div class="flex gap-2">
              <button class="btn-secondary" (click)="closeEditModal()">Cancel</button>
              <button class="btn-primary" (click)="saveEdit()" [disabled]="savingEdit()">
                {{ savingEdit() ? 'Saving…' : 'Save changes' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Detail task modal -->
    @if (detailTask(); as d) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="closeDetailModal()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
             (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-ink-100 flex items-start justify-between gap-4">
            <div class="flex flex-wrap items-center gap-2 min-w-0">
              <span [class]="'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ' + statusOf(d).pill">
                <span class="w-1.5 h-1.5 rounded-full" [ngClass]="statusOf(d).dot"></span>
                {{ statusOf(d).label }}
              </span>
              <span class="badge-neutral text-[10px]">{{ d.category }}</span>
              <span [class]="'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' + priorityBadgeClass(d.priority)">
                {{ d.priority }}
              </span>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <button type="button"
                      (click)="editFromDetail(d)"
                      class="text-xs font-semibold text-brand-500 hover:text-brand-600 px-2 py-1 rounded hover:bg-brand-50 inline-flex items-center gap-1"
                      title="Edit task">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke-linejoin="round" />
                  <path d="M10 4l2 2" />
                </svg>
                Edit
              </button>
              <button type="button"
                      (click)="closeDetailModal()"
                      class="text-ink-400 hover:text-ink-900 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-ink-100">
                ×
              </button>
            </div>
          </div>

          <!-- Body (scrollable) -->
          <div class="px-6 py-5 overflow-y-auto flex-1">
            <h2 class="text-2xl font-bold text-ink-900 leading-tight"
                [class.line-through]="d.status === 'completed'"
                [class.text-ink-500]="d.status === 'completed'">
              {{ d.title }}
            </h2>

            @if (d.description) {
              <div class="mt-5">
                <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-2">Description</div>
                <div class="rich-content text-sm text-ink-700 leading-relaxed"
                     [innerHTML]="sanitize(d.description)"></div>
              </div>
            }

            @if (d.notes) {
              <div class="mt-5">
                <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-2">Internal notes</div>
                <div class="rounded-md bg-ink-50 border border-ink-100 px-3 py-2.5 text-sm text-ink-700 whitespace-pre-line">
                  {{ d.notes }}
                </div>
              </div>
            }

            @if ((d.attachments?.length || 0) > 0) {
              <div class="mt-5">
                <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-2">Attachments</div>
                <app-attachments-strip
                  [taskId]="d._id!"
                  [attachments]="d.attachments || []"
                  (changed)="onAttachmentsChangedFromDetail(d, $event)" />
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-ink-100 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div class="flex flex-wrap items-center gap-x-5 gap-y-1">
              <div>
                <span class="text-ink-400 uppercase tracking-wider text-[10px] font-semibold mr-1">Estimated</span>
                <span class="font-semibold text-ink-900">{{ d.estimatedHours || 0 }}h</span>
              </div>
              <div>
                <span class="text-ink-400 uppercase tracking-wider text-[10px] font-semibold mr-1">Actual</span>
                <span class="font-semibold text-ink-900">{{ d.actualHours || 0 }}h</span>
              </div>
              @if (d.createdAt) {
                <div class="text-ink-400">
                  Created {{ d.createdAt | date: 'mediumDate' }}
                </div>
              }
              @if (d.completedAt && d.status === 'completed') {
                <div class="text-positive-500">
                  Completed {{ d.completedAt | date: 'mediumDate' }}
                </div>
              }
            </div>
            <button class="btn-secondary text-xs" (click)="closeDetailModal()">Close</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientTasksTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  @Input({ required: true }) assignedHours!: number;

  private cyclesSvc = inject(CyclesService);
  private tasksSvc = inject(TasksService);
  private sanitizer = inject(SanitizerService);

  cycle = signal<Cycle | null>(null);
  tasks = signal<Task[]>([]);
  statusFilter = signal<StatusFilter>('all');
  searchQuery = signal('');
  menuOpenId = signal<string | null>(null);
  editingTask = signal<Task | null>(null);
  detailTask = signal<Task | null>(null);
  editForm = {
    title: '',
    description: '' as string | undefined,
    category: 'onpage' as TaskCategory,
    priority: 'medium' as 'high' | 'medium' | 'low',
    estimatedHours: 0,
    notes: '' as string | undefined,
  };
  savingEdit = signal(false);
  editError = signal<string | null>(null);
  Math = Math;

  categories: TaskCategory[] = [
    'technical',
    'onpage',
    'content',
    'offpage',
    'local-gbp',
    'monitoring',
    'reporting',
  ];

  statusOptions: StatusOption[] = [
    STATUS_META.pending,
    STATUS_META.in_progress,
    STATUS_META.completed,
    STATUS_META.blocked,
  ];

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean'],
    ],
  };

  newTask: Partial<Task> = {
    title: '',
    description: '',
    category: 'onpage',
    priority: 'medium',
    estimatedHours: 1,
    status: 'pending',
  };

  actualHours = computed(() =>
    this.tasks().reduce((acc, t) => acc + (t.actualHours || 0), 0),
  );

  pct = computed(() =>
    this.assignedHours > 0 ? (this.actualHours() / this.assignedHours) * 100 : 0,
  );

  filteredTasks = computed(() => {
    const status = this.statusFilter();
    const q = this.searchQuery().trim().toLowerCase();
    return this.tasks().filter((t) => {
      if (status !== 'all' && t.status !== status) return false;
      if (q && !this.matchesQuery(t, q)) return false;
      return true;
    });
  });

  statCards = computed(() => [
    {
      key: 'total',
      label: 'Total',
      labelClass: 'text-ink-500',
      filter: 'all' as StatusFilter,
      value: this.tasks().length,
    },
    {
      key: 'pending',
      label: 'Pending',
      labelClass: 'text-ink-500',
      filter: 'pending' as StatusFilter,
      value: this.countByStatus('pending'),
    },
    {
      key: 'in_progress',
      label: 'In progress',
      labelClass: 'text-sky-600',
      filter: 'in_progress' as StatusFilter,
      value: this.countByStatus('in_progress'),
    },
    {
      key: 'completed',
      label: 'Completed',
      labelClass: 'text-positive-500',
      filter: 'completed' as StatusFilter,
      value: this.countByStatus('completed'),
    },
  ]);

  ngOnChanges() {
    this.cyclesSvc.current().subscribe({
      next: (c) => {
        this.cycle.set(c);
        this.loadTasks();
      },
      error: () => null,
    });
  }

  loadTasks() {
    const c = this.cycle();
    if (!c?._id) return;
    this.tasksSvc
      .list({ clientId: this.clientId, cycleId: c._id })
      .subscribe((t) => this.tasks.set(t));
  }

  canAdd(): boolean {
    return !!(this.newTask.title && this.cycle()?._id);
  }

  addTask() {
    const cycle = this.cycle();
    if (!cycle?._id || !this.canAdd()) return;
    this.tasksSvc
      .create({
        ...this.newTask,
        clientId: this.clientId,
        cycleId: cycle._id,
      } as Partial<Task>)
      .subscribe(() => {
        this.newTask = {
          title: '',
          description: '',
          category: 'onpage',
          priority: 'medium',
          estimatedHours: 1,
          status: 'pending',
        };
        this.loadTasks();
      });
  }

  // --- Status / filters -----------------------------------------------------

  statusOf(t: Task): StatusOption {
    return STATUS_META[t.status] ?? STATUS_META.pending;
  }

  setStatusFilter(s: StatusFilter) {
    this.statusFilter.set(s);
  }

  countByStatus(s: TaskStatus): number {
    return this.tasks().filter((t) => t.status === s).length;
  }

  setStatus(t: Task, status: TaskStatus) {
    this.menuOpenId.set(null);
    if (!t._id || t.status === status) return;
    this.tasksSvc.update(t._id, { status }).subscribe(() => this.loadTasks());
  }

  updateHours(t: Task, actualHours: number) {
    if (!t._id) return;
    this.tasksSvc.update(t._id, { actualHours }).subscribe(() => {
      const updated = this.tasks().map((x) =>
        x._id === t._id ? { ...x, actualHours } : x,
      );
      this.tasks.set(updated);
    });
  }

  // --- Edit modal ---------------------------------------------------------

  openEditModal(t: Task) {
    this.menuOpenId.set(null);
    this.editForm = {
      title: t.title || '',
      description: t.description || '',
      category: t.category,
      priority: t.priority,
      estimatedHours: t.estimatedHours || 0,
      notes: t.notes || '',
    };
    this.editError.set(null);
    this.editingTask.set(t);
  }

  closeEditModal() {
    if (this.savingEdit()) return;
    this.editingTask.set(null);
    this.editError.set(null);
  }

  saveEdit() {
    const t = this.editingTask();
    if (!t?._id) return;
    const title = (this.editForm.title || '').trim();
    if (!title) {
      this.editError.set('Title is required.');
      return;
    }
    this.savingEdit.set(true);
    this.editError.set(null);
    const patch: Partial<Task> = {
      title,
      description: this.editForm.description || undefined,
      category: this.editForm.category,
      priority: this.editForm.priority,
      estimatedHours: Number(this.editForm.estimatedHours) || 0,
      notes: this.editForm.notes?.trim() || undefined,
    };
    this.tasksSvc.update(t._id, patch).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingTask.set(null);
        this.loadTasks();
      },
      error: (err) => {
        this.savingEdit.set(false);
        const msg = err?.error?.message;
        this.editError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save the task.',
        );
      },
    });
  }

  duplicate(t: Task) {
    this.menuOpenId.set(null);
    const cycle = this.cycle();
    if (!cycle?._id) return;
    const draft: Partial<Task> = {
      clientId: this.clientId,
      cycleId: cycle._id,
      title: `${t.title} (copy)`,
      description: t.description,
      category: t.category,
      priority: t.priority,
      estimatedHours: t.estimatedHours,
      notes: t.notes,
      status: 'pending',
    };
    this.tasksSvc.create(draft).subscribe(() => this.loadTasks());
  }

  remove(t: Task) {
    this.menuOpenId.set(null);
    if (!t._id) return;
    if (!confirm(`Delete task "${t.title}"? This cannot be undone.`)) return;
    this.tasksSvc.remove(t._id).subscribe(() => this.loadTasks());
  }

  onAttachmentsChanged(t: Task, attachments: TaskAttachment[]) {
    const updated = this.tasks().map((x) =>
      x._id === t._id ? { ...x, attachments } : x,
    );
    this.tasks.set(updated);
  }

  // --- Context menu ---------------------------------------------------------

  toggleMenu(id: string, event: MouseEvent) {
    event.stopPropagation();
    this.menuOpenId.set(this.menuOpenId() === id ? null : id);
  }

  @HostListener('document:click')
  closeMenu() {
    if (this.menuOpenId()) this.menuOpenId.set(null);
  }

  @HostListener('document:keydown.escape')
  closeMenuOnEscape() {
    if (this.menuOpenId()) this.menuOpenId.set(null);
  }

  // --- Detail modal --------------------------------------------------------

  openDetailModal(t: Task) {
    this.detailTask.set(t);
  }

  closeDetailModal() {
    this.detailTask.set(null);
  }

  editFromDetail(t: Task) {
    this.closeDetailModal();
    this.openEditModal(t);
  }

  onAttachmentsChangedFromDetail(t: Task, attachments: TaskAttachment[]) {
    this.onAttachmentsChanged(t, attachments);
    const fresh = this.tasks().find((x) => x._id === t._id);
    if (fresh) this.detailTask.set(fresh);
  }

  isDescriptionLong(html: string | undefined | null): boolean {
    if (!html) return false;
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 220;
  }

  // --- Helpers --------------------------------------------------------------

  private matchesQuery(t: Task, q: string): boolean {
    if (t.title?.toLowerCase().includes(q)) return true;
    if (t.notes?.toLowerCase().includes(q)) return true;
    if (t.description) {
      const text = t.description.replace(/<[^>]*>/g, ' ').toLowerCase();
      if (text.includes(q)) return true;
    }
    return false;
  }

  sanitize(html: string | undefined | null) {
    return this.sanitizer.trustRichHtml(html);
  }

  priorityBadgeClass(p: string): string {
    if (p === 'high') return 'bg-danger-100 text-danger-500';
    if (p === 'medium') return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-500';
  }

  hoursTextColor() {
    const p = this.pct();
    if (p > 100) return 'text-danger-500';
    if (p >= 80) return 'text-warning-500';
    if (p >= 50) return 'text-positive-500';
    return 'text-ink-700';
  }

  hoursBarColor() {
    const p = this.pct();
    if (p > 100) return 'bg-danger-500';
    if (p >= 80) return 'bg-warning-500';
    if (p >= 50) return 'bg-positive-500';
    return 'bg-ink-300';
  }
}
