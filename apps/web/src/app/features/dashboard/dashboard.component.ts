import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cycle } from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { CyclesService } from '../../core/cycles.service';
import { TaskTemplatesService } from '../../core/task-templates.service';

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

      @if (cycle(); as c) {
        <div class="card mb-6 flex items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center text-brand-500 text-xl">◐</div>
            <div>
              <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider">Current cycle</div>
              <div class="flex items-baseline gap-2 mt-0.5">
                <span class="text-lg font-bold text-ink-900">{{ c.label }}</span>
                <span class="badge-neutral capitalize">{{ c.status }}</span>
              </div>
              <div class="text-xs text-ink-500 mt-0.5">
                {{ c.startDate | date: 'mediumDate' }} → {{ c.endDate | date: 'mediumDate' }}
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn-secondary"
                    (click)="generateRecurring()"
                    [disabled]="applying() || !cycle()">
              @if (applying()) { Generating… } @else { ⚡ Generate cycle tasks }
            </button>
            <a routerLink="/reports" class="btn-primary">Reports</a>
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
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  private clients = inject(ClientsService);
  private cycles = inject(CyclesService);
  private templates = inject(TaskTemplatesService);

  cycle = signal<Cycle | null>(null);
  stats = signal<Array<{ _id: string; count: number; totalHours: number }>>([]);
  totalHours = signal<number>(0);
  applying = signal(false);
  applyResult = signal<{ created: number; skipped: number; clientsProcessed: number } | null>(null);

  ngOnInit() {
    this.cycles.current().subscribe({
      next: (c) => this.cycle.set(c),
      error: () => this.cycle.set(null),
    });
    this.clients.stats().subscribe((s) => {
      this.stats.set(s.perTier);
      this.totalHours.set(s.totalHoursPerCycle);
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
      },
      error: () => this.applying.set(false),
    });
  }
}
