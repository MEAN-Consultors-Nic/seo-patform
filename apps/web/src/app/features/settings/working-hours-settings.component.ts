import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { WorkingHoursConfig, WorkingHoursTimeRange } from '@seo/shared';
import { WorkingHoursService } from '../../core/working-hours.service';

const WEEKDAYS = [
  { idx: 1, label: 'Mon' },
  { idx: 2, label: 'Tue' },
  { idx: 3, label: 'Wed' },
  { idx: 4, label: 'Thu' },
  { idx: 5, label: 'Fri' },
  { idx: 6, label: 'Sat' },
  { idx: 0, label: 'Sun' },
];

@Component({
  selector: 'app-working-hours-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="page-container max-w-2xl">
      <header class="page-header">
        <div>
          <h1 class="page-title">Settings</h1>
        </div>
      </header>

      <nav class="tab-bar mb-6">
        <div class="tab-bar-scroll flex-1 min-w-0">
          <a routerLink="/settings/working-hours" routerLinkActive="tab-active" class="tab">
            Working hours
          </a>
          <a routerLink="/settings/integrations" routerLinkActive="tab-active" class="tab">
            My Integrations
          </a>
          <a routerLink="/settings/report-layout" routerLinkActive="tab-active" class="tab">
            Report layout
          </a>
          <a routerLink="/settings/packages" routerLinkActive="tab-active" class="tab">
            Packages
          </a>
          <a routerLink="/settings/onboarding" routerLinkActive="tab-active" class="tab">
            Onboarding
          </a>
          <a routerLink="/settings/activity-log" routerLinkActive="tab-active" class="tab">Activity Log</a>
          <a routerLink="/settings/supervisor" routerLinkActive="tab-active" class="tab">
            Supervisor
          </a>
        </div>
      </nav>

      <div class="mb-4">
        <h2 class="text-xl font-bold text-ink-900">Working hours</h2>
        <p class="text-sm text-ink-500">
          Auto-plan uses this configuration to figure out when to schedule client work.
        </p>
      </div>

      @if (config(); as cfg) {
        <div class="card mb-4">
          <h2 class="text-sm font-semibold text-ink-900 mb-3">Work days</h2>
          <div class="flex flex-wrap gap-2">
            @for (d of weekdays; track d.idx) {
              <button type="button"
                      (click)="toggleDay(d.idx)"
                      [class]="'px-3 py-1.5 text-xs font-semibold rounded-md border transition ' +
                               (cfg.workDays.includes(d.idx)
                                 ? 'bg-ink-900 text-white border-ink-900'
                                 : 'bg-white text-ink-600 border-ink-200 hover:border-ink-400')">
                {{ d.label }}
              </button>
            }
          </div>
        </div>

        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-ink-900">Time blocks</h2>
            <button class="text-xs font-semibold text-brand-500 hover:text-brand-600"
                    (click)="addTimeBlock()">+ Add block</button>
          </div>
          <p class="text-xs text-ink-500 mb-3">
            Set the intervals you actually work each day. The auto-planner respects breaks.
          </p>
          <div class="space-y-2">
            @for (tb of cfg.timeBlocks; track $index) {
              <div class="flex items-center gap-2">
                <input type="time" class="input flex-1" [value]="tb.start"
                       (input)="updateRange($index, 'start', $any($event.target).value)" />
                <span class="text-ink-500 text-xs">to</span>
                <input type="time" class="input flex-1" [value]="tb.end"
                       (input)="updateRange($index, 'end', $any($event.target).value)" />
                <button class="text-ink-400 hover:text-danger-500 text-lg leading-none"
                        (click)="removeTimeBlock($index)">×</button>
              </div>
            }
            @if (cfg.timeBlocks.length === 0) {
              <div class="text-xs text-ink-400 italic">No time blocks. Add at least one.</div>
            }
          </div>
          <div class="mt-3 pt-3 border-t border-ink-100 text-xs text-ink-500">
            Total time blocks: <strong class="text-ink-900">{{ totalBlockHours() | number: '1.1-1' }}h</strong>
          </div>
        </div>

        <div class="card mb-4">
          <h2 class="text-sm font-semibold text-ink-900 mb-3">Daily cap</h2>
          <div class="flex items-center gap-2">
            <input type="number" class="input w-24" min="0.5" max="24" step="0.25"
                   [value]="cfg.dailyCapHours"
                   (input)="setCap($any($event.target).value)" />
            <span class="text-sm text-ink-500">hours per day (effective work, capped)</span>
          </div>
          <p class="text-[11px] text-ink-400 mt-2">
            The planner will never schedule more than this on a single day, even if your
            time blocks add up to more.
          </p>
        </div>

        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-ink-900">Days off</h2>
            <div class="flex gap-2">
              <input type="date" class="input" [(ngModel)]="newDayOff" />
              <button class="btn-secondary" (click)="addDayOff()">Add</button>
            </div>
          </div>
          @if (cfg.daysOff.length === 0) {
            <div class="text-xs text-ink-400 italic">No days off scheduled.</div>
          } @else {
            <div class="flex flex-wrap gap-2">
              @for (d of cfg.daysOff; track d) {
                <span class="inline-flex items-center gap-1 bg-ink-100 text-ink-700 rounded-md px-2 py-1 text-xs">
                  {{ d }}
                  <button class="text-ink-400 hover:text-danger-500" (click)="removeDayOff(d)">×</button>
                </span>
              }
            </div>
          }
        </div>

        <div class="card mb-4">
          <h2 class="text-sm font-semibold text-ink-900 mb-3">Timezone</h2>
          <input class="input" [value]="cfg.timezone || ''"
                 (input)="setTimezone($any($event.target).value)"
                 placeholder="America/Puerto_Rico" />
        </div>

        @if (error()) {
          <div class="card mb-4 border-l-4 border-danger-500 text-sm text-danger-500">
            {{ error() }}
          </div>
        }

        <div class="flex items-center justify-between">
          <div class="text-xs" [ngClass]="dirty() ? 'text-warning-500 font-semibold' : 'text-ink-400'">
            {{ dirty() ? 'You have unsaved changes' : (savedAt() ? 'Saved ' + savedAt() : 'No changes yet') }}
          </div>
          <div class="flex gap-2">
            <button class="btn-secondary" (click)="reset()" [disabled]="!dirty()">Discard</button>
            <button class="btn-primary" (click)="save()" [disabled]="!dirty() || saving()">
              {{ saving() ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      } @else {
        <div class="card py-10 text-center text-ink-400 italic">Loading…</div>
      }
    </div>
  `,
})
export class WorkingHoursSettingsComponent implements OnInit {
  private svc = inject(WorkingHoursService);
  weekdays = WEEKDAYS;

  config = signal<WorkingHoursConfig | null>(null);
  private original: WorkingHoursConfig | null = null;
  saving = signal(false);
  error = signal<string | null>(null);
  savedAt = signal<string | null>(null);
  newDayOff = '';

  dirty = computed(() => {
    const cur = this.config();
    if (!cur || !this.original) return false;
    return JSON.stringify(this.serialize(cur)) !== JSON.stringify(this.serialize(this.original));
  });

  totalBlockHours = computed(() => {
    const cfg = this.config();
    if (!cfg) return 0;
    return cfg.timeBlocks.reduce((acc, tb) => {
      const [sh, sm] = tb.start.split(':').map(Number);
      const [eh, em] = tb.end.split(':').map(Number);
      return acc + Math.max(0, eh * 60 + em - (sh * 60 + sm)) / 60;
    }, 0);
  });

  ngOnInit() {
    this.svc.me().subscribe({
      next: (cfg) => {
        this.config.set({ ...cfg });
        this.original = JSON.parse(JSON.stringify(cfg));
      },
      error: () => null,
    });
  }

  toggleDay(idx: number) {
    this.config.update((cfg) => {
      if (!cfg) return cfg;
      const set = new Set(cfg.workDays);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      return { ...cfg, workDays: Array.from(set).sort((a, b) => a - b) };
    });
  }

  addTimeBlock() {
    this.config.update((cfg) => {
      if (!cfg) return cfg;
      const next: WorkingHoursTimeRange = cfg.timeBlocks.length
        ? { start: '13:00', end: '17:00' }
        : { start: '09:00', end: '12:00' };
      return { ...cfg, timeBlocks: [...cfg.timeBlocks, next] };
    });
  }

  updateRange(i: number, key: 'start' | 'end', value: string) {
    this.config.update((cfg) => {
      if (!cfg) return cfg;
      const tbs = cfg.timeBlocks.map((tb, idx) => (idx === i ? { ...tb, [key]: value } : tb));
      return { ...cfg, timeBlocks: tbs };
    });
  }

  removeTimeBlock(i: number) {
    this.config.update((cfg) => {
      if (!cfg) return cfg;
      return { ...cfg, timeBlocks: cfg.timeBlocks.filter((_, idx) => idx !== i) };
    });
  }

  setCap(value: string) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.config.update((cfg) => (cfg ? { ...cfg, dailyCapHours: n } : cfg));
  }

  setTimezone(value: string) {
    this.config.update((cfg) => (cfg ? { ...cfg, timezone: value } : cfg));
  }

  addDayOff() {
    const d = this.newDayOff?.trim();
    if (!d) return;
    this.config.update((cfg) => {
      if (!cfg) return cfg;
      if (cfg.daysOff.includes(d)) return cfg;
      return { ...cfg, daysOff: [...cfg.daysOff, d].sort() };
    });
    this.newDayOff = '';
  }

  removeDayOff(d: string) {
    this.config.update((cfg) => {
      if (!cfg) return cfg;
      return { ...cfg, daysOff: cfg.daysOff.filter((x) => x !== d) };
    });
  }

  reset() {
    if (!this.original) return;
    this.config.set(JSON.parse(JSON.stringify(this.original)));
    this.error.set(null);
  }

  save() {
    const cfg = this.config();
    if (!cfg) return;
    if (cfg.timeBlocks.length === 0) {
      this.error.set('Add at least one time block');
      return;
    }
    for (const tb of cfg.timeBlocks) {
      const [sh, sm] = tb.start.split(':').map(Number);
      const [eh, em] = tb.end.split(':').map(Number);
      if (eh * 60 + em <= sh * 60 + sm) {
        this.error.set('Each time block must end after it starts');
        return;
      }
    }
    if (cfg.workDays.length === 0) {
      this.error.set('Pick at least one work day');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    this.svc.update(this.serialize(cfg)).subscribe({
      next: (updated) => {
        this.config.set({ ...updated });
        this.original = JSON.parse(JSON.stringify(updated));
        this.saving.set(false);
        this.savedAt.set(new Date().toLocaleTimeString());
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save');
      },
    });
  }

  private serialize(cfg: WorkingHoursConfig) {
    return {
      workDays: cfg.workDays,
      timeBlocks: cfg.timeBlocks,
      dailyCapHours: cfg.dailyCapHours,
      timezone: cfg.timezone,
      daysOff: cfg.daysOff,
    };
  }
}
