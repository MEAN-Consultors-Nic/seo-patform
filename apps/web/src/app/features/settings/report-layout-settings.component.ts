import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  DEFAULT_REPORT_LAYOUT,
  REPORT_SECTION_META,
  ReportSectionConfig,
  ReportSectionKey,
} from '@seo/shared';
import { AppSettingsService } from '../../core/app-settings.service';

@Component({
  selector: 'app-report-layout-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="page-container max-w-3xl">
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
            Integrations
          </a>
          <a routerLink="/settings/report-layout" routerLinkActive="tab-active" class="tab">
            Report layout
          </a>
          <a routerLink="/settings/supervisor" routerLinkActive="tab-active" class="tab">
            Supervisor
          </a>
        </div>
      </nav>

      <div class="mb-4">
        <h2 class="text-xl font-bold text-ink-900">Public report layout</h2>
        <p class="text-sm text-ink-500 max-w-2xl">
          Drag rows (or use the ↑/↓ arrows) to change the order in which
          sections appear in the client-facing public report. Toggle off any
          section you don't want to show. Applies globally to every client's
          public report.
        </p>
      </div>

      @if (loadError()) {
        <div class="card text-xs text-danger-500">{{ loadError() }}</div>
      } @else if (loading()) {
        <div class="card text-center py-8 text-sm text-ink-400 italic">
          Loading…
        </div>
      } @else {
        <div class="card">
          <ul class="divide-y divide-ink-100">
            @for (item of layout(); track item.key; let i = $index) {
              <li class="py-2.5 px-1 flex items-center gap-3 transition rounded"
                  draggable="true"
                  [class.opacity-40]="dragIndex() === i"
                  [class.bg-brand-50]="overIndex() === i && dragIndex() !== null && overIndex() !== dragIndex()"
                  (dragstart)="onDragStart(i, $event)"
                  (dragover)="onDragOver(i, $event)"
                  (dragleave)="onDragLeave(i)"
                  (drop)="onDrop(i, $event)"
                  (dragend)="onDragEnd()">
                <span class="text-ink-300 text-base leading-none select-none cursor-grab"
                      title="Drag to reorder">⋮⋮</span>
                <span class="text-[10px] font-bold tracking-wider text-ink-400 w-8 select-none">
                  {{ visibleNumber(i) }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-ink-900">
                    {{ labelFor(item.key) }}
                  </div>
                  <div class="text-[11px] text-ink-500">
                    {{ descriptionFor(item.key) }}
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <button class="w-7 h-7 rounded text-ink-500 hover:bg-ink-100 hover:text-ink-900 text-xs"
                          [disabled]="i === 0"
                          [class.opacity-30]="i === 0"
                          (click)="moveUp(i)" title="Move up">▲</button>
                  <button class="w-7 h-7 rounded text-ink-500 hover:bg-ink-100 hover:text-ink-900 text-xs"
                          [disabled]="i === layout().length - 1"
                          [class.opacity-30]="i === layout().length - 1"
                          (click)="moveDown(i)" title="Move down">▼</button>
                </div>
                <label class="inline-flex items-center gap-1.5 cursor-pointer ml-2 select-none">
                  <input type="checkbox"
                         class="rounded border-ink-300 text-brand-500 focus:ring-brand-500"
                         [checked]="item.visible"
                         (change)="toggleVisible(i, $event)" />
                  <span class="text-[11px] font-semibold"
                        [class.text-positive-500]="item.visible"
                        [class.text-ink-400]="!item.visible">
                    {{ item.visible ? 'visible' : 'hidden' }}
                  </span>
                </label>
              </li>
            }
          </ul>
        </div>

        @if (saveError()) {
          <div class="mt-3 text-xs text-danger-500">{{ saveError() }}</div>
        }
        @if (saved()) {
          <div class="mt-3 text-xs text-positive-500">✓ Saved</div>
        }

        <div class="flex items-center justify-between mt-4">
          <button class="btn-ghost text-xs" (click)="restoreDefaults()"
                  [disabled]="saving()">
            Restore defaults
          </button>
          <button class="btn-primary"
                  (click)="save()"
                  [disabled]="saving() || !dirty()">
            {{ saving() ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ReportLayoutSettingsComponent implements OnInit {
  private svc = inject(AppSettingsService);

  layout = signal<ReportSectionConfig[]>([]);
  loading = signal(true);
  loadError = signal<string | null>(null);
  saving = signal(false);
  saveError = signal<string | null>(null);
  saved = signal(false);
  dirty = signal(false);

  // HTML5 drag state
  dragIndex = signal<number | null>(null);
  overIndex = signal<number | null>(null);

  ngOnInit() {
    this.svc.getReportLayout().subscribe({
      next: (l) => {
        this.layout.set(l);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const m = err?.error?.message;
        this.loadError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not load layout',
        );
      },
    });
  }

  labelFor(key: ReportSectionKey): string {
    return REPORT_SECTION_META[key]?.label ?? key;
  }

  descriptionFor(key: ReportSectionKey): string {
    return REPORT_SECTION_META[key]?.description ?? '';
  }

  visibleNumber(idx: number): string {
    // Numbering reflects how the section will appear in the public report —
    // only visible sections get a position number, so a hidden row shows "—".
    const layout = this.layout();
    if (!layout[idx]?.visible) return '—';
    let pos = 0;
    for (let i = 0; i <= idx; i++) {
      if (layout[i].visible) pos++;
    }
    return String(pos).padStart(2, '0');
  }

  moveUp(idx: number) {
    if (idx <= 0) return;
    this.swap(idx, idx - 1);
  }

  moveDown(idx: number) {
    if (idx >= this.layout().length - 1) return;
    this.swap(idx, idx + 1);
  }

  private swap(a: number, b: number) {
    this.layout.update((cur) => {
      const next = [...cur];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    this.markDirty();
  }

  toggleVisible(idx: number, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.layout.update((cur) =>
      cur.map((s, i) => (i === idx ? { ...s, visible: checked } : s)),
    );
    this.markDirty();
  }

  onDragStart(idx: number, ev: DragEvent) {
    this.dragIndex.set(idx);
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move';
      // Required for Firefox.
      ev.dataTransfer.setData('text/plain', String(idx));
    }
  }

  onDragOver(idx: number, ev: DragEvent) {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    if (this.overIndex() !== idx) this.overIndex.set(idx);
  }

  onDragLeave(idx: number) {
    if (this.overIndex() === idx) this.overIndex.set(null);
  }

  onDrop(idx: number, ev: DragEvent) {
    ev.preventDefault();
    const src = this.dragIndex();
    this.overIndex.set(null);
    this.dragIndex.set(null);
    if (src === null || src === idx) return;
    this.layout.update((cur) => {
      const next = [...cur];
      const [moved] = next.splice(src, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    this.markDirty();
  }

  onDragEnd() {
    this.dragIndex.set(null);
    this.overIndex.set(null);
  }

  restoreDefaults() {
    this.layout.set(DEFAULT_REPORT_LAYOUT.map((s) => ({ ...s })));
    this.markDirty();
  }

  private markDirty() {
    this.dirty.set(true);
    this.saved.set(false);
    this.saveError.set(null);
  }

  save() {
    this.saving.set(true);
    this.saveError.set(null);
    this.svc.setReportLayout(this.layout()).subscribe({
      next: (saved) => {
        this.layout.set(saved);
        this.saving.set(false);
        this.saved.set(true);
        this.dirty.set(false);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        const m = err?.error?.message;
        this.saveError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not save',
        );
      },
    });
  }
}
