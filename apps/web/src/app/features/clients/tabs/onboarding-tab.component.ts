import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Client,
  ONBOARDING_SECTION_LABELS,
  OnboardingItemPriority,
  OnboardingItemState,
  OnboardingSection,
  OnboardingSnapshot,
} from '@seo/shared';
import { OnboardingService } from '../../../core/onboarding.service';
import { ClientsService } from '../../../core/clients.service';

/**
 * Client detail Onboarding tab. Renders the checklist grouped by
 * section with priority dots, per-item state toggles (done / na /
 * pending) and a warning banner when the client is past the configured
 * onboarding window with critical items still unset. Below the
 * checklist a Client Profile card lets the operator fill in the
 * business fields the platform needs to run local + reputation work.
 */
@Component({
  selector: 'app-client-onboarding-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="card text-center py-10 text-sm text-ink-400 italic">Loading…</div>
    } @else if (loadError()) {
      <div class="card text-xs text-danger-500">{{ loadError() }}</div>
    } @else if (snapshot(); as snap) {
      <div class="space-y-4">
        <!-- Progress bar -->
        <div class="card p-3 flex items-center gap-3">
          <div class="w-2.5 h-2.5 rounded-full flex-shrink-0"
               [class.bg-danger-500]="snap.pastWindow"
               [class.bg-positive-500]="!snap.pastWindow && snap.pendingCount === 0"
               [class.bg-sky-500]="!snap.pastWindow && snap.pendingCount > 0"></div>
          <div class="font-bold text-danger-500" [class.text-positive-500]="!snap.pastWindow && snap.pendingCount === 0"
               [class.text-sky-500]="!snap.pastWindow && snap.pendingCount > 0">
            {{ pctComplete(snap) }}%
          </div>
          <div class="text-sm text-ink-700">
            Onboarding · {{ snap.pendingCount }} item{{ snap.pendingCount === 1 ? '' : 's' }} left
          </div>
          <div class="flex-1 h-1.5 rounded-full bg-ink-100 overflow-hidden ml-2">
            <div class="h-1.5 rounded-full transition-all"
                 [class.bg-positive-500]="!snap.pastWindow && snap.pendingCount === 0"
                 [class.bg-sky-500]="!snap.pastWindow && snap.pendingCount > 0"
                 [class.bg-danger-500]="snap.pastWindow"
                 [style.width.%]="pctComplete(snap)"></div>
          </div>
        </div>

        <!-- Past-window banner -->
        @if (snap.pastWindow) {
          <div class="border border-danger-300 bg-danger-100 rounded-lg p-3 text-xs text-danger-500">
            <strong>Past the onboarding window ({{ snap.windowDays }} days) with critical items unset:</strong>
            {{ criticalPendingLabels(snap) }}
          </div>
        }

        <!-- Checklist grouped by section -->
        @for (section of sectionOrder; track section) {
          @if (itemsBySection(snap)[section]?.length) {
            <div>
              <div class="text-[10px] uppercase tracking-[0.2em] font-bold text-ink-500 mb-2 px-1">
                {{ sectionLabels[section] }}
              </div>
              <div class="card divide-y divide-ink-100">
                @for (it of itemsBySection(snap)[section]; track it.key) {
                  <div class="flex items-center gap-2 p-3">
                    <!-- Done toggle -->
                    <button type="button"
                            (click)="setState(it.key, it.state === 'done' ? 'pending' : 'done')"
                            [disabled]="savingKey() === it.key"
                            [class]="'w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 ' +
                              (it.state === 'done'
                                ? 'bg-positive-500 border-positive-500 text-white'
                                : 'bg-white border-ink-200 hover:border-ink-400')"
                            [title]="it.state === 'done' ? 'Mark as pending' : 'Mark as done'">
                      @if (it.state === 'done') {
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clip-rule="evenodd"/>
                        </svg>
                      }
                    </button>

                    <!-- N/A toggle -->
                    <button type="button"
                            (click)="setState(it.key, it.state === 'na' ? 'pending' : 'na')"
                            [disabled]="savingKey() === it.key"
                            [class]="'text-[10px] font-bold uppercase rounded px-1.5 py-0.5 border flex-shrink-0 ' +
                              (it.state === 'na'
                                ? 'bg-ink-900 border-ink-900 text-white'
                                : 'bg-white border-ink-200 text-ink-500 hover:border-ink-400')"
                            title="Not applicable">
                      N/A
                    </button>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span [class]="priorityDotClass(it.priority)"
                              [title]="'Priority: ' + it.priority"></span>
                        <span class="text-sm font-medium truncate"
                              [class.text-ink-900]="it.state !== 'na'"
                              [class.text-ink-400]="it.state === 'na'"
                              [class.line-through]="it.state === 'na'">
                          {{ it.label }}
                        </span>
                        @if (it.autoResolved) {
                          <span class="text-[10px] uppercase font-bold text-positive-500 flex-shrink-0">
                            auto ✓
                          </span>
                        }
                      </div>
                      @if (it.helpText) {
                        <div class="text-[11px] text-ink-500 mt-0.5 truncate">{{ it.helpText }}</div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        }
      </div>
    }

    <!-- Client profile card -->
    @if (clientLocal(); as c) {
      <div class="mt-8">
        <div class="flex items-center justify-between mb-3">
          <div class="text-[10px] uppercase tracking-[0.2em] font-bold text-ink-500">
            Client Profile · {{ filledProfileCount() }} of {{ profileFieldCount() }} complete
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1 flex items-center gap-1">
              Business name <span class="text-ink-300 font-normal">READ-ONLY</span>
            </div>
            <div class="text-sm font-semibold text-ink-900 truncate">{{ c.name }}</div>
          </div>
          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1 flex items-center gap-1">
              Website <span class="text-ink-300 font-normal">READ-ONLY</span>
            </div>
            <a [href]="c.url" target="_blank" class="text-sm text-sky-500 hover:underline truncate block">{{ c.url }}</a>
          </div>

          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1">Phone</div>
            @if (edit.phone) {
              <div class="flex gap-2">
                <input class="input text-sm flex-1" [(ngModel)]="edit.phoneValue" placeholder="+1 555 555 5555" />
                <button class="btn-primary text-xs" (click)="saveField('phone', edit.phoneValue)">Save</button>
                <button class="btn-secondary text-xs" (click)="edit.phone = false">×</button>
              </div>
            } @else if (c.phone) {
              <div class="text-sm text-ink-900 truncate cursor-pointer hover:text-brand-500"
                   (click)="startEdit('phone', c.phone)">{{ c.phone }}</div>
            } @else {
              <button class="text-xs text-ink-500 border border-dashed border-ink-200 rounded-md px-3 py-1.5 hover:border-ink-400"
                      (click)="startEdit('phone', '')">+ Add phone</button>
            }
          </div>

          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1 flex items-center gap-1">
              Logo <span class="text-ink-300 font-normal">READ-ONLY</span>
            </div>
            @if (c.logoUrl) {
              <img [src]="c.logoUrl" class="h-8 w-auto" />
            } @else {
              <span class="text-xs text-amber-500 uppercase tracking-wider font-bold">missing</span>
            }
          </div>

          <div class="card p-3 md:col-span-2">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1">Business description</div>
            @if (edit.businessDescription) {
              <div class="flex flex-col gap-2">
                <textarea class="input text-sm" rows="3" [(ngModel)]="edit.businessDescriptionValue"></textarea>
                <div class="flex justify-end gap-2">
                  <button class="btn-secondary text-xs" (click)="edit.businessDescription = false">Cancel</button>
                  <button class="btn-primary text-xs" (click)="saveField('businessDescription', edit.businessDescriptionValue)">Save</button>
                </div>
              </div>
            } @else if (c.businessDescription) {
              <div class="text-sm text-ink-700 whitespace-pre-line cursor-pointer hover:text-brand-500"
                   (click)="startEdit('businessDescription', c.businessDescription)">{{ c.businessDescription }}</div>
            } @else {
              <button class="text-xs text-ink-500 border border-dashed border-ink-200 rounded-md px-3 py-1.5 hover:border-ink-400"
                      (click)="startEdit('businessDescription', '')">+ Add business description</button>
            }
          </div>

          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1">Address</div>
            @if (edit.address) {
              <div class="flex gap-2">
                <input class="input text-sm flex-1" [(ngModel)]="edit.addressValue" placeholder="Street, City, State" />
                <button class="btn-primary text-xs" (click)="saveField('address', edit.addressValue)">Save</button>
                <button class="btn-secondary text-xs" (click)="edit.address = false">×</button>
              </div>
            } @else if (c.address) {
              <div class="text-sm text-ink-900 truncate cursor-pointer hover:text-brand-500"
                   (click)="startEdit('address', c.address)">{{ c.address }}</div>
            } @else {
              <button class="text-xs text-ink-500 border border-dashed border-ink-200 rounded-md px-3 py-1.5 hover:border-ink-400"
                      (click)="startEdit('address', '')">+ Add address</button>
            }
          </div>

          <ng-container *ngTemplateOutlet="listField; context: { $implicit: 'categories', label: 'Categories', value: c.categories }"></ng-container>
          <ng-container *ngTemplateOutlet="listField; context: { $implicit: 'services', label: 'Services', value: c.services }"></ng-container>
          <ng-container *ngTemplateOutlet="listField; context: { $implicit: 'socialLinks', label: 'Social links', value: c.socialLinks }"></ng-container>

          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1">Reviews URL</div>
            @if (edit.reviewsUrl) {
              <div class="flex gap-2">
                <input class="input text-sm flex-1" [(ngModel)]="edit.reviewsUrlValue" placeholder="https://..." />
                <button class="btn-primary text-xs" (click)="saveField('reviewsUrl', edit.reviewsUrlValue)">Save</button>
                <button class="btn-secondary text-xs" (click)="edit.reviewsUrl = false">×</button>
              </div>
            } @else if (c.reviewsUrl) {
              <a [href]="c.reviewsUrl" target="_blank" class="text-sm text-sky-500 hover:underline truncate block">{{ c.reviewsUrl }}</a>
              <button class="text-[11px] text-ink-500 hover:text-brand-500 mt-1"
                      (click)="startEdit('reviewsUrl', c.reviewsUrl)">Edit</button>
            } @else {
              <button class="text-xs text-ink-500 border border-dashed border-ink-200 rounded-md px-3 py-1.5 hover:border-ink-400"
                      (click)="startEdit('reviewsUrl', '')">+ Add reviews url</button>
            }
          </div>

          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500 mb-1">Photos URL</div>
            @if (edit.photosUrl) {
              <div class="flex gap-2">
                <input class="input text-sm flex-1" [(ngModel)]="edit.photosUrlValue" placeholder="https://..." />
                <button class="btn-primary text-xs" (click)="saveField('photosUrl', edit.photosUrlValue)">Save</button>
                <button class="btn-secondary text-xs" (click)="edit.photosUrl = false">×</button>
              </div>
            } @else if (c.photosUrl) {
              <a [href]="c.photosUrl" target="_blank" class="text-sm text-sky-500 hover:underline truncate block">{{ c.photosUrl }}</a>
              <button class="text-[11px] text-ink-500 hover:text-brand-500 mt-1"
                      (click)="startEdit('photosUrl', c.photosUrl)">Edit</button>
            } @else {
              <button class="text-xs text-ink-500 border border-dashed border-ink-200 rounded-md px-3 py-1.5 hover:border-ink-400"
                      (click)="startEdit('photosUrl', '')">+ Add photos url</button>
            }
          </div>
        </div>
      </div>

      <ng-template #listField let-key let-label="label" let-value="value">
        <div class="card p-3">
          <div class="text-[10px] uppercase font-bold text-ink-500 mb-1">{{ label }}</div>
          @if (editListKey() === key) {
            <textarea class="input text-sm" rows="3"
                      [ngModel]="editListValue()"
                      (ngModelChange)="editListValue.set($event)"
                      placeholder="One per line"></textarea>
            <div class="flex justify-end gap-2 mt-2">
              <button class="btn-secondary text-xs" (click)="editListKey.set(null)">Cancel</button>
              <button class="btn-primary text-xs" (click)="saveListField(key)">Save</button>
            </div>
          } @else if (value?.length) {
            <ul class="text-sm text-ink-700 space-y-0.5 mb-1">
              @for (v of value; track v) {
                <li class="truncate">{{ v }}</li>
              }
            </ul>
            <button class="text-[11px] text-ink-500 hover:text-brand-500"
                    (click)="startEditList(key, value)">Edit</button>
          } @else {
            <button class="text-xs text-ink-500 border border-dashed border-ink-200 rounded-md px-3 py-1.5 hover:border-ink-400"
                    (click)="startEditList(key, [])">+ Add {{ label.toLowerCase() }}</button>
          }
        </div>
      </ng-template>
    }
  `,
})
export class ClientOnboardingTabComponent implements OnInit {
  @Input({ required: true }) clientId!: string;
  @Input() client: Client | null = null;

  private svc = inject(OnboardingService);
  private clientsSvc = inject(ClientsService);

  readonly sectionOrder: OnboardingSection[] = [
    'accounts-access',
    'local-listings',
    'social',
    'research-strategy',
    'technical',
    'content',
    'other',
  ];
  readonly sectionLabels = ONBOARDING_SECTION_LABELS;

  snapshot = signal<OnboardingSnapshot | null>(null);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  savingKey = signal<string | null>(null);

  clientLocal = signal<Client | null>(null);

  editListKey = signal<
    'categories' | 'services' | 'socialLinks' | null
  >(null);
  editListValue = signal<string>('');

  edit = {
    phone: false,
    phoneValue: '',
    address: false,
    addressValue: '',
    businessDescription: false,
    businessDescriptionValue: '',
    reviewsUrl: false,
    reviewsUrlValue: '',
    photosUrl: false,
    photosUrlValue: '',
  };

  ngOnInit() {
    this.clientLocal.set(this.client);
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.svc.snapshot(this.clientId).subscribe({
      next: (s) => {
        this.snapshot.set(s);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load onboarding.');
      },
    });
  }

  itemsBySection(snap: OnboardingSnapshot): Partial<
    Record<OnboardingSection, OnboardingSnapshot['items']>
  > {
    const map: Partial<Record<OnboardingSection, OnboardingSnapshot['items']>> = {};
    for (const it of snap.items) {
      if (!map[it.section]) map[it.section] = [];
      map[it.section]!.push(it);
    }
    return map;
  }

  pctComplete(snap: OnboardingSnapshot): number {
    if (snap.totalRequired === 0) return 100;
    return Math.round((snap.doneCount / snap.totalRequired) * 100);
  }

  criticalPendingLabels(snap: OnboardingSnapshot): string {
    const keys = new Set(snap.criticalPendingKeys);
    return snap.items
      .filter((i) => keys.has(i.key))
      .map((i) => i.label)
      .join(', ');
  }

  priorityDotClass(p: OnboardingItemPriority): string {
    switch (p) {
      case 'critical':
        return 'inline-block w-2 h-2 rounded-full bg-danger-500 flex-shrink-0';
      case 'important':
        return 'inline-block w-2 h-2 rounded-full bg-amber-500 flex-shrink-0';
      case 'nice-to-have':
        return 'inline-block w-2 h-2 rounded-full bg-ink-300 flex-shrink-0';
    }
  }

  setState(key: string, state: OnboardingItemState) {
    this.savingKey.set(key);
    this.svc.setState(this.clientId, key, state).subscribe({
      next: (s) => {
        this.snapshot.set(s);
        this.savingKey.set(null);
      },
      error: (err) => {
        this.savingKey.set(null);
        alert(err?.error?.message || 'Could not update state.');
      },
    });
  }

  // --- Client profile field edit -------------------------------------------

  startEdit(
    key: 'phone' | 'address' | 'businessDescription' | 'reviewsUrl' | 'photosUrl',
    current: string,
  ) {
    this.edit[key] = true as never;
    this.edit[`${key}Value` as const] = current || '';
  }

  saveField(
    key: 'phone' | 'address' | 'businessDescription' | 'reviewsUrl' | 'photosUrl',
    value: string,
  ) {
    const trimmed = value.trim();
    this.clientsSvc.update(this.clientId, { [key]: trimmed || undefined } as Partial<Client>).subscribe({
      next: (updated) => {
        this.clientLocal.set(updated);
        this.edit[key] = false as never;
      },
      error: (err) => alert(err?.error?.message || 'Save failed.'),
    });
  }

  startEditList(key: 'categories' | 'services' | 'socialLinks', current: string[]) {
    this.editListKey.set(key);
    this.editListValue.set((current || []).join('\n'));
  }

  saveListField(key: 'categories' | 'services' | 'socialLinks') {
    const list = this.editListValue()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    this.clientsSvc.update(this.clientId, { [key]: list.length ? list : undefined } as Partial<Client>).subscribe({
      next: (updated) => {
        this.clientLocal.set(updated);
        this.editListKey.set(null);
      },
      error: (err) => alert(err?.error?.message || 'Save failed.'),
    });
  }

  profileFields: Array<keyof Client> = [
    'name',
    'url',
    'logoUrl',
    'phone',
    'address',
    'businessDescription',
    'categories',
    'services',
    'socialLinks',
    'reviewsUrl',
    'photosUrl',
  ];

  profileFieldCount = computed(() => this.profileFields.length);

  filledProfileCount = computed(() => {
    const c = this.clientLocal();
    if (!c) return 0;
    return this.profileFields.filter((f) => {
      const v = (c as unknown as Record<string, unknown>)[f as string];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== '';
    }).length;
  });
}
