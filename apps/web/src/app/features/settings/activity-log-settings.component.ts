import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { API_BASE_URL } from '../../core/api.config';

interface ActivityLogRow {
  _id: string;
  userId?: { _id: string; name: string; email: string; role: string } | string;
  userEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  at: string;
}

/**
 * Read-only audit log viewer (Core Slice 1.4). Filter by action /
 * targetType / date range. Feeds the credentials watchdog and
 * delivery-risk digest once those modules land.
 */
@Component({
  selector: 'app-activity-log-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink, RouterLinkActive],
  template: `
    <div class="page-container max-w-6xl">
      <header class="page-header">
        <div>
          <h1 class="page-title">Settings</h1>
        </div>
      </header>

      <nav class="tab-bar mb-6">
        <div class="tab-bar-scroll flex-1 min-w-0">
          <a routerLink="/settings/report-layout" routerLinkActive="tab-active" class="tab">Report layout</a>
          <a routerLink="/settings/onboarding" routerLinkActive="tab-active" class="tab">Onboarding</a>
          <a routerLink="/settings/activity-log" routerLinkActive="tab-active" class="tab">Activity Log</a>
        </div>
      </nav>

      <div class="mb-4">
        <h2 class="text-xl font-bold text-ink-900">Activity log</h2>
        <p class="text-sm text-ink-500 max-w-2xl">
          Append-only audit trail of meaningful platform events. Filter by
          user, action, target or date range to answer "who did what, when".
        </p>
      </div>

      <div class="card mb-4 p-3 flex flex-wrap gap-2 items-end">
        <div>
          <label class="text-[10px] uppercase font-semibold text-ink-500">Action</label>
          <input class="input text-xs w-56" [(ngModel)]="filters.action" placeholder="e.g. client.updated" />
        </div>
        <div>
          <label class="text-[10px] uppercase font-semibold text-ink-500">Target type</label>
          <input class="input text-xs w-32" [(ngModel)]="filters.targetType" placeholder="Client" />
        </div>
        <div>
          <label class="text-[10px] uppercase font-semibold text-ink-500">From</label>
          <input type="date" class="input text-xs w-40" [(ngModel)]="filters.from" />
        </div>
        <div>
          <label class="text-[10px] uppercase font-semibold text-ink-500">To</label>
          <input type="date" class="input text-xs w-40" [(ngModel)]="filters.to" />
        </div>
        <button class="btn-primary text-xs" (click)="reload()" [disabled]="loading()">
          {{ loading() ? 'Loading…' : 'Apply' }}
        </button>
        <button class="btn-secondary text-xs" (click)="clearFilters()">Clear</button>
      </div>

      @if (error()) {
        <div class="card text-xs text-danger-500">{{ error() }}</div>
      } @else if (loading()) {
        <div class="card text-center py-8 text-sm text-ink-400 italic">Loading…</div>
      } @else if (rows().length === 0) {
        <div class="card text-center py-10 text-sm text-ink-500">
          No events match the current filters.
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50">
                <th class="text-left px-4 py-2 font-semibold">When</th>
                <th class="text-left px-3 py-2 font-semibold">Actor</th>
                <th class="text-left px-3 py-2 font-semibold">Action</th>
                <th class="text-left px-3 py-2 font-semibold">Target</th>
                <th class="text-left px-4 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r._id) {
                <tr class="border-b border-ink-100 hover:bg-ink-50">
                  <td class="px-4 py-2 text-xs text-ink-500 whitespace-nowrap">
                    {{ r.at | date: 'medium' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-ink-700 truncate max-w-[180px]">
                    {{ actorLabel(r) }}
                  </td>
                  <td class="px-3 py-2 text-xs font-mono text-ink-900">{{ r.action }}</td>
                  <td class="px-3 py-2 text-xs text-ink-500">
                    @if (r.targetType) {
                      <span class="font-medium text-ink-700">{{ r.targetType }}</span>
                      @if (r.targetId) {
                        <span class="text-ink-400 font-mono ml-1">{{ r.targetId.slice(-6) }}</span>
                      }
                    }
                  </td>
                  <td class="px-4 py-2 text-[11px] text-ink-500 font-mono truncate max-w-[280px]">
                    {{ r.details ? (r.details | json) : '' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ActivityLogSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  rows = signal<ActivityLogRow[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  filters = {
    action: '',
    targetType: '',
    from: '',
    to: '',
  };

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.loading.set(true);
    this.error.set(null);
    const qs = new URLSearchParams();
    if (this.filters.action) qs.set('action', this.filters.action);
    if (this.filters.targetType) qs.set('targetType', this.filters.targetType);
    if (this.filters.from) qs.set('from', this.filters.from);
    if (this.filters.to) qs.set('to', this.filters.to);
    this.http
      .get<ActivityLogRow[]>(`${this.base}/activity-log?${qs.toString()}`)
      .subscribe({
        next: (list) => {
          this.rows.set(list);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Could not load activity log.');
        },
      });
  }

  clearFilters() {
    this.filters = { action: '', targetType: '', from: '', to: '' };
    this.reload();
  }

  actorLabel(r: ActivityLogRow): string {
    if (r.userId && typeof r.userId === 'object') {
      return `${r.userId.name} · ${r.userId.role}`;
    }
    return r.userEmail || '(anonymous)';
  }
}
