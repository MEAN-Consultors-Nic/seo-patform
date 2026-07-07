import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LEAD_SOURCES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_ORDER,
  Lead,
  LeadService,
  LeadStage,
  PipelineStats,
} from '@seo/shared';
import { PipelineService } from '../../core/pipeline.service';

interface EditableLead {
  _id?: string;
  businessName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  source?: string;
  services: LeadService[];
  monthlyDealValue?: number;
  oneTimeDealValue?: number;
  stage: LeadStage;
  notes?: string;
}

/**
 * Sales Pipeline Kanban (Sales Slice 4.2). Five columns — new,
 * no-show, proposal_sent, closed_won, closed_lost. Cards render the
 * essentials at a glance; click to open the detail drawer for edit +
 * activity feed. Drag-to-stage isn't wired yet (needs a CDK dep);
 * a stage dropdown on each card provides the same capability without
 * pulling in a new library.
 */
@Component({
  selector: 'app-sales-pipeline',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Pipeline</h1>
          <p class="page-subtitle">
            Track prospects from first touch to signed. Drag stage on any
            card to move it through the funnel.
          </p>
        </div>
        <button class="btn-primary" (click)="openNew()">+ New lead</button>
      </header>

      <!-- KPI tiles -->
      @if (stats(); as s) {
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500">Pipeline MRR</div>
            <div class="text-lg font-black text-ink-900">
              \${{ s.pipelineMrr | number: '1.0-0' }}
            </div>
            <div class="text-[10px] text-ink-500">Proposals out</div>
          </div>
          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500">Active MRR</div>
            <div class="text-lg font-black text-ink-900">
              \${{ s.activeMrr | number: '1.0-0' }}
            </div>
            <div class="text-[10px] text-ink-500">All won leads</div>
          </div>
          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500">Won this month</div>
            <div class="text-lg font-black text-positive-500">{{ s.wonThisMonth }}</div>
            <div class="text-[10px] text-ink-500">
              \${{ s.wonThisMonthMrr | number: '1.0-0' }} MRR
            </div>
          </div>
          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500">Open leads</div>
            <div class="text-lg font-black text-sky-500">{{ s.openLeads }}</div>
            <div class="text-[10px] text-ink-500">Not yet closed</div>
          </div>
          <div class="card p-3">
            <div class="text-[10px] uppercase font-bold text-ink-500">Total tracked</div>
            <div class="text-lg font-black text-ink-900">{{ totalCount() }}</div>
            <div class="text-[10px] text-ink-500">All stages</div>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="card text-center py-10 text-sm text-ink-400 italic">Loading pipeline…</div>
      } @else if (loadError()) {
        <div class="card text-xs text-danger-500">{{ loadError() }}</div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          @for (col of stageColumns; track col) {
            <div class="bg-ink-50 rounded-lg p-2 min-h-[300px]">
              <div class="flex items-center justify-between px-2 py-1 mb-2">
                <div class="text-[10px] uppercase font-bold tracking-wider"
                     [class.text-danger-500]="col === 'closed_lost'"
                     [class.text-positive-500]="col === 'closed_won'"
                     [class.text-sky-500]="col === 'proposal_sent'"
                     [class.text-amber-500]="col === 'no_show'"
                     [class.text-ink-700]="col === 'new'">
                  {{ stageLabels[col] }}
                </div>
                <div class="text-[10px] font-bold text-ink-500">
                  {{ byStage()[col]?.length ?? 0 }}
                </div>
              </div>
              <div class="space-y-2">
                @for (l of byStage()[col] ?? []; track l._id) {
                  <div class="card p-3 cursor-pointer hover:border-brand-500/50 transition"
                       (click)="openEdit(l)">
                    <div class="font-semibold text-ink-900 text-sm truncate">
                      {{ l.businessName }}
                    </div>
                    @if (l.contactName || l.email) {
                      <div class="text-[11px] text-ink-500 truncate">
                        {{ l.contactName || l.email }}
                      </div>
                    }
                    <div class="flex items-center justify-between mt-2">
                      <div class="text-[10px] uppercase font-bold text-ink-400">
                        {{ formatServices(l.services) }}
                      </div>
                      @if (l.monthlyDealValue) {
                        <div class="text-xs font-bold text-ink-900">
                          \${{ l.monthlyDealValue | number: '1.0-0' }}/mo
                        </div>
                      }
                    </div>
                    <!-- Inline stage select for quick move -->
                    <select class="input text-[10px] mt-2 py-0.5 px-1"
                            [ngModel]="l.stage"
                            (click)="$event.stopPropagation()"
                            (ngModelChange)="quickMove(l, $event)">
                      @for (s of stageColumns; track s) {
                        <option [value]="s">{{ stageLabels[s] }}</option>
                      }
                    </select>
                  </div>
                } @empty {
                  <div class="text-center text-[11px] text-ink-400 italic py-6">
                    Empty
                  </div>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (editing(); as e) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeEditor()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <div class="p-5 border-b border-ink-100 flex items-center justify-between">
              <h3 class="text-lg font-bold">{{ e._id ? 'Edit lead' : 'New lead' }}</h3>
              <button class="text-ink-400 hover:text-ink-900 text-2xl leading-none"
                      (click)="closeEditor()">×</button>
            </div>

            <div class="p-5 space-y-3">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Business name *</label>
                  <input class="input" [(ngModel)]="e.businessName" />
                </div>
                <div>
                  <label class="label">Stage</label>
                  <select class="input" [(ngModel)]="e.stage">
                    @for (s of stageColumns; track s) {
                      <option [value]="s">{{ stageLabels[s] }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="label">Contact name</label>
                  <input class="input" [(ngModel)]="e.contactName" />
                </div>
                <div>
                  <label class="label">Email</label>
                  <input class="input" type="email" [(ngModel)]="e.email" />
                </div>
                <div>
                  <label class="label">Phone</label>
                  <input class="input" [(ngModel)]="e.phone" />
                </div>
                <div>
                  <label class="label">Website</label>
                  <input class="input" [(ngModel)]="e.website" placeholder="https://…" />
                </div>
                <div>
                  <label class="label">Source</label>
                  <select class="input" [ngModel]="e.source ?? ''"
                          (ngModelChange)="e.source = $event || undefined">
                    <option value="">—</option>
                    @for (s of sources; track s) {
                      <option [value]="s">{{ s }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="label">Services</label>
                  <div class="flex flex-wrap gap-1">
                    @for (svc of servicesList; track svc) {
                      <label class="inline-flex items-center gap-1 text-xs px-2 py-1 border border-ink-200 rounded cursor-pointer"
                             [class.bg-brand-500]="e.services.includes(svc)"
                             [class.text-white]="e.services.includes(svc)">
                        <input type="checkbox"
                               class="sr-only"
                               [checked]="e.services.includes(svc)"
                               (change)="toggleService(e, svc)" />
                        {{ svc }}
                      </label>
                    }
                  </div>
                </div>
                <div>
                  <label class="label">Monthly value (USD)</label>
                  <input class="input" type="number" min="0" step="10"
                         [(ngModel)]="e.monthlyDealValue" />
                </div>
                <div>
                  <label class="label">One-time value (USD)</label>
                  <input class="input" type="number" min="0" step="10"
                         [(ngModel)]="e.oneTimeDealValue" />
                </div>
              </div>

              <div>
                <label class="label">Notes</label>
                <textarea class="input" rows="3" [(ngModel)]="e.notes"></textarea>
              </div>

              <!-- Activity feed for existing leads -->
              @if (e._id && activityRows().length > 0) {
                <div class="pt-3 border-t border-ink-100">
                  <div class="text-[10px] uppercase font-bold text-ink-500 mb-2">
                    Activity
                  </div>
                  <ul class="text-xs text-ink-700 space-y-1 max-h-40 overflow-y-auto">
                    @for (a of activityRows(); track $index) {
                      <li class="border-l-2 border-ink-100 pl-2 py-0.5">
                        <span class="text-[10px] text-ink-400">
                          {{ a.at | date: 'short' }} · {{ a.kind }}
                        </span>
                        @if (a.text) { <span class="ml-1">{{ a.text }}</span> }
                        @if (a.fromStage && a.toStage) {
                          <span class="ml-1 text-ink-500">
                            {{ stageLabels[a.fromStage] }} → {{ stageLabels[a.toStage] }}
                          </span>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }

              @if (e._id) {
                <div class="pt-2 border-t border-ink-100">
                  <div class="flex gap-2">
                    <input class="input flex-1 text-sm" [(ngModel)]="activityText"
                           placeholder="Add note / call / email…" />
                    <button class="btn-secondary text-xs" (click)="addActivity('note')">Note</button>
                    <button class="btn-secondary text-xs" (click)="addActivity('call')">Call</button>
                    <button class="btn-secondary text-xs" (click)="addActivity('email')">Email</button>
                  </div>
                </div>
              }

              @if (saveError()) {
                <div class="text-xs text-danger-500">⚠ {{ saveError() }}</div>
              }
            </div>

            <div class="p-5 border-t border-ink-100 flex justify-between gap-2">
              <div>
                @if (e._id) {
                  <button class="btn-secondary text-xs text-danger-500 border-danger-200 hover:bg-danger-100"
                          (click)="remove()">Delete</button>
                }
              </div>
              <div class="flex gap-2">
                <button class="btn-secondary text-xs" (click)="closeEditor()">Cancel</button>
                <button class="btn-primary text-xs" [disabled]="saving()" (click)="save()">
                  {{ saving() ? 'Saving…' : (e._id ? 'Save changes' : 'Create lead') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class SalesPipelineComponent implements OnInit {
  private svc = inject(PipelineService);

  readonly stageColumns = LEAD_STAGE_ORDER;
  readonly stageLabels = LEAD_STAGE_LABELS;
  readonly sources = LEAD_SOURCES;
  readonly servicesList: LeadService[] = [
    'seo',
    'ppc',
    'website',
    'combo',
    'other',
  ];

  leads = signal<Lead[]>([]);
  stats = signal<PipelineStats | null>(null);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  editing = signal<EditableLead | null>(null);
  saving = signal<boolean>(false);
  saveError = signal<string | null>(null);
  activityText = '';

  byStage = computed<Record<LeadStage, Lead[]>>(() => {
    const map: Record<LeadStage, Lead[]> = {
      new: [],
      no_show: [],
      proposal_sent: [],
      closed_won: [],
      closed_lost: [],
    };
    for (const l of this.leads()) map[l.stage as LeadStage].push(l);
    return map;
  });

  totalCount = computed(() => this.leads().length);

  activityRows = computed(() => {
    const id = this.editing()?._id;
    if (!id) return [];
    const l = this.leads().find((x) => x._id === id);
    return [...(l?.activity ?? [])].reverse();
  });

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.loadError.set(null);
    this.svc.list().subscribe({
      next: (list) => {
        this.leads.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load pipeline.');
      },
    });
    this.svc.stats().subscribe({
      next: (s) => this.stats.set(s),
      error: () => null,
    });
  }

  openNew() {
    this.saveError.set(null);
    this.editing.set({
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      source: undefined,
      services: [],
      monthlyDealValue: undefined,
      oneTimeDealValue: undefined,
      stage: 'new',
      notes: '',
    });
  }

  openEdit(l: Lead) {
    this.saveError.set(null);
    this.editing.set({
      _id: l._id,
      businessName: l.businessName,
      contactName: l.contactName || '',
      email: l.email || '',
      phone: l.phone || '',
      website: l.website || '',
      source: l.source,
      services: [...(l.services || [])],
      monthlyDealValue: l.monthlyDealValue,
      oneTimeDealValue: l.oneTimeDealValue,
      stage: l.stage,
      notes: l.notes || '',
    });
    this.activityText = '';
  }

  closeEditor() {
    if (this.saving()) return;
    this.editing.set(null);
  }

  toggleService(e: EditableLead, svc: LeadService) {
    e.services = e.services.includes(svc)
      ? e.services.filter((s) => s !== svc)
      : [...e.services, svc];
    this.editing.set({ ...e });
  }

  save() {
    const e = this.editing();
    if (!e) return;
    if (!e.businessName.trim()) {
      this.saveError.set('Business name is required.');
      return;
    }
    const payload: Partial<Lead> = {
      businessName: e.businessName.trim(),
      contactName: e.contactName?.trim() || undefined,
      email: e.email?.trim() || undefined,
      phone: e.phone?.trim() || undefined,
      website: e.website?.trim() || undefined,
      source: (e.source as never) || undefined,
      services: e.services,
      monthlyDealValue: e.monthlyDealValue,
      oneTimeDealValue: e.oneTimeDealValue,
      stage: e.stage,
      notes: e.notes?.trim() || undefined,
    };
    this.saving.set(true);
    this.saveError.set(null);
    const req$ = e._id
      ? this.svc.update(e._id, payload)
      : this.svc.create(payload);
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

  quickMove(l: Lead, stage: LeadStage) {
    if (!l._id || l.stage === stage) return;
    this.svc.changeStage(l._id, stage).subscribe({
      next: () => this.reload(),
      error: (err) => alert(err?.error?.message || 'Stage change failed.'),
    });
  }

  addActivity(kind: 'note' | 'call' | 'email') {
    const e = this.editing();
    const text = this.activityText.trim();
    if (!e?._id || !text) return;
    this.svc.addActivity(e._id, kind, text).subscribe({
      next: () => {
        this.activityText = '';
        this.reload();
      },
      error: (err) => alert(err?.error?.message || 'Failed to add activity.'),
    });
  }

  remove() {
    const e = this.editing();
    if (!e?._id) return;
    if (!confirm(`Delete "${e.businessName}"? This cannot be undone.`)) return;
    this.svc.remove(e._id).subscribe({
      next: () => {
        this.editing.set(null);
        this.reload();
      },
      error: (err) => alert(err?.error?.message || 'Delete failed.'),
    });
  }

  formatServices(list?: LeadService[]): string {
    if (!list?.length) return 'no service';
    return list.join(' · ');
  }
}
