import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  DELIVERABLE_FREQUENCY_LABELS,
  Deliverable,
  DeliverableFrequency,
  PACKAGE_COLOR_PALETTE,
  Package,
  PackageColor,
  TaskCategory,
} from '@seo/shared';
import { PackagesService } from '../../core/packages.service';

interface EditableDeliverable extends Deliverable {
  /** Client-only id so *ngFor tracks stably across quantity changes. */
  _uid: string;
}

interface EditablePackage {
  _id?: string;
  name: string;
  description: string;
  color: PackageColor;
  hoursPerPeriod?: number;
  deliverables: EditableDeliverable[];
}

const TASK_CATEGORIES: TaskCategory[] = [
  'technical',
  'onpage',
  'content',
  'offpage',
  'local-gbp',
  'monitoring',
  'reporting',
];

const FREQUENCIES: DeliverableFrequency[] = [
  'per_period',
  'weekly',
  'biweekly',
  'monthly',
];

@Component({
  selector: 'app-packages-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="page-container max-w-5xl">
      <header class="page-header">
        <div>
          <h1 class="page-title">Settings</h1>
        </div>
      </header>

      <nav class="tab-bar mb-6">
        <div class="tab-bar-scroll flex-1 min-w-0">
          <a routerLink="/settings/working-hours" routerLinkActive="tab-active" class="tab">Working hours</a>
          <a routerLink="/settings/integrations" routerLinkActive="tab-active" class="tab">My Integrations</a>
          <a routerLink="/settings/report-layout" routerLinkActive="tab-active" class="tab">Report layout</a>
          <a routerLink="/settings/packages" routerLinkActive="tab-active" class="tab">Packages</a>
          <a routerLink="/settings/onboarding" routerLinkActive="tab-active" class="tab">Onboarding</a>
          <a routerLink="/settings/activity-log" routerLinkActive="tab-active" class="tab">Activity Log</a>
          <a routerLink="/settings/supervisor" routerLinkActive="tab-active" class="tab">Supervisor</a>
        </div>
      </nav>

      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-ink-900">Client packages</h2>
          <p class="text-sm text-ink-500 max-w-2xl">
            Define the packages you sell (e.g. SEO · Growth, SEO · Basic). Each
            package has structured deliverables that show up on the client's
            report and can auto-track progress against completed tasks in the
            matching category.
          </p>
        </div>
        <button class="btn-primary text-xs whitespace-nowrap" (click)="openNew()">
          + New package
        </button>
      </div>

      @if (loadError()) {
        <div class="card text-xs text-danger-500">{{ loadError() }}</div>
      } @else if (loading()) {
        <div class="card text-center py-8 text-sm text-ink-400 italic">Loading…</div>
      } @else if (packages().length === 0) {
        <div class="card text-center py-10 text-sm text-ink-500">
          No packages yet. Click <strong>New package</strong> to create one.
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          @for (p of packages(); track p._id) {
            <div class="card p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span [class]="badgeClass(p.color) + ' text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded'">
                      {{ p.name }}
                    </span>
                  </div>
                  <p class="text-xs text-ink-500 mb-2">{{ p.description || 'No description' }}</p>
                  <div class="text-[11px] text-ink-500">
                    @if (p.deliverables?.length) {
                      {{ p.deliverables.length }} deliverable{{ p.deliverables.length === 1 ? '' : 's' }}
                      @if (p.hoursPerPeriod !== undefined) {
                        · {{ p.hoursPerPeriod }}h/period
                      }
                    } @else {
                      No deliverables defined
                    }
                  </div>
                </div>
                <div class="flex flex-col gap-1 flex-shrink-0">
                  <button class="btn-secondary text-[11px] px-2 py-1" (click)="openEdit(p)">Edit</button>
                  <button class="btn-secondary text-[11px] px-2 py-1 text-danger-500 border-danger-200 hover:bg-danger-100" (click)="confirmDelete(p)">Delete</button>
                </div>
              </div>
              @if (p.deliverables?.length) {
                <ul class="mt-3 pt-3 border-t border-ink-100 text-[11px] text-ink-700 space-y-1">
                  @for (d of p.deliverables; track d.key) {
                    <li>
                      <span class="font-semibold">{{ d.quantity }} {{ d.unit }}</span>
                      · {{ d.label }}
                      <span class="text-ink-400">· {{ frequencyLabel(d.frequency) }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
          }
        </div>
      }

      @if (editing(); as e) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeEditor()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <div class="p-6 border-b border-ink-100 flex items-center justify-between">
              <h3 class="text-lg font-bold">
                {{ e._id ? 'Edit package' : 'New package' }}
              </h3>
              <button type="button" (click)="closeEditor()" class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
            </div>

            <div class="p-6 space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="label">Name</label>
                  <input type="text" class="input" [(ngModel)]="e.name" placeholder="SEO · Growth" />
                </div>
                <div>
                  <label class="label">Color</label>
                  <select class="input" [(ngModel)]="e.color">
                    @for (c of colorOptions; track c) {
                      <option [value]="c">{{ paletteLabel(c) }}</option>
                    }
                  </select>
                </div>
              </div>

              <div>
                <label class="label">Description</label>
                <textarea class="input" rows="2" [(ngModel)]="e.description"
                          placeholder="Growth plan for established sites."></textarea>
              </div>

              <div class="max-w-[200px]">
                <label class="label">Hours per period (optional)</label>
                <input type="number" min="0" step="0.5" class="input"
                       [(ngModel)]="e.hoursPerPeriod" />
              </div>

              <div class="pt-3 border-t border-ink-100">
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <h4 class="font-bold text-ink-900 text-sm">Deliverables</h4>
                    <p class="text-[11px] text-ink-500">
                      Each row becomes a line item on the client's report. Link a
                      task category to auto-count completed tasks against it.
                    </p>
                  </div>
                  <button type="button" class="btn-secondary text-[11px]" (click)="addDeliverable(e)">+ Add</button>
                </div>

                @if (e.deliverables.length === 0) {
                  <div class="text-center py-6 text-xs text-ink-400 italic border border-dashed border-ink-200 rounded-lg">
                    No deliverables yet. Click <strong>Add</strong> to create one.
                  </div>
                } @else {
                  <div class="space-y-2">
                    @for (d of e.deliverables; track d._uid; let i = $index) {
                      <div class="border border-ink-200 rounded-lg p-3 bg-ink-50/50">
                        <div class="grid grid-cols-12 gap-2 items-end">
                          <div class="col-span-4">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Label</label>
                            <input type="text" class="input text-xs" [(ngModel)]="d.label"
                                   (ngModelChange)="onLabelChange(d, $event)"
                                   placeholder="Blog posts" />
                          </div>
                          <div class="col-span-2">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Qty</label>
                            <input type="number" min="0" class="input text-xs" [(ngModel)]="d.quantity" />
                          </div>
                          <div class="col-span-2">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Unit</label>
                            <input type="text" class="input text-xs" [(ngModel)]="d.unit" placeholder="posts" />
                          </div>
                          <div class="col-span-3">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Frequency</label>
                            <select class="input text-xs" [(ngModel)]="d.frequency">
                              @for (f of frequencies; track f) {
                                <option [value]="f">{{ frequencyLabel(f) }}</option>
                              }
                            </select>
                          </div>
                          <div class="col-span-1 text-right">
                            <button type="button" class="text-danger-500 hover:text-danger-700 text-lg leading-none"
                                    (click)="removeDeliverable(e, i)" title="Remove deliverable">×</button>
                          </div>
                          <div class="col-span-6">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Match task category (auto-track)</label>
                            <select class="input text-xs" [ngModel]="d.matchTaskCategory ?? ''"
                                    (ngModelChange)="d.matchTaskCategory = $event || undefined">
                              <option value="">— None (manual only) —</option>
                              @for (cat of taskCategories; track cat) {
                                <option [value]="cat">{{ cat }}</option>
                              }
                            </select>
                          </div>
                          <div class="col-span-6">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Notes (optional)</label>
                            <input type="text" class="input text-xs" [(ngModel)]="d.notes" />
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>

              @if (saveError()) {
                <div class="text-xs text-danger-500">⚠ {{ saveError() }}</div>
              }
            </div>

            <div class="p-6 border-t border-ink-100 flex justify-end gap-2">
              <button class="btn-secondary text-xs" (click)="closeEditor()">Cancel</button>
              <button class="btn-primary text-xs" [disabled]="saving()" (click)="save()">
                {{ saving() ? 'Saving…' : (e._id ? 'Save changes' : 'Create package') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class PackagesSettingsComponent implements OnInit {
  private packagesSvc = inject(PackagesService);

  packages = signal<Package[]>([]);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  editing = signal<EditablePackage | null>(null);
  saving = signal<boolean>(false);
  saveError = signal<string | null>(null);

  readonly colorOptions: PackageColor[] = ['ink', 'sky', 'brand', 'positive', 'amber', 'purple', 'rose'];
  readonly taskCategories = TASK_CATEGORIES;
  readonly frequencies = FREQUENCIES;

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.loadError.set(null);
    this.packagesSvc.list().subscribe({
      next: (list) => {
        this.packages.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load packages.');
      },
    });
  }

  openNew() {
    this.saveError.set(null);
    this.editing.set({
      name: '',
      description: '',
      color: 'sky',
      hoursPerPeriod: undefined,
      deliverables: [],
    });
  }

  openEdit(p: Package) {
    this.saveError.set(null);
    this.editing.set({
      _id: p._id,
      name: p.name,
      description: p.description ?? '',
      color: p.color,
      hoursPerPeriod: p.hoursPerPeriod,
      deliverables: (p.deliverables ?? []).map((d) => ({
        ...d,
        _uid: crypto.randomUUID(),
      })),
    });
  }

  closeEditor() {
    if (this.saving()) return;
    this.editing.set(null);
    this.saveError.set(null);
  }

  addDeliverable(e: EditablePackage) {
    e.deliverables.push({
      _uid: crypto.randomUUID(),
      key: '',
      label: '',
      quantity: 1,
      unit: '',
      frequency: 'per_period',
    });
    this.editing.set({ ...e });
  }

  removeDeliverable(e: EditablePackage, index: number) {
    e.deliverables.splice(index, 1);
    this.editing.set({ ...e });
  }

  /**
   * Auto-derive a stable slug for the deliverable key from the label as
   * the user types. Only when key is still empty or previously auto-set
   * — once the user provides an explicit key we don't overwrite it.
   */
  onLabelChange(d: EditableDeliverable, label: string) {
    if (!d.key || d.key === this.slugify(d.label)) {
      d.key = this.slugify(label);
    }
  }

  private slugify(s: string): string {
    return (s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
  }

  save() {
    const e = this.editing();
    if (!e) return;
    if (!e.name.trim()) {
      this.saveError.set('Package name is required.');
      return;
    }
    // Coerce + validate each deliverable row. Empty strings and
    // NaN-quantity values are surfaced as an inline error instead of
    // being sent to the backend where they'd fail class-validator.
    const deliverables: Array<{
      key: string;
      label: string;
      quantity: number;
      unit: string;
      frequency: EditableDeliverable['frequency'];
      matchTaskCategory?: string;
      notes?: string;
    }> = [];
    for (let i = 0; i < e.deliverables.length; i++) {
      const d = e.deliverables[i];
      const label = (d.label || '').trim();
      const unit = (d.unit || '').trim();
      const key = (d.key || this.slugify(label));
      const qty =
        typeof d.quantity === 'number' && !isNaN(d.quantity)
          ? d.quantity
          : Number(d.quantity);
      if (!label) {
        this.saveError.set(`Deliverable #${i + 1} is missing a label.`);
        return;
      }
      if (!key) {
        this.saveError.set(`Deliverable #${i + 1} is missing a key.`);
        return;
      }
      if (!unit) {
        this.saveError.set(`Deliverable #${i + 1} is missing a unit.`);
        return;
      }
      if (isNaN(qty) || qty < 0) {
        this.saveError.set(
          `Deliverable #${i + 1} needs a non-negative quantity.`,
        );
        return;
      }
      deliverables.push({
        key,
        label,
        quantity: qty,
        unit,
        frequency: d.frequency,
        matchTaskCategory: d.matchTaskCategory || undefined,
        notes: (d.notes || '').trim() || undefined,
      });
    }
    const rawHours =
      typeof e.hoursPerPeriod === 'number' && !isNaN(e.hoursPerPeriod)
        ? e.hoursPerPeriod
        : e.hoursPerPeriod === undefined || e.hoursPerPeriod === null
          ? undefined
          : Number(e.hoursPerPeriod);
    const payload: Partial<Package> = {
      name: e.name.trim(),
      description: (e.description || '').trim() || undefined,
      color: e.color,
      hoursPerPeriod:
        typeof rawHours === 'number' && !isNaN(rawHours) ? rawHours : undefined,
      deliverables: deliverables as unknown as Package['deliverables'],
    };
    this.saving.set(true);
    this.saveError.set(null);
    const req$ = e._id
      ? this.packagesSvc.update(e._id, payload)
      : this.packagesSvc.create(payload);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        const m = err?.error?.message;
        this.saveError.set(Array.isArray(m) ? m.join(', ') : m || 'Save failed.');
      },
    });
  }

  confirmDelete(p: Package) {
    if (!p._id) return;
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    this.packagesSvc.remove(p._id).subscribe({
      next: () => this.reload(),
      error: (err) => {
        const m = err?.error?.message;
        alert(Array.isArray(m) ? m.join(', ') : m || 'Delete failed.');
      },
    });
  }

  badgeClass(color: PackageColor | undefined): string {
    const c = color || 'sky';
    const palette = PACKAGE_COLOR_PALETTE[c];
    return `${palette.bg} ${palette.text}`;
  }

  paletteLabel(color: PackageColor): string {
    return PACKAGE_COLOR_PALETTE[color].label;
  }

  frequencyLabel(f: DeliverableFrequency): string {
    return DELIVERABLE_FREQUENCY_LABELS[f];
  }
}
