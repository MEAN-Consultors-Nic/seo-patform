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
import { RichTextEditorComponent } from '../../../shared/rich-text-editor.component';
import {
  Subtask,
  Task,
  TaskAttachment,
  TaskCategory,
  TaskStatus,
} from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
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
    RichTextEditorComponent,
    AttachmentsStripComponent,
  ],
  template: `
    <div class="space-y-4">
      <!-- Client tasks header. No more cycle scoping — the tab shows
           every task for the client and the user filters or sorts as
           needed. Hours invested is cumulative across all tasks. -->
      <div class="card flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1">
            All tasks
          </div>
          <div class="text-base font-bold text-ink-900">
            {{ tasks().length }} task{{ tasks().length === 1 ? '' : 's' }}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
          <div class="md:text-right">
            <div class="text-xs text-ink-500">Total hours invested</div>
            <div class="font-bold text-ink-900">
              {{ actualHours() | number: '1.1-1' }} h
            </div>
          </div>
          <button class="btn-primary text-xs whitespace-nowrap ml-auto md:ml-0"
                  type="button"
                  (click)="openCreateModal()">
            + New task
          </button>
        </div>
      </div>

      @if (docSyncToast(); as msg) {
        <div class="card border-l-4 border-positive-500 bg-positive-100/40 text-sm py-2 px-3">
          📝 {{ msg }}
        </div>
      }

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
      <div class="card flex flex-wrap items-center justify-end gap-3">
        <div class="relative w-full md:flex-1 md:max-w-md">
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 text-sm">⌕</span>
          <input
            class="input pl-7"
            placeholder="Search title or notes…"
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)" />
        </div>
        <!-- View mode toggle. Kanban is the compact default;
             List keeps title + full description visible for every
             task at once when you need to scan long descriptions. -->
        <div class="inline-flex rounded-md border border-ink-200 p-0.5 bg-white">
          <button type="button"
                  (click)="setViewMode('kanban')"
                  [class]="'px-3 py-1 text-xs font-semibold rounded transition ' +
                    (viewMode() === 'kanban' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')">
            ▦ Kanban
          </button>
          <button type="button"
                  (click)="setViewMode('list')"
                  [class]="'px-3 py-1 text-xs font-semibold rounded transition ' +
                    (viewMode() === 'list' ? 'bg-ink-900 text-white' : 'text-ink-600 hover:text-ink-900')">
            ☰ List
          </button>
        </div>
      </div>

      <!-- Kanban board -->
      @if (tasks().length === 0) {
        <div class="card text-center py-12 text-ink-400 italic">
          No tasks for this client yet. Click "+ New task" to add one.
        </div>
      } @else if (viewMode() === 'list') {
        <!-- List view: one full-width row per task with title +
             description always visible. Grouped by status so scanning
             remains predictable across the same 4 buckets kanban uses. -->
        <div class="space-y-5">
          @for (col of kanbanColumns; track col.status) {
            @if (kanbanTasksByStatus(col.status).length > 0) {
              <section>
                <header class="flex items-center gap-2 mb-2">
                  <span class="w-2 h-2 rounded-full" [ngClass]="col.dot"></span>
                  <h3 class="text-sm font-bold text-ink-900">{{ col.label }}</h3>
                  <span class="text-xs font-semibold text-ink-500 bg-ink-100 rounded-full px-2 py-0.5">
                    {{ kanbanTasksByStatus(col.status).length }}
                  </span>
                </header>
                <div class="space-y-2">
                  @for (t of kanbanTasksByStatus(col.status); track t._id) {
                    <article class="relative rounded-lg border border-ink-200 shadow-card hover:shadow-elevated transition-all bg-white overflow-hidden">
                      <div class="absolute top-0 left-0 bottom-0 w-1" [ngClass]="statusOf(t).bar"></div>
                      <div class="pl-5 pr-4 py-3 flex flex-col gap-2">
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
                            @if (t.completedAt && t.status === 'completed') {
                              <span class="text-[10px] text-ink-400">
                                · Completed {{ t.completedAt | date: 'MMM d' }}
                              </span>
                            }
                          </div>
                          <ng-container *ngTemplateOutlet="taskMenu; context: { $implicit: t }"></ng-container>
                        </div>

                        <h4 class="text-sm font-bold text-ink-900 leading-snug"
                            [class.line-through]="t.status === 'completed'"
                            [class.text-ink-400]="t.status === 'completed'">
                          {{ t.title }}
                        </h4>

                        @if (t.description) {
                          <div class="text-xs text-ink-700 leading-relaxed">
                            <div class="rich-content" [innerHTML]="sanitize(t.description)"></div>
                          </div>
                        } @else {
                          <div class="text-[11px] text-ink-400 italic">
                            No description
                          </div>
                        }

                        <div class="flex items-center justify-between gap-4 pt-2 border-t border-ink-100 text-xs">
                          <div class="flex items-center gap-3">
                            <button type="button"
                                    (click)="openDetailModal(t)"
                                    class="text-xs font-semibold text-brand-500 hover:text-brand-600 inline-flex items-center gap-1">
                              View details
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M3 1h6v6M9 1L3.5 6.5" stroke-linecap="round" stroke-linejoin="round" />
                              </svg>
                            </button>
                          </div>
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
                        </div>
                      </div>
                    </article>
                  }
                </div>
              </section>
            }
          }
        </div>
      } @else {
        <!-- Columns intentionally do NOT cap their height or scroll
             internally. An inner overflow container (overflow-y-auto)
             would clip the ⋮ menu's absolute-positioned dropdown when
             the menu is longer than the space below the button, since
             CSS overflow constraints trap absolute descendants. The
             whole tab scrolls instead — matches Trello / GitHub
             Projects and keeps the menu fully visible. -->
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pb-2">
          @for (col of kanbanColumns; track col.status) {
            <div class="rounded-lg bg-ink-50/60 border border-ink-100 p-2 flex flex-col min-w-0">
              <div class="flex items-center justify-between px-2 py-2 mb-2">
                <div class="inline-flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full" [ngClass]="col.dot"></span>
                  <span class="text-sm font-bold text-ink-900">{{ col.label }}</span>
                </div>
                <span class="text-xs font-semibold text-ink-500 bg-white rounded-full px-2 py-0.5">
                  {{ kanbanTasksByStatus(col.status).length }}
                </span>
              </div>
              <div class="space-y-3 flex-1">
                @if (kanbanTasksByStatus(col.status).length === 0) {
                  <div class="text-center text-xs text-ink-400 italic py-10">
                    No tasks in this column.
                  </div>
                }
                @for (t of kanbanTasksByStatus(col.status); track t._id) {
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
                  <ng-container *ngTemplateOutlet="taskMenu; context: { $implicit: t }"></ng-container>
                </div>

                <!-- Title -->
                <h3 class="mt-2 text-base font-semibold text-ink-900 leading-snug"
                    [class.line-through]="t.status === 'completed'"
                    [class.text-ink-400]="t.status === 'completed'">
                  {{ t.title }}
                </h3>

                <!-- Description is intentionally hidden on the kanban
                     card to keep tiles compact. A 'View details' link is
                     always rendered below so the full description (plus
                     subtasks, comments, attachments) is one click away
                     for any task — not gated on description length like
                     it used to be. -->
                <button type="button"
                        (click)="openDetailModal(t)"
                        class="mt-2 text-xs font-semibold text-brand-500 hover:text-brand-600 inline-flex items-center gap-1">
                  View details
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M3 1h6v6M9 1L3.5 6.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>

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

                @if ((t.subtasks?.length || 0) > 0) {
                  <div class="mt-2 flex items-center gap-2 text-[11px]">
                    <span class="text-ink-400 uppercase tracking-wider text-[10px] font-semibold">Subtasks</span>
                    <div class="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                      <div class="h-full bg-positive-500 transition-all"
                           [style.width.%]="subtaskProgressPct(t)"></div>
                    </div>
                    <span class="font-semibold tabular-nums"
                          [class.text-positive-500]="subtasksAllDone(t)"
                          [class.text-ink-700]="!subtasksAllDone(t)">
                      {{ subtasksDone(t) }} / {{ t.subtasks?.length }}
                    </span>
                  </div>
                }

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
            </div>
          }
        </div>
      }
    </div>

    <!-- Edit / Create task modal -->
    @if (editingTask() || creatingTask()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
           (click)="closeEditModal()">
        <div class="bg-white sm:rounded-xl rounded-t-xl shadow-xl w-full max-w-2xl p-4 sm:p-6 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-4">
            <h2 class="text-lg font-bold text-ink-900">
              {{ creatingTask() ? 'New task' : 'Edit task' }}
            </h2>
            <button type="button"
                    (click)="closeEditModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="label">Title</label>
              <input class="input" [(ngModel)]="editForm.title" placeholder="Task title" />
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label class="label">Category</label>
                <select class="input" [(ngModel)]="editForm.category">
                  @for (cat of categories; track cat) {
                    <option [value]="cat">{{ cat }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Status</label>
                <select class="input" [(ngModel)]="editForm.status">
                  <option value="pending">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
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
              <app-rich-text-editor
                [(value)]="editForm.description"
                placeholder="Why this task is needed, scope, success criteria…"
                [styles]="{ minHeight: '160px' }"></app-rich-text-editor>
            </div>

            <div>
              <div class="flex items-baseline justify-between mb-1.5">
                <label class="label !mb-0">Subtasks</label>
                @if (editForm.subtasks.length > 0) {
                  <span class="text-[11px] text-ink-400">
                    {{ subtasksDoneCount() }} / {{ editForm.subtasks.length }} done
                  </span>
                }
              </div>
              <div class="space-y-1.5">
                @for (s of editForm.subtasks; track $index; let i = $index) {
                  <div class="flex items-center gap-2">
                    <input type="checkbox" class="rounded border-ink-300 text-positive-500 focus:ring-positive-500"
                           [(ngModel)]="s.done" />
                    <input class="input flex-1 !py-1.5"
                           [class.line-through]="s.done"
                           [class.text-ink-400]="s.done"
                           [(ngModel)]="s.title"
                           placeholder="Subtask title"
                           (keydown.enter)="addSubtask(); $event.preventDefault()" />
                    <button type="button"
                            (click)="removeSubtask(i)"
                            class="text-ink-400 hover:text-danger-500 text-lg leading-none px-1"
                            title="Remove">×</button>
                  </div>
                }
              </div>
              <button type="button"
                      (click)="addSubtask()"
                      class="mt-2 text-xs font-semibold text-brand-500 hover:text-brand-600 inline-flex items-center gap-1">
                + Add subtask
              </button>
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
              @if (editingTask()?.createdAt) {
                Created {{ editingTask()?.createdAt | date: 'mediumDate' }}
              }
            </div>
            <div class="flex gap-2">
              <button class="btn-secondary" (click)="closeEditModal()">Cancel</button>
              <button class="btn-primary"
                      (click)="saveTaskFromModal()"
                      [disabled]="savingEdit()">
                {{ savingEdit() ? 'Saving…' : (creatingTask() ? 'Create task' : 'Save changes') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Completion confirm modal — only opens when the task being
         completed has image attachments and we need the user to decide
         whether they go into the Google Doc. -->
    @if (completionPrompt(); as p) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="dismissCompletionPrompt()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Include images in the Google Doc?</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                @if (completionPromptMode() === 'sendToDoc') {
                  Sending <strong class="text-ink-900">{{ p.title }}</strong> to the Google Doc.
                } @else {
                  You're completing <strong class="text-ink-900">{{ p.title }}</strong>.
                }
                Pick whether the attached images get inserted under the task entry.
              </p>
            </div>
            <button type="button" (click)="dismissCompletionPrompt()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="bg-ink-50 border border-ink-200 rounded-md p-3 mb-4">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-2">
              Attached images ({{ imageAttachmentsOf(p).length }})
            </div>
            <div class="flex flex-wrap gap-2">
              @for (a of imageAttachmentsOf(p); track a.publicId) {
                <img [src]="a.thumbnailUrl || a.url" [alt]="a.originalFilename || ''"
                     class="w-16 h-16 object-cover rounded-md border border-ink-200" />
              }
            </div>
            <p class="text-[11px] text-ink-500 mt-2 leading-snug">
              Only the first two images would be inserted; raw files (PDFs, etc.) are always skipped.
            </p>
          </div>

          <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button class="btn-secondary text-xs sm:text-sm"
                    (click)="confirmComplete(true)">
              Skip images
            </button>
            <button class="btn-primary text-xs sm:text-sm"
                    (click)="confirmComplete(false)">
              Include images
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Move task to another client modal. Triggered from the kanban
         card's contextual menu when work was logged against the wrong
         client and needs to be re-homed. Cycle stays the same (cycles
         are global temporal buckets), only clientId flips. -->
    @if (movingTask(); as mv) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="dismissMoveTaskModal()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Move task to another client</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Moves <strong class="text-ink-900">{{ mv.title }}</strong> out of this client's task list and into the destination. The cycle, time logged, attachments and comments all travel with the task.
              </p>
            </div>
            <button type="button" (click)="dismissMoveTaskModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div>
            <label class="label">Destination client</label>
            <select class="input"
                    [ngModel]="moveTargetClientId()"
                    (ngModelChange)="moveTargetClientId.set($event)">
              <option value="">— Pick a client —</option>
              @for (c of candidateClients(); track c._id) {
                <option [value]="c._id">{{ c.name }} (Tier {{ c.tier }})</option>
              }
            </select>
            @if (candidateClients().length === 0) {
              <p class="text-[11px] text-ink-500 mt-1.5">Loading clients…</p>
            }
          </div>

          @if (moveError()) {
            <div class="text-xs text-danger-500 mt-2">{{ moveError() }}</div>
          }

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary text-xs sm:text-sm"
                    (click)="dismissMoveTaskModal()"
                    [disabled]="moveSaving()">
              Cancel
            </button>
            <button class="btn-primary text-xs sm:text-sm"
                    (click)="confirmMoveTask()"
                    [disabled]="moveSaving() || !moveTargetClientId()">
              {{ moveSaving() ? 'Moving…' : 'Move task' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Change completed date modal. Only surfaced for already-
         completed tasks. Useful for backdating a task that was
         completed on Friday but only marked Monday, or fixing
         accidental future-dates. Also re-triggers the Google Doc
         sync so the task appears under the correct month tab. -->
    @if (completedDateTask(); as cdt) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="dismissCompletedDateModal()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Change completed date</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Sets when <strong class="text-ink-900">{{ cdt.title }}</strong> is considered completed. This affects which report period it counts against and which monthly tab it lands on in the Google Doc.
              </p>
            </div>
            <button type="button" (click)="dismissCompletedDateModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div>
            <label class="label">Completed at</label>
            <input type="date" class="input"
                   [ngModel]="completedDateInput()"
                   (ngModelChange)="completedDateInput.set($event)" />
            <p class="text-[11px] text-ink-500 mt-1.5">
              Current: {{ cdt.completedAt ? (cdt.completedAt | date: 'mediumDate') : '—' }}
            </p>
          </div>

          @if (completedDateError()) {
            <div class="text-xs text-danger-500 mt-2">{{ completedDateError() }}</div>
          }

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary text-xs sm:text-sm"
                    (click)="dismissCompletedDateModal()"
                    [disabled]="completedDateSaving()">
              Cancel
            </button>
            <button class="btn-primary text-xs sm:text-sm"
                    (click)="confirmCompletedDate()"
                    [disabled]="completedDateSaving() || !completedDateInput()">
              {{ completedDateSaving() ? 'Saving…' : 'Save date' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Detail task modal -->
    @if (detailTask(); as d) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
           (click)="closeDetailModal()">
        <div class="bg-white sm:rounded-xl rounded-t-xl shadow-xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col"
             (click)="$event.stopPropagation()">
          <!-- Header -->
          <div class="px-4 sm:px-6 py-3 sm:py-4 border-b border-ink-100 flex items-start justify-between gap-3 sm:gap-4">
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
          <div class="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">
            <h2 class="text-xl sm:text-2xl font-bold text-ink-900 leading-tight"
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

            <div class="mt-5">
              <div class="flex items-baseline justify-between mb-2">
                <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400">
                  Subtasks ({{ d.subtasks?.length || 0 }})
                </div>
                @if ((d.subtasks?.length || 0) > 0) {
                  <div class="text-[11px] text-ink-500 font-semibold">
                    {{ subtasksDone(d) }} / {{ d.subtasks?.length }} done
                  </div>
                }
              </div>
              @if ((d.subtasks?.length || 0) > 0) {
                <ul class="space-y-1 mb-2">
                  @for (s of d.subtasks; track $index; let i = $index) {
                    <li class="group flex items-center gap-2 text-sm">
                      <input type="checkbox" class="rounded border-ink-300 text-positive-500 focus:ring-positive-500"
                             [checked]="s.done"
                             (change)="toggleSubtaskFromDetail(d, i, $any($event.target).checked)" />
                      <span class="text-ink-700 flex-1"
                            [class.line-through]="s.done"
                            [class.text-ink-400]="s.done">
                        {{ s.title }}
                      </span>
                      <button type="button"
                              (click)="removeSubtaskFromDetail(d, i)"
                              class="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-danger-500 text-sm leading-none px-1 transition-opacity"
                              title="Remove subtask">×</button>
                    </li>
                  }
                </ul>
              }
              <!-- Inline add. Enter creates the subtask so users can
                   type several in a row without reaching for the mouse. -->
              <div class="flex items-center gap-2">
                <input class="input !py-1.5 !text-sm flex-1"
                       [(ngModel)]="newSubtaskTitle"
                       (keydown.enter)="addSubtaskFromDetail(d); $event.preventDefault()"
                       placeholder="+ Add subtask (press Enter)" />
                <button type="button"
                        class="btn-primary text-xs !py-1.5 !px-3"
                        (click)="addSubtaskFromDetail(d)"
                        [disabled]="!newSubtaskTitle.trim() || addingSubtaskId() === d._id">
                  {{ addingSubtaskId() === d._id ? '…' : 'Add' }}
                </button>
              </div>
            </div>

            <div class="mt-5">
              <div class="flex items-baseline justify-between mb-2">
                <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400">
                  Attachments ({{ (d.attachments || []).length }})
                </div>
              </div>
              <app-attachments-strip
                [taskId]="d._id!"
                [attachments]="d.attachments || []"
                (changed)="onAttachmentsChangedFromDetail(d, $event)" />
            </div>

            <!-- Comments thread (shared with supervisor portal) -->
            <div class="mt-5">
              <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-2">
                Comments ({{ (d.comments || []).length }})
              </div>
              @if ((d.comments || []).length) {
                <div class="space-y-2 mb-3">
                  @for (c of d.comments; track c.createdAt) {
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
                          [(ngModel)]="commentDraft"
                          placeholder="Write a comment…"></textarea>
                <button class="btn-primary text-xs whitespace-nowrap"
                        [disabled]="!commentDraft.trim() || postingComment()"
                        (click)="postComment(d)">
                  {{ postingComment() ? '…' : 'Post' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-4 sm:px-6 py-3 sm:py-4 border-t border-ink-100 flex flex-wrap items-center justify-between gap-3 sm:gap-4 text-xs">
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

    <!-- Shared task-actions menu. Rendered from both kanban cards and
         list rows via ngTemplateOutlet so both views expose the same
         status transitions, edit, duplicate, move, doc, delete flow. -->
    <ng-template #taskMenu let-t>
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
            <button type="button"
                    (click)="openMoveTaskModal(t)"
                    class="w-full text-left px-3 py-2 hover:bg-ink-50 text-ink-700 inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 8h10M9 5l3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              Move to another client…
            </button>
            @if (t.status === 'completed') {
              <button type="button"
                      (click)="sendToDoc(t)"
                      [disabled]="sendingToDocId() === t._id"
                      class="w-full text-left px-3 py-2 hover:bg-ink-50 disabled:opacity-50 text-ink-700 inline-flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M3 2h7l3 3v9H3V2z" stroke-linejoin="round" />
                  <path d="M10 2v3h3M6 8h4M6 11h4" stroke-linecap="round" />
                </svg>
                {{ sendingToDocId() === t._id ? 'Sending…' : 'Send to Doc' }}
              </button>
              <button type="button"
                      (click)="openCompletedDateModal(t)"
                      class="w-full text-left px-3 py-2 hover:bg-ink-50 text-ink-700 inline-flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="2" y="3" width="12" height="11" rx="1" />
                  <path d="M2 6h12M5 1v3M11 1v3" stroke-linecap="round" />
                </svg>
                Change completed date…
              </button>
            }
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
    </ng-template>
  `,
})
export class ClientTasksTab implements OnChanges {
  @Input({ required: true }) clientId!: string;

