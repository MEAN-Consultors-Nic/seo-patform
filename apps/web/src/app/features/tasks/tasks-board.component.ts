import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, Cycle, Task, TaskCategory, TaskStatus } from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { CyclesService } from '../../core/cycles.service';
import { TasksService } from '../../core/tasks.service';
import { TaskTemplatesService } from '../../core/task-templates.service';

@Component({
  selector: 'app-tasks-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-8 max-w-7xl mx-auto">
      <header class="mb-6 flex items-start justify-between">
        <div>
          <h1 class="text-3xl font-bold text-navy-700">Tareas del ciclo</h1>
          @if (cycle(); as c) {
            <p class="text-slate-500 mt-1">
              Ciclo: <strong>{{ c.label }}</strong> · cierre el {{ c.endDate | date: 'mediumDate' }}
            </p>
          }
        </div>
        <button class="btn-secondary"
                (click)="generateRecurring()"
                [disabled]="applying() || !cycle()">
          @if (applying()) {
            Generando…
          } @else {
            ⚡ Generar tareas quincenales
          }
        </button>
      </header>
      @if (applyResult()) {
        <div class="card mb-4 border-l-4 border-l-teal-500 text-sm">
          ✓ Creadas <strong>{{ applyResult()!.created }}</strong> tareas
          · skipped <strong>{{ applyResult()!.skipped }}</strong>
          · {{ applyResult()!.clientsProcessed }} clientes procesados
        </div>
      }

      <div class="card mb-6">
        <h2 class="font-semibold text-navy-700 mb-3">+ Nueva tarea</h2>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label class="label">Cliente</label>
            <select class="input" [(ngModel)]="newTask.clientId">
              <option value="">Seleccionar</option>
              @for (c of clients(); track c._id) {
                <option [value]="c._id">{{ c.name }} (T{{ c.tier }})</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Categoría</label>
            <select class="input" [(ngModel)]="newTask.category">
              @for (cat of categories; track cat) {
                <option [value]="cat">{{ cat }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Prioridad</label>
            <select class="input" [(ngModel)]="newTask.priority">
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </div>
          <div>
            <label class="label">Horas estimadas</label>
            <input type="number" class="input" [(ngModel)]="newTask.estimatedHours" step="0.5" min="0" />
          </div>
          <div class="col-span-2 md:col-span-5">
            <label class="label">Título</label>
            <input class="input" [(ngModel)]="newTask.title" placeholder="ej. Optimizar meta tags del home" />
          </div>
        </div>
        <button class="btn-primary mt-3" (click)="addTask()" [disabled]="!canAdd()">Crear tarea</button>
      </div>

      <div class="space-y-3">
        @for (group of grouped(); track group.client?._id) {
          <details class="card" open>
            <summary class="cursor-pointer">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span [class]="'tier-' + (group.client?.tier || 'C')">{{ group.client?.tier }}</span>
                  <span class="font-semibold text-navy-700">{{ group.client?.name }}</span>
                  <span class="text-xs text-slate-500">{{ group.tasks.length }} tareas</span>
                </div>
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-semibold" [ngClass]="hoursColor(group)">
                    {{ group.hours | number: '1.1-1' }} / {{ group.assigned }} h
                  </span>
                  <span class="text-slate-400">({{ group.pct | number: '1.0-0' }}%)</span>
                </div>
              </div>
              <div class="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all"
                     [ngClass]="hoursBarColor(group)"
                     [style.width.%]="group.pct > 100 ? 100 : group.pct"></div>
              </div>
            </summary>
            <div class="mt-4 space-y-2">
              @for (t of group.tasks; track t._id) {
                <div class="flex items-center gap-3 p-3 rounded border border-slate-100 hover:bg-slate-50">
                  <select class="text-xs border rounded px-1 py-0.5" [ngModel]="t.status" (ngModelChange)="updateStatus(t, $event)">
                    <option value="pending">⏳ pendiente</option>
                    <option value="in_progress">🔄 en curso</option>
                    <option value="completed">✅ completada</option>
                    <option value="blocked">🚫 bloqueada</option>
                  </select>
                  <span class="text-xs text-slate-400 w-20">{{ t.category }}</span>
                  <span class="flex-1 text-sm" [class.line-through]="t.status === 'completed'">{{ t.title }}</span>
                  <input type="number" class="w-16 text-xs border rounded px-1 py-0.5"
                         [ngModel]="t.actualHours" (ngModelChange)="updateHours(t, $event)" step="0.25" min="0" />
                  <span class="text-xs text-slate-400">h</span>
                  <button class="text-xs text-red-500 hover:text-red-700" (click)="remove(t)">×</button>
                </div>
              }
              @if (!group.tasks.length) {
                <p class="text-xs text-slate-400 italic">Sin tareas registradas en este ciclo</p>
              }
            </div>
          </details>
        }
      </div>
    </div>
  `,
})
export class TasksBoardComponent implements OnInit {
  private clientsSvc = inject(ClientsService);
  private cyclesSvc = inject(CyclesService);
  private tasksSvc = inject(TasksService);
  private templatesSvc = inject(TaskTemplatesService);

  cycle = signal<Cycle | null>(null);
  clients = signal<Client[]>([]);
  tasks = signal<Task[]>([]);
  applying = signal(false);
  applyResult = signal<{ created: number; skipped: number; clientsProcessed: number } | null>(null);

  categories: TaskCategory[] = ['technical', 'onpage', 'content', 'offpage', 'local-gbp', 'monitoring', 'reporting'];

  newTask: Partial<Task> = {
    title: '',
    clientId: '',
    category: 'onpage',
    priority: 'medium',
    estimatedHours: 1,
    status: 'pending',
  };

  grouped = computed(() => {
    const tasks = this.tasks();
    const clients = this.clients();
    return clients.map((client) => {
      const clientTasks = tasks.filter((t) => t.clientId === client._id);
      const hours = clientTasks.reduce((acc, t) => acc + (t.actualHours || 0), 0);
      const assigned = client.hoursPerCycle || 0;
      const pct = assigned > 0 ? (hours / assigned) * 100 : 0;
      return { client, tasks: clientTasks, hours, assigned, pct };
    });
  });

  hoursColor(g: { pct: number }) {
    if (g.pct > 100) return 'text-red-600';
    if (g.pct >= 80) return 'text-amber-600';
    if (g.pct >= 50) return 'text-teal-600';
    return 'text-slate-500';
  }

  hoursBarColor(g: { pct: number }) {
    if (g.pct > 100) return 'bg-red-500';
    if (g.pct >= 80) return 'bg-amber-500';
    if (g.pct >= 50) return 'bg-teal-500';
    return 'bg-slate-300';
  }

  ngOnInit() {
    this.cyclesSvc.current().subscribe({
      next: (c) => {
        this.cycle.set(c);
        this.loadTasks();
      },
      error: () => null,
    });
    this.clientsSvc.list().subscribe((cs) => this.clients.set(cs));
  }

  loadTasks() {
    const c = this.cycle();
    if (!c?._id) return;
    this.tasksSvc.list({ cycleId: c._id }).subscribe((ts) => this.tasks.set(ts));
  }

  canAdd(): boolean {
    return !!(this.newTask.title && this.newTask.clientId && this.cycle()?._id);
  }

  addTask() {
    const cycle = this.cycle();
    if (!cycle?._id || !this.canAdd()) return;
    this.tasksSvc.create({ ...this.newTask, cycleId: cycle._id } as Partial<Task>).subscribe(() => {
      this.newTask = { title: '', clientId: '', category: 'onpage', priority: 'medium', estimatedHours: 1, status: 'pending' };
      this.loadTasks();
    });
  }

  updateStatus(t: Task, status: TaskStatus) {
    if (!t._id) return;
    this.tasksSvc.update(t._id, { status }).subscribe(() => this.loadTasks());
  }

  updateHours(t: Task, actualHours: number) {
    if (!t._id) return;
    this.tasksSvc.update(t._id, { actualHours }).subscribe();
  }

  remove(t: Task) {
    if (!t._id) return;
    this.tasksSvc.remove(t._id).subscribe(() => this.loadTasks());
  }

  generateRecurring() {
    const c = this.cycle();
    if (!c?._id) return;
    this.applying.set(true);
    this.templatesSvc.applyRecurring(c._id).subscribe({
      next: (res) => {
        this.applyResult.set(res);
        this.applying.set(false);
        this.loadTasks();
        setTimeout(() => this.applyResult.set(null), 8000);
      },
      error: () => this.applying.set(false),
    });
  }
}
