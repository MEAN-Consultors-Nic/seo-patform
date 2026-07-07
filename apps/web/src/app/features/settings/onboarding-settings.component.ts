import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  ONBOARDING_SECTION_LABELS,
  OnboardingAutoCheck,
  OnboardingItem,
  OnboardingItemPriority,
  OnboardingSection,
} from '@seo/shared';
import { OnboardingService } from '../../core/onboarding.service';

interface EditableItem {
  _id?: string;
  key: string;
  label: string;
  section: OnboardingSection;
  priority: OnboardingItemPriority;
  autoCheck?: OnboardingAutoCheck;
  helpText?: string;
  order: number;
  active: boolean;
}

const SECTION_OPTIONS: OnboardingSection[] = [
  'accounts-access',
  'local-listings',
  'social',
  'research-strategy',
  'technical',
  'content',
  'other',
];

const PRIORITY_OPTIONS: OnboardingItemPriority[] = [
  'critical',
  'important',
  'nice-to-have',
];

const AUTO_CHECK_OPTIONS: OnboardingAutoCheck[] = [
  'gsc-configured',
  'ga4-configured',
  'gbp-configured',
  'shopify-connected',
  'wordpress-connected',
  'google-doc-linked',
  'website-set',
  'logo-set',
];

@Component({
  selector: 'app-onboarding-settings',
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
          <a routerLink="/settings/supervisor" routerLinkActive="tab-active" class="tab">Supervisor</a>
        </div>
      </nav>

      <div class="card mb-4 p-4">
        <div class="flex items-end gap-3">
          <div class="flex-1">
            <h3 class="font-bold text-ink-900 text-sm">Onboarding window</h3>
            <p class="text-xs text-ink-500">
              Days from client creation before the warning banner appears if
              any <strong>critical</strong> item is still unset.
            </p>
          </div>
          <div>
            <label class="text-[10px] uppercase font-semibold text-ink-500">Days</label>
            <input type="number" min="1" class="input text-sm w-24"
                   [(ngModel)]="windowDaysInput" />
          </div>
          <button class="btn-primary text-xs" [disabled]="savingWindow()" (click)="saveWindow()">
            {{ savingWindow() ? 'Saving…' : 'Save' }}
          </button>
        </div>
        @if (windowSaveError()) {
          <div class="mt-2 text-xs text-danger-500">{{ windowSaveError() }}</div>
        }
      </div>

      <div class="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-bold text-ink-900">Onboarding items</h2>
          <p class="text-sm text-ink-500 max-w-2xl">
            Curated checklist shown on the client's Onboarding tab. Group by
            section, tag priority, and optionally link an auto-check so items
            like "Search Console verified" resolve themselves once the
            integration is configured.
          </p>
        </div>
        <button class="btn-primary text-xs whitespace-nowrap" (click)="openNew()">
          + New item
        </button>
      </div>

      @if (loadError()) {
        <div class="card text-xs text-danger-500">{{ loadError() }}</div>
      } @else if (loading()) {
        <div class="card text-center py-8 text-sm text-ink-400 italic">Loading…</div>
      } @else {
        @for (section of sectionOptions; track section) {
          @if (itemsBySection()[section]?.length) {
            <div class="mb-4">
              <div class="text-[10px] uppercase tracking-[0.2em] font-bold text-ink-500 mb-2 px-1">
                {{ sectionLabels[section] }}
              </div>
              <div class="card divide-y divide-ink-100">
                @for (it of itemsBySection()[section]; track it._id) {
                  <div class="flex items-center gap-3 p-3">
                    <span [class]="priorityDotClass(it.priority)"
                          [title]="'Priority: ' + it.priority"></span>
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold text-ink-900 text-sm truncate">{{ it.label }}</div>
                      <div class="text-[11px] text-ink-500 flex items-center gap-2 flex-wrap">
                        <span class="font-mono">{{ it.key }}</span>
                        @if (it.autoCheck) {
                          <span class="text-positive-500">· auto: {{ it.autoCheck }}</span>
                        }
                        @if (!it.active) {
                          <span class="text-ink-400">· inactive</span>
                        }
                      </div>
                    </div>
                    <button class="btn-secondary text-[11px] px-2 py-1" (click)="openEdit(it)">Edit</button>
                    <button class="btn-secondary text-[11px] px-2 py-1 text-danger-500 border-danger-200 hover:bg-danger-100" (click)="confirmDelete(it)">Delete</button>
                  </div>
                }
              </div>
            </div>
          }
        }
      }

      @if (editing(); as e) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeEditor()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-lg"
               (click)="$event.stopPropagation()">
            <div class="p-6 border-b border-ink-100 flex items-center justify-between">
              <h3 class="text-lg font-bold">{{ e._id ? 'Edit item' : 'New item' }}</h3>
              <button type="button" (click)="closeEditor()" class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
            </div>

            <div class="p-6 space-y-3">
              <div>
                <label class="label">Label</label>
                <input type="text" class="input" [(ngModel)]="e.label"
                       (ngModelChange)="onLabelChange(e, $event)"
                       placeholder="Search Console verified" />
              </div>
              <div>
                <label class="label">Key (stable identifier)</label>
                <input type="text" class="input font-mono" [(ngModel)]="e.key"
                       placeholder="search-console-verified" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Section</label>
                  <select class="input" [(ngModel)]="e.section">
                    @for (s of sectionOptions; track s) {
                      <option [value]="s">{{ sectionLabels[s] }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="label">Priority</label>
                  <select class="input" [(ngModel)]="e.priority">
                    @for (p of priorityOptions; track p) {
                      <option [value]="p">{{ p }}</option>
                    }
                  </select>
                </div>
              </div>
              <div>
                <label class="label">Auto-check (optional)</label>
                <select class="input"
                        [ngModel]="e.autoCheck ?? ''"
                        (ngModelChange)="e.autoCheck = $event || undefined">
                  <option value="">— None (manual only) —</option>
                  @for (a of autoCheckOptions; track a) {
                    <option [value]="a">{{ a }}</option>
                  }
                </select>
                <p class="text-[11px] text-ink-500 mt-1">
                  When set, the checklist auto-ticks the item on any client whose corresponding integration is configured (e.g. gsc-configured checks that gscSiteUrl is set).
                </p>
              </div>
              <div>
                <label class="label">Help text (optional)</label>
                <textarea class="input" rows="2" [(ngModel)]="e.helpText"></textarea>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Order</label>
                  <input type="number" class="input" [(ngModel)]="e.order" />
                </div>
                <div class="flex items-end">
                  <label class="text-xs text-ink-700 inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" [(ngModel)]="e.active" />
                    Active
                  </label>
                </div>
              </div>
              @if (saveError()) {
                <div class="text-xs text-danger-500">⚠ {{ saveError() }}</div>
              }
            </div>

            <div class="p-6 border-t border-ink-100 flex justify-end gap-2">
              <button class="btn-secondary text-xs" (click)="closeEditor()">Cancel</button>
              <button class="btn-primary text-xs" [disabled]="saving()" (click)="save()">
                {{ saving() ? 'Saving…' : (e._id ? 'Save changes' : 'Create item') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class OnboardingSettingsComponent implements OnInit {
  private svc = inject(OnboardingService);

  readonly sectionOptions = SECTION_OPTIONS;
  readonly priorityOptions = PRIORITY_OPTIONS;
  readonly autoCheckOptions = AUTO_CHECK_OPTIONS;
  readonly sectionLabels = ONBOARDING_SECTION_LABELS;

  items = signal<OnboardingItem[]>([]);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  editing = signal<EditableItem | null>(null);
  saving = signal<boolean>(false);
  saveError = signal<string | null>(null);

  windowDaysInput = 14;
  savingWindow = signal<boolean>(false);
  windowSaveError = signal<string | null>(null);

  itemsBySection = computed(() => {
    const map: Partial<Record<OnboardingSection, OnboardingItem[]>> = {};
    for (const it of this.items()) {
      const sec = it.section;
      if (!map[sec]) map[sec] = [];
      map[sec]!.push(it);
    }
    for (const key of Object.keys(map) as OnboardingSection[]) {
      map[key]!.sort((a, b) => a.order - b.order);
    }
    return map;
  });

  ngOnInit() {
    this.reload();
    this.svc.getWindowDays().subscribe({
      next: (r) => (this.windowDaysInput = r.onboardingWindowDays),
      error: () => null,
    });
  }

  private reload() {
    this.loading.set(true);
    this.loadError.set(null);
    this.svc.listItems(true).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load onboarding items.');
      },
    });
  }

  openNew() {
    this.saveError.set(null);
    this.editing.set({
      label: '',
      key: '',
      section: 'accounts-access',
      priority: 'important',
      autoCheck: undefined,
      helpText: '',
      order: 100,
      active: true,
    });
  }

  openEdit(it: OnboardingItem) {
    this.saveError.set(null);
    this.editing.set({
      _id: it._id,
      label: it.label,
      key: it.key,
      section: it.section,
      priority: it.priority,
      autoCheck: it.autoCheck,
      helpText: it.helpText ?? '',
      order: it.order,
      active: it.active,
    });
  }

  closeEditor() {
    if (this.saving()) return;
    this.editing.set(null);
    this.saveError.set(null);
  }

  onLabelChange(e: EditableItem, label: string) {
    if (!e.key || e.key === this.slugify(e.label)) {
      e.key = this.slugify(label);
    }
    e.label = label;
  }

  private slugify(s: string): string {
    return (s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  save() {
    const e = this.editing();
    if (!e) return;
    const label = e.label.trim();
    const key = (e.key || this.slugify(label)).trim();
    if (!label) { this.saveError.set('Label is required.'); return; }
    if (!key) { this.saveError.set('Key is required.'); return; }
    const payload: Partial<OnboardingItem> = {
      label,
      key,
      section: e.section,
      priority: e.priority,
      autoCheck: e.autoCheck,
      helpText: (e.helpText || '').trim() || undefined,
      order: Number(e.order) || 100,
      active: !!e.active,
    };
    this.saving.set(true);
    this.saveError.set(null);
    const req$ = e._id
      ? this.svc.updateItem(e._id, payload)
      : this.svc.createItem(payload);
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

  confirmDelete(it: OnboardingItem) {
    if (!it._id) return;
    if (!confirm(`Delete "${it.label}"? This is a template-level deletion and clears any per-client progress rows keyed to it.`))
      return;
    this.svc.removeItem(it._id).subscribe({
      next: () => this.reload(),
      error: (err) => alert(err?.error?.message || 'Delete failed.'),
    });
  }

  saveWindow() {
    this.savingWindow.set(true);
    this.windowSaveError.set(null);
    this.svc.setWindowDays(this.windowDaysInput).subscribe({
      next: (r) => {
        this.windowDaysInput = r.onboardingWindowDays;
        this.savingWindow.set(false);
      },
      error: (err) => {
        this.savingWindow.set(false);
        this.windowSaveError.set(err?.error?.message || 'Save failed.');
      },
    });
  }

  priorityDotClass(p: OnboardingItemPriority): string {
    switch (p) {
      case 'critical':
        return 'inline-block w-2.5 h-2.5 rounded-full bg-danger-500';
      case 'important':
        return 'inline-block w-2.5 h-2.5 rounded-full bg-amber-500';
      case 'nice-to-have':
        return 'inline-block w-2.5 h-2.5 rounded-full bg-ink-300';
    }
  }
}