  private tasksSvc = inject(TasksService);
  private sanitizer = inject(SanitizerService);

  tasks = signal<Task[]>([]);
  statusFilter = signal<StatusFilter>('all');
  searchQuery = signal('');

  /**
   * Kanban vs list view. Persisted in localStorage so the user's
   * preference sticks across sessions. List mode keeps title +
   * full description visible on every row; kanban keeps the tiles
   * compact and groups by status column.
   */
  viewMode = signal<'kanban' | 'list'>(this.readViewMode());
  private readViewMode(): 'kanban' | 'list' {
    try {
      const v = localStorage.getItem('tasks-view-mode');
      return v === 'list' ? 'list' : 'kanban';
    } catch {
      return 'kanban';
    }
  }
  setViewMode(mode: 'kanban' | 'list') {
    this.viewMode.set(mode);
    try {
      localStorage.setItem('tasks-view-mode', mode);
    } catch {
      // Non-fatal — private mode blocks localStorage.
    }
  }
  menuOpenId = signal<string | null>(null);
  editingTask = signal<Task | null>(null);
  creatingTask = signal(false);
  detailTask = signal<Task | null>(null);
  commentDraft = '';
  postingComment = signal(false);
  /** Brief success toast text shown after a task is synced to Google Doc. */
  docSyncToast = signal<string | null>(null);
  /**
   * The task pending the 'include images in Google Doc?' confirmation.
   * Non-null while the modal is open. Cleared by either Skip or Include
   * action, plus the explicit Cancel.
   */
  completionPrompt = signal<Task | null>(null);
  /**
   * Differentiates the completionPrompt modal between the two flows
   * that use it: a fresh completion (status change → 'completed') or
   * a manual 'Send to Doc' re-send for an already-completed task. The
   * modal copy and the confirm handler branch on this.
   */
  completionPromptMode = signal<'complete' | 'sendToDoc'>('complete');
  /** ID of the task whose Send-to-Doc request is in flight. */
  sendingToDocId = signal<string | null>(null);
  /** ID of the task whose add-subtask request is in flight. */
  addingSubtaskId = signal<string | null>(null);
  /** Input model for the inline add-subtask field in the detail modal. */
  newSubtaskTitle = '';

