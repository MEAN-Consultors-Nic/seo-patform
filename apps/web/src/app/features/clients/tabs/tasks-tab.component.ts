import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillEditorComponent } from 'ngx-quill';
import { Cycle, Task, TaskAttachment, TaskCategory, TaskStatus } from '@seo/shared';
import { CyclesService } from '../../../core/cycles.service';
import { TasksService } from '../../../core/tasks.service';
import { SanitizerService } from '../../../core/sanitizer.service';
import { AttachmentsStripComponent } from '../../../shared/attachments/attachments-strip.component';

@Component({
  selector: 'app-client-tasks-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, QuillEditorComponent, AttachmentsStripComponent],
  template: `
    <div class="space-y-4">
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

      <div class="card-flush">
        <table class="table">
          <thead>
            <tr>
              <th class="w-32">Status</th>
              <th class="w-32">Category</th>
              <th>Task</th>
              <th class="w-20 text-right">Est.</th>
              <th class="w-24 text-right">Actual</th>
              <th class="w-16"></th>
            </tr>
          </thead>
          <tbody>
            @for (t of tasks(); track t._id) {
              <tr>
                <td>
                  <select class="input input-sm" [ngModel]="t.status" (ngModelChange)="updateStatus(t, $event)">
                    <option value="pending">⏳ Pending</option>
                    <option value="in_progress">🔄 In progress</option>
                    <option value="completed">✓ Completed</option>
                    <option value="blocked">⛔ Blocked</option>
                  </select>
                </td>
                <td>
                  <span class="badge-neutral">{{ t.category }}</span>
                </td>
                <td>
                  <div class="font-medium text-ink-900" [class.line-through]="t.status === 'completed'" [class.text-ink-400]="t.status === 'completed'">
                    {{ t.title }}
                  </div>
                  @if (t.description) {
                    <div
                      class="rich-content text-xs text-ink-500 mt-1 leading-relaxed"
                      [innerHTML]="sanitize(t.description)"></div>
                  }
                  @if (t.notes) {
                    <div class="text-xs text-ink-600 mt-1">
                      <span class="font-semibold uppercase text-[9px] tracking-wider text-ink-400 mr-1">Notes</span>
                      {{ t.notes }}
                    </div>
                  }
                  <app-attachments-strip
                    [taskId]="t._id!"
                    [attachments]="t.attachments || []"
                    (changed)="onAttachmentsChanged(t, $event)" />
                </td>
                <td class="text-right text-ink-500">{{ t.estimatedHours || 0 }}<span class="text-xs">h</span></td>
                <td class="text-right">
                  <input type="number" class="input input-sm w-16 text-right"
                         [ngModel]="t.actualHours" (ngModelChange)="updateHours(t, $event)"
                         step="0.25" min="0" />
                </td>
                <td class="text-right">
                  <button class="text-ink-400 hover:text-danger-500 text-lg leading-none" (click)="remove(t)">×</button>
                </td>
              </tr>
            }
            @if (!tasks().length) {
              <tr>
                <td colspan="6" class="py-10 text-center text-ink-400 italic">
                  No tasks in this cycle. Add above or use "Generate bi-weekly" in the Dashboard.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
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
  Math = Math;

  categories: TaskCategory[] = ['technical', 'onpage', 'content', 'offpage', 'local-gbp', 'monitoring', 'reporting'];

  quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean'],
    ],
  };

  sanitize(html: string | undefined | null) {
    return this.sanitizer.trustRichHtml(html);
  }

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
    this.tasksSvc.list({ clientId: this.clientId, cycleId: c._id }).subscribe((t) => this.tasks.set(t));
  }

  canAdd(): boolean {
    return !!(this.newTask.title && this.cycle()?._id);
  }

  addTask() {
    const cycle = this.cycle();
    if (!cycle?._id || !this.canAdd()) return;
    this.tasksSvc.create({ ...this.newTask, clientId: this.clientId, cycleId: cycle._id } as Partial<Task>).subscribe(() => {
      this.newTask = { title: '', description: '', category: 'onpage', priority: 'medium', estimatedHours: 1, status: 'pending' };
      this.loadTasks();
    });
  }

  updateStatus(t: Task, status: TaskStatus) {
    if (!t._id) return;
    this.tasksSvc.update(t._id, { status }).subscribe(() => this.loadTasks());
  }

  updateHours(t: Task, actualHours: number) {
    if (!t._id) return;
    this.tasksSvc.update(t._id, { actualHours }).subscribe(() => {
      const updated = this.tasks().map((x) => (x._id === t._id ? { ...x, actualHours } : x));
      this.tasks.set(updated);
    });
  }

  remove(t: Task) {
    if (!t._id) return;
    this.tasksSvc.remove(t._id).subscribe(() => this.loadTasks());
  }

  onAttachmentsChanged(t: Task, attachments: TaskAttachment[]) {
    const updated = this.tasks().map((x) =>
      x._id === t._id ? { ...x, attachments } : x,
    );
    this.tasks.set(updated);
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