  /**
   * The task being moved to a different client. When non-null the
   * "Move to another client" modal is visible. We load the candidate
   * client list lazily the first time the modal is opened so the tasks
   * tab itself doesn't pay the cost on every render.
   */
  movingTask = signal<Task | null>(null);
  candidateClients = signal<Array<{ _id: string; name: string; tier: string }>>([]);
  moveTargetClientId = signal<string>('');
  moveSaving = signal(false);
  moveError = signal<string | null>(null);
  private clientsSvc = inject(ClientsService);

  // Change-completed-date modal state.
  completedDateTask = signal<Task | null>(null);
  completedDateInput = signal<string>('');
  completedDateSaving = signal(false);
  completedDateError = signal<string | null>(null);
  editForm: {
    title: string;
    description?: string;
    category: TaskCategory;
    status: 'pending' | 'in_progress' | 'blocked';
    priority: 'high' | 'medium' | 'low';
    estimatedHours: number;
    notes?: string;
    subtasks: Subtask[];
  } = {
    title: '',
    description: '',
    category: 'onpage',
    status: 'pending',
    priority: 'medium',
    estimatedHours: 0,
    notes: '',
    subtasks: [],
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

  actualHours = computed(() =>
    this.tasks().reduce((acc, t) => acc + (t.actualHours || 0), 0),
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

  /**
   * Kanban column definitions in the order the user wants them
   * shown left → right: Pending → In progress → Blocked → Completed.
   * The same dot/label vocabulary as the rest of the component, just
   * stripped to what the column header needs.
   */
  kanbanColumns: Array<{ status: TaskStatus; label: string; dot: string }> = [
    { status: 'pending', label: 'Pending', dot: 'bg-ink-400' },
    { status: 'in_progress', label: 'In progress', dot: 'bg-sky-500' },
    { status: 'blocked', label: 'Blocked', dot: 'bg-danger-500' },
    { status: 'completed', label: 'Completed', dot: 'bg-positive-500' },
  ];

  /**
   * Tasks for one kanban column. Honors the same search input the
   * old chip view used, but no status chip filter — the column IS
   * the filter now. High-priority items float to the top of each
   * column so urgent work is visible at a glance.
   */
  kanbanTasksByStatus(status: TaskStatus): Task[] {
    const q = this.searchQuery().trim().toLowerCase();
    const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return this.tasks()
      .filter((t) => t.status === status)
      .filter((t) => !q || this.matchesQuery(t, q))
      .sort((a, b) => {
        const pa = priorityRank[a.priority] ?? 9;
        const pb = priorityRank[b.priority] ?? 9;
        if (pa !== pb) return pa - pb;
        // Within a priority, newest-first (recent edits stay on top).
        const da = new Date(a.updatedAt ?? 0).getTime();
        const db = new Date(b.updatedAt ?? 0).getTime();
        return db - da;
      });
  }

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
    this.loadTasks();
  }

  loadTasks() {
    if (!this.clientId) return;
    this.tasksSvc
      .list({ clientId: this.clientId })
      .subscribe((t) => this.tasks.set(t));
  }

  openCreateModal() {
    this.editForm = {
      title: '',
      description: '',
      category: 'onpage',
      status: 'pending',
      priority: 'medium',
      estimatedHours: 1,
      notes: '',
      subtasks: [],
    };
    this.editError.set(null);
    this.editingTask.set(null);
    this.creatingTask.set(true);
  }

  addSubtask() {
    this.editForm.subtasks = [...this.editForm.subtasks, { title: '', done: false }];
  }

  removeSubtask(i: number) {
    this.editForm.subtasks = this.editForm.subtasks.filter((_, idx) => idx !== i);
  }

  subtasksDoneCount(): number {
    return this.editForm.subtasks.filter((s) => s.done).length;
  }

  subtasksDone(t: Task): number {
    return (t.subtasks || []).filter((s) => s.done).length;
  }

  subtasksAllDone(t: Task): boolean {
    const subs = t.subtasks || [];
    return subs.length > 0 && subs.every((s) => s.done);
  }

  subtaskProgressPct(t: Task): number {
    const subs = t.subtasks || [];
    if (subs.length === 0) return 0;
    return (this.subtasksDone(t) / subs.length) * 100;
  }

  toggleSubtaskFromDetail(t: Task, index: number, done: boolean) {
    if (!t._id) return;
    const next = (t.subtasks || []).map((s, i) => (i === index ? { ...s, done } : s));
    this.tasksSvc.update(t._id, { subtasks: next }).subscribe({
      next: (updated) => {
        const list = this.tasks().map((x) => (x._id === t._id ? updated : x));
        this.tasks.set(list);
        this.detailTask.set(updated);
      },
    });
  }

  /**
   * Adds a subtask from the detail modal's inline input. Uses the
   * dedicated POST endpoint (idempotent-friendly, keeps the subtask
   * array append on the server side) rather than a full-array PATCH.
   */
  addSubtaskFromDetail(t: Task) {
    if (!t._id) return;
    const title = this.newSubtaskTitle.trim();
    if (!title) return;
    this.addingSubtaskId.set(t._id);
    this.tasksSvc.addSubtask(t._id, title, false).subscribe({
      next: (updated) => {
        this.addingSubtaskId.set(null);
        this.newSubtaskTitle = '';
        const list = this.tasks().map((x) => (x._id === t._id ? updated : x));
        this.tasks.set(list);
        this.detailTask.set(updated);
      },
      error: () => this.addingSubtaskId.set(null),
    });
  }

  removeSubtaskFromDetail(t: Task, index: number) {
    if (!t._id) return;
    const next = (t.subtasks || []).filter((_, i) => i !== index);
    this.tasksSvc.update(t._id, { subtasks: next }).subscribe({
      next: (updated) => {
        const list = this.tasks().map((x) => (x._id === t._id ? updated : x));
        this.tasks.set(list);
        this.detailTask.set(updated);
      },
    });
  }

  saveTaskFromModal() {
    if (this.creatingTask()) {
      this.createTask();
    } else {
      this.saveEdit();
    }
  }

  private createTask() {
    const title = (this.editForm.title || '').trim();
    if (!title) {
      this.editError.set('Title is required.');
      return;
    }
    this.savingEdit.set(true);
    this.editError.set(null);
    // Match the patch shape used by saveEdit so a "cleared" rich-text
    // editor doesn't get stored as `<p><br></p>` on create either.
    const description = this.sanitizer.hasVisibleContent(this.editForm.description)
      ? this.editForm.description
      : undefined;
    const notes = this.editForm.notes?.trim() || undefined;
    const payload: Partial<Task> = {
      title,
      description,
      category: this.editForm.category,
      priority: this.editForm.priority,
      estimatedHours: Number(this.editForm.estimatedHours) || 0,
      notes,
      subtasks: this.cleanSubtasks(),
      status: this.editForm.status,
      clientId: this.clientId,
    };
    this.tasksSvc.create(payload).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.creatingTask.set(false);
        this.loadTasks();
      },
      error: (err) => {
        this.savingEdit.set(false);
        const msg = err?.error?.message;
        this.editError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not create the task.',
        );
      },
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
    if (status === 'completed') {
      const pending = (t.subtasks || []).filter((s) => !s.done).length;
      if (pending > 0) {
        alert(
          `Cannot mark this task as completed — ${pending} subtask${pending === 1 ? '' : 's'} still pending. Check them off first.`,
        );
        return;
      }
      // If the task has image attachments, gate completion behind a
      // confirm dialog where the user picks whether those images get
      // mirrored into the Google Doc. Tasks with no images skip the
      // dialog and complete immediately — no reason to interrupt.
      if (this.imageAttachmentsOf(t).length > 0) {
        this.completionPromptMode.set('complete');
        this.completionPrompt.set(t);
        return;
      }
    }
    this.applyStatusChange(t, status, false);
  }

  /**
   * Re-runs the doc-sync side effect for an already-completed task. If
   * the task has images, route through the same 'include images?'
   * confirm modal so the user always has a chance to opt out — same
   * UX as the initial completion path.
   */
  sendToDoc(t: Task) {
    this.menuOpenId.set(null);
    if (!t._id || t.status !== 'completed') return;
    if (this.imageAttachmentsOf(t).length > 0) {
      this.completionPromptMode.set('sendToDoc');
      this.completionPrompt.set(t);
      return;
    }
    this.performSendToDoc(t, false);
  }

  /**
   * Opens the 'Change completed date' modal for a completed task.
   * Seeds the input with the current completedAt so the user can
   * see + edit the existing value rather than starting blank.
   */
  openCompletedDateModal(t: Task) {
    this.menuOpenId.set(null);
    if (!t._id || t.status !== 'completed') return;
    // <input type="date"> needs a YYYY-MM-DD string. Derive from the
    // stored ISO Date. Falls back to today when the field is empty.
    const iso = t.completedAt
      ? new Date(t.completedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    this.completedDateInput.set(iso);
    this.completedDateError.set(null);
    this.completedDateTask.set(t);
  }

  dismissCompletedDateModal() {
    if (this.completedDateSaving()) return;
    this.completedDateTask.set(null);
    this.completedDateInput.set('');
    this.completedDateError.set(null);
  }

  confirmCompletedDate() {
    const t = this.completedDateTask();
    const iso = this.completedDateInput();
    if (!t?._id || !iso) return;
    this.completedDateSaving.set(true);
    this.completedDateError.set(null);
    // Send as full ISO string so the backend receives a valid
    // DateString. Time defaults to midday UTC to avoid timezone-
    // edge-case flips into the neighbouring day for the user.
    // Backend accepts an IsDateString via IsOptional() on the DTO —
    // Partial<Task> is typed as Date but JSON.stringify on a Date
    // yields the same ISO 8601 string, so passing the pre-serialized
    // string is semantically identical to passing a Date object.
    const payload = new Date(`${iso}T12:00:00.000Z`);
    this.tasksSvc.update(t._id, { completedAt: payload }).subscribe({
      next: (updated) => {
        this.completedDateSaving.set(false);
        this.completedDateTask.set(null);
        this.completedDateInput.set('');
        const list = this.tasks().map((x) => (x._id === t._id ? updated : x));
        this.tasks.set(list);
      },
      error: (err) => {
        this.completedDateSaving.set(false);
        const m = err?.error?.message;
        this.completedDateError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not update the date.',
        );
      },
    });
  }

  private performSendToDoc(t: Task, skipImages: boolean) {
    if (!t._id) return;
    this.sendingToDocId.set(t._id);
    this.tasksSvc.sendToDoc(t._id, skipImages).subscribe({
      next: (sync) => {
        this.sendingToDocId.set(null);
        if (sync.ok) {
          this.docSyncToast.set(sync.message ?? 'Task sent to Google Doc.');
          setTimeout(() => this.docSyncToast.set(null), 4000);
        } else {
          alert(`Doc sync failed: ${sync.message ?? 'Unknown error'}`);
        }
      },
      error: (err) => {
        this.sendingToDocId.set(null);
        const m = err?.error?.message;
        alert(
          `Doc sync failed: ${Array.isArray(m) ? m.join(', ') : m || 'Unknown error'}`,
        );
      },
    });
  }

  /**
   * Lists image attachments (Cloudinary uploads that aren't PDFs/raw
   * files). Used both by the completion confirm dialog to show
   * thumbnails and by the gating decision in setStatus().
   */
  imageAttachmentsOf(t: Task): TaskAttachment[] {
    return (t.attachments || []).filter((a) => a.resourceType !== 'raw');
  }

  confirmComplete(skipImages: boolean) {
    const t = this.completionPrompt();
    if (!t || !t._id) return;
    const mode = this.completionPromptMode();
    this.completionPrompt.set(null);
    if (mode === 'sendToDoc') {
      this.performSendToDoc(t, skipImages);
    } else {
      this.applyStatusChange(t, 'completed', skipImages);
    }
  }

  dismissCompletionPrompt() {
    this.completionPrompt.set(null);
  }

  private applyStatusChange(t: Task, status: TaskStatus, skipImages: boolean) {
    if (!t._id) return;
    const patch: Partial<Task> & { skipImages?: boolean } = { status };
    if (status === 'completed') patch.skipImages = skipImages;
    this.tasksSvc.update(t._id, patch).subscribe({
      next: (res) => {
        this.loadTasks();
        // The backend tacks a _docSync field onto the response when
        // the status transition triggered a Google Doc sync. Surface
        // it so the user can see whether the doc actually got
        // updated — silent failures defeat the purpose of the
        // integration.
        const sync = (res as unknown as { _docSync?: { ok: boolean; message?: string } })._docSync;
        if (sync && !sync.ok) {
          alert(`Doc sync failed: ${sync.message ?? 'Unknown error'}`);
        } else if (sync?.ok && sync.message) {
          // Successful syncs only show a brief notice when there was
          // something to do — skipping clients without a doc linked.
          if (sync.message.includes('synced')) {
            this.docSyncToast.set(sync.message);
            setTimeout(() => this.docSyncToast.set(null), 4000);
          }
        }
      },
      error: (err) => {
        const msg = err?.error?.message;
        alert(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not update status.');
      },
    });
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
      // Map 'completed' to 'pending' in the edit form — the form's
      // status select intentionally omits 'completed' because the
      // completion flow lives in setStatus() (with subtask check + doc
      // sync confirm). If the user wants to revive a completed task
      // they pick pending/in_progress here; if they want to complete
      // a task they use the kanban menu.
      status: t.status === 'completed' ? 'pending' : t.status,
      priority: t.priority,
      estimatedHours: t.estimatedHours || 0,
      notes: t.notes || '',
      subtasks: (t.subtasks || []).map((s) => ({ ...s })),
    };
    this.editError.set(null);
    this.editingTask.set(t);
  }

  private cleanSubtasks(): Subtask[] {
    return this.editForm.subtasks
      .map((s) => ({ title: s.title.trim(), done: !!s.done }))
      .filter((s) => s.title.length > 0);
  }

  closeEditModal() {
    if (this.savingEdit()) return;
    this.editingTask.set(null);
    this.creatingTask.set(false);
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
    // Use empty strings (not undefined) for clearable fields so Mongoose
    // overwrites the existing value instead of dropping the key from the
    // patch. Quill emits "<p><br></p>" for an empty editor, so we treat
    // any visually-empty HTML as empty too.
    const description = this.sanitizer.hasVisibleContent(this.editForm.description)
      ? this.editForm.description
      : '';
    const notes = (this.editForm.notes ?? '').trim();
    const patch: Partial<Task> = {
      title,
      description,
      category: this.editForm.category,
      priority: this.editForm.priority,
      estimatedHours: Number(this.editForm.estimatedHours) || 0,
      notes,
      subtasks: this.cleanSubtasks(),
    };
    // Only carry status changes when the task isn't currently completed.
    // Completed tasks should only be un-completed via the explicit
    // kanban menu flow so the doc-sync side effects stay paired with
    // intent — accidental un-completion via Edit would silently leave
    // a stale entry in the Google Doc.
    if (t.status !== 'completed') {
      patch.status = this.editForm.status;
    }
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

  /**
   * Opens the "move task to another client" modal. Loads the candidate
   * client list on first open and reuses it on subsequent opens within
   * the same session — the list is small enough that we don't bother
   * with a TTL.
   */
  openMoveTaskModal(t: Task) {
    this.menuOpenId.set(null);
    this.movingTask.set(t);
    this.moveTargetClientId.set('');
    this.moveError.set(null);
    if (this.candidateClients().length === 0) {
      this.clientsSvc.list({ active: true }).subscribe((cs) => {
        this.candidateClients.set(
          cs
            .filter((c) => c._id && c._id !== this.clientId)
            .map((c) => ({ _id: c._id!, name: c.name, tier: c.tier })),
        );
      });
    }
  }

  dismissMoveTaskModal() {
    if (this.moveSaving()) return;
    this.movingTask.set(null);
    this.moveTargetClientId.set('');
    this.moveError.set(null);
  }

  confirmMoveTask() {
    const t = this.movingTask();
    const targetId = this.moveTargetClientId();
    if (!t?._id || !targetId) return;
    this.moveSaving.set(true);
    this.moveError.set(null);
    this.tasksSvc.update(t._id, { clientId: targetId }).subscribe({
      next: () => {
        this.moveSaving.set(false);
        this.movingTask.set(null);
        this.moveTargetClientId.set('');
        // The moved task is no longer scoped to this client, so the
        // local list won't contain it after a refresh. Filter it out
        // immediately for snappy feedback instead of waiting on the
        // round-trip.
        this.tasks.update((list) => list.filter((x) => x._id !== t._id));
      },
      error: (err) => {
        this.moveSaving.set(false);
        const m = err?.error?.message;
        this.moveError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not move the task.',
        );
      },
    });
  }

  duplicate(t: Task) {
    this.menuOpenId.set(null);
    const draft: Partial<Task> = {
      clientId: this.clientId,
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

  /**
   * Posts a team-side comment to the task open in the detail modal,
   * then patches both the in-memory tasks list and the detailTask
   * signal so the new entry appears immediately without a refetch.
   */
  postComment(t: Task) {
    const content = this.commentDraft.trim();
    if (!content || !t._id) return;
    this.postingComment.set(true);
    this.tasksSvc.addComment(t._id, content).subscribe({
      next: (comments) => {
        const updated = { ...t, comments } as Task;
        this.tasks.update((arr) =>
          arr.map((x) => (x._id === t._id ? updated : x)),
        );
        this.detailTask.set(updated);
        this.commentDraft = '';
        this.postingComment.set(false);
      },
      error: () => {
        this.postingComment.set(false);
      },
    });
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

}
