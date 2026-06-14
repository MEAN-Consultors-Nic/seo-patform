import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GscKeywordPullResult, Keyword, KeywordIntent } from '@seo/shared';
import { KeywordsService } from '../../../core/keywords.service';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-client-keywords-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="card text-center">
          <div class="text-xs text-slate-500">Total</div>
          <div class="text-2xl font-bold text-navy-700">{{ summary().total }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-slate-500">Top 3</div>
          <div class="text-2xl font-bold text-emerald-600">{{ summary().top3 }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-slate-500">Top 10</div>
          <div class="text-2xl font-bold text-teal-600">{{ summary().top10 }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-slate-500">Avg position</div>
          <div class="text-2xl font-bold text-navy-700">
            {{ summary().avgPosition !== null ? (summary().avgPosition | number: '1.1-1') : '—' }}
          </div>
        </div>
      </div>

      <!-- GSC actions -->
      <div class="card flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-ink-900">Google Search Console</h3>
          <p class="text-xs text-ink-500 mt-0.5">
            Auto-import top queries from GSC, or refresh metrics on existing
            keywords.
            <span class="text-ink-400">·</span>
            <span class="text-ink-700 font-semibold">{{ gscCount() }}</span>
            of {{ keywords().length }} keywords imported from GSC.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-secondary text-xs" (click)="openSyncModal()"
                  [disabled]="syncing()"
                  title="Refresh position, impressions, clicks for every keyword">
            {{ syncing() ? 'Syncing…' : '🔄 Sync from GSC' }}
          </button>
          <button class="btn-secondary text-xs" (click)="openPullModal()">
            ⚡ Pull from GSC
          </button>
          <button class="btn-ghost text-xs text-danger-500"
                  (click)="cleanGscPulled()"
                  [disabled]="cleaning() || gscCount() === 0">
            {{ cleaning() ? 'Cleaning…' : '🧹 Clean GSC-pulled' }}
          </button>
        </div>
      </div>

      @if (syncResult(); as r) {
        <div class="card border-l-4 border-l-positive-500 bg-positive-100/30 text-sm">
          <div class="font-semibold text-ink-900">✓ Sync complete</div>
          <div class="text-xs text-ink-700 mt-0.5">
            <strong>{{ r.updated }}</strong> updated
            · <strong>{{ r.notFound }}</strong> no data in range
            @if (r.failed > 0) {
              · <strong class="text-danger-500">{{ r.failed }}</strong> failed
            }
            · range {{ r.range.from }} → {{ r.range.to }}
          </div>
          @if (r.warnings.length > 0) {
            <ul class="mt-1 text-[11px] text-warning-500 list-disc pl-4 max-h-24 overflow-y-auto">
              @for (w of r.warnings; track w) {
                <li>{{ w }}</li>
              }
            </ul>
          }
        </div>
      }

      <div class="card">
        <h3 class="font-semibold text-navy-700 mb-3">+ New keyword</h3>
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newKw.text" placeholder="Keyword" />
          <input class="input md:col-span-2" [(ngModel)]="newKw.targetUrl" placeholder="/target-url" />
          <input class="input" type="number" [(ngModel)]="newKw.volume" placeholder="Volume" />
          <input class="input" type="number" [(ngModel)]="newKw.difficulty" placeholder="KD %" />
          <select class="input" [(ngModel)]="newKw.intent">
            <option value="">Intent</option>
            @for (i of intents; track i) {
              <option [value]="i">{{ i }}</option>
            }
          </select>
          <input class="input" [(ngModel)]="newKw.group" placeholder="Group (e.g. local)" />
        </div>
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newKw.text">Create keyword</button>
      </div>

      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm min-w-[720px]">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-4 py-2 text-left">Keyword</th>
              <th class="px-4 py-2 text-left">Group</th>
              <th class="px-4 py-2 text-right">Vol.</th>
              <th class="px-4 py-2 text-right">KD</th>
              <th class="px-4 py-2 text-right">Current pos.</th>
              <th class="px-4 py-2 text-right">Previous</th>
              <th class="px-4 py-2 text-right">Δ</th>
              <th class="px-4 py-2 text-right">New pos.</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (k of keywords(); track k._id) {
              <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-2">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-navy-700">{{ k.text }}</span>
                    @if (k.source === 'gsc') {
                      <span class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-600"
                            [title]="'Imported from GSC ' + (k.gscPulledAt | date: 'mediumDate') +
                              ' · clicks: ' + (k.gscClicks ?? 0) +
                              ' · impressions: ' + (k.gscImpressions ?? 0)">
                        GSC
                      </span>
                    }
                  </div>
                  @if (k.targetUrl) {
                    <div class="text-xs text-slate-400">{{ k.targetUrl }}</div>
                  }
                </td>
                <td class="px-4 py-2 text-xs text-slate-500">{{ k.group || '—' }}</td>
                <td class="px-4 py-2 text-right">{{ k.volume ?? '—' }}</td>
                <td class="px-4 py-2 text-right">{{ k.difficulty ?? '—' }}</td>
                <td class="px-4 py-2 text-right font-semibold">
                  <span [ngClass]="positionClass(k.currentPosition)">
                    {{ k.currentPosition ?? '—' }}
                  </span>
                </td>
                <td class="px-4 py-2 text-right text-slate-400">{{ k.previousPosition ?? '—' }}</td>
                <td class="px-4 py-2 text-right text-xs" [ngClass]="deltaClass(k)">
                  {{ delta(k) }}
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <input type="number" class="w-16 text-xs border rounded px-1 py-0.5 text-right"
                           #posInput placeholder="—" />
                    <button class="text-xs text-navy-700 hover:underline"
                            (click)="record(k, posInput.value); posInput.value=''">
                      ✓
                    </button>
                  </div>
                </td>
                <td class="px-4 py-2 text-right whitespace-nowrap">
                  <button class="text-ink-500 hover:text-brand-500 mr-2"
                          title="Edit keyword"
                          (click)="openEditModal(k)">✎</button>
                  <button class="text-red-500 hover:text-red-700"
                          title="Remove keyword"
                          (click)="remove(k)">×</button>
                </td>
              </tr>
            }
            @if (!keywords().length) {
              <tr>
                <td colspan="9" class="px-4 py-8 text-center text-slate-400 italic">
                  No keywords registered. Add the first one above.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit keyword modal -->
    @if (editingKeyword(); as kw) {
      <div class="fixed inset-0 bg-ink-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
           (click)="closeEditModal()">
        <div class="bg-white sm:rounded-xl rounded-t-xl shadow-xl w-full max-w-lg p-4 sm:p-6 max-h-[95vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Edit keyword</h2>
              <p class="text-xs text-ink-500 mt-0.5">{{ kw.text }}</p>
            </div>
            <button type="button" (click)="closeEditModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="label">Keyword</label>
              <input class="input" [(ngModel)]="editForm.text" placeholder="keyword phrase" />
            </div>
            <div>
              <label class="label">Target URL</label>
              <input class="input" [(ngModel)]="editForm.targetUrl"
                     placeholder="https://example.com/page" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Volume</label>
                <input type="number" min="0" class="input" [(ngModel)]="editForm.volume" />
              </div>
              <div>
                <label class="label">KD (%)</label>
                <input type="number" min="0" max="100" class="input" [(ngModel)]="editForm.difficulty" />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Intent</label>
                <select class="input" [(ngModel)]="editForm.intent">
                  <option [ngValue]="undefined">—</option>
                  @for (i of intents; track i) {
                    <option [ngValue]="i">{{ i }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Group</label>
                <input class="input" [(ngModel)]="editForm.group" placeholder="e.g. local" />
              </div>
            </div>

            @if (editError()) {
              <div class="text-xs text-danger-500">{{ editError() }}</div>
            }
          </div>

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="closeEditModal()" [disabled]="savingEdit()">Cancel</button>
            <button class="btn-primary" (click)="saveEdit()"
                    [disabled]="savingEdit() || !editForm.text?.trim()">
              {{ savingEdit() ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Pull from GSC modal -->
    @if (pullModal()) {
      <div class="fixed inset-0 bg-ink-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
           (click)="closePullModal()">
        <div class="bg-white sm:rounded-xl rounded-t-xl shadow-xl w-full max-w-lg p-4 sm:p-6 max-h-[95vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Pull keywords from GSC</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Imports the top-performing queries for the selected period and
                upserts them as tracked keywords.
              </p>
            </div>
            <button (click)="closePullModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="label">Date range</label>
              <select class="input"
                      [ngModel]="pullPreset()"
                      (ngModelChange)="setPreset($event)">
                <option value="last7">Last 7 days</option>
                <option value="last28">Last 28 days</option>
                <option value="last90">Last 90 days</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            @if (pullPreset() === 'custom') {
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">From</label>
                  <input type="date" class="input" [(ngModel)]="pullFrom" />
                </div>
                <div>
                  <label class="label">To</label>
                  <input type="date" class="input" [(ngModel)]="pullTo" />
                </div>
              </div>
            }
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Max keywords</label>
                <input type="number" min="1" max="1000" class="input"
                       [(ngModel)]="pullLimit" />
              </div>
              <div>
                <label class="label">Min impressions</label>
                <input type="number" min="0" class="input"
                       [(ngModel)]="pullMinImpressions" />
              </div>
            </div>

            @if (pullError()) {
              <div class="text-xs text-danger-500">{{ pullError() }}</div>
            }
            @if (pullResult(); as r) {
              <div class="rounded-md bg-positive-100/40 border border-positive-500/30 p-3 text-xs text-ink-700 space-y-0.5">
                <div class="font-semibold text-positive-500">
                  ✓ Pulled {{ r.totalReturned }} queries
                </div>
                <div>
                  <strong class="text-ink-900">{{ r.created }}</strong> new
                  · <strong class="text-ink-900">{{ r.updated }}</strong> updated
                  · <strong class="text-ink-500">{{ r.skipped }}</strong> skipped
                </div>
                <div class="text-[11px] text-ink-500">
                  Range: {{ r.range.from }} → {{ r.range.to }}
                </div>
                @for (w of r.warnings; track w) {
                  <div class="text-[11px] text-warning-500">⚠ {{ w }}</div>
                }
              </div>
            }
          </div>

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="closePullModal()">Close</button>
            <button class="btn-primary" (click)="runPull()" [disabled]="pulling()">
              {{ pulling() ? 'Pulling…' : 'Run import' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Sync from GSC modal -->
    @if (syncModal()) {
      <div class="fixed inset-0 bg-ink-900/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
           (click)="closeSyncModal()">
        <div class="bg-white sm:rounded-xl rounded-t-xl shadow-xl w-full max-w-lg p-4 sm:p-6 max-h-[95vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Sync metrics from GSC</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Refreshes <strong>position</strong>, <strong>impressions</strong>,
                <strong>clicks</strong>, and <strong>CTR</strong> on every keyword
                already tracked for this client. Does <em>not</em> create new
                keywords.
              </p>
            </div>
            <button (click)="closeSyncModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="label">Date range</label>
              <select class="input"
                      [ngModel]="syncPreset()"
                      (ngModelChange)="setSyncPreset($event)">
                <option value="last7">Last 7 days</option>
                <option value="last28">Last 28 days</option>
                <option value="last90">Last 90 days</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            @if (syncPreset() === 'custom') {
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">From</label>
                  <input type="date" class="input" [(ngModel)]="syncFrom" />
                </div>
                <div>
                  <label class="label">To</label>
                  <input type="date" class="input" [(ngModel)]="syncTo" />
                </div>
              </div>
            }
            <div class="rounded-md border border-ink-200 bg-ink-50/50 px-3 py-2 text-[11px] text-ink-600">
              {{ keywords().length }} keyword(s) will be processed in parallel
              batches. Expect a few seconds depending on volume.
            </div>
            @if (syncError()) {
              <div class="text-xs text-danger-500">{{ syncError() }}</div>
            }
          </div>

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="closeSyncModal()" [disabled]="syncing()">Close</button>
            <button class="btn-primary" (click)="runSync()" [disabled]="syncing()">
              {{ syncing() ? 'Syncing…' : '🔄 Run sync' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientKeywordsTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  private svc = inject(KeywordsService);

  keywords = signal<Keyword[]>([]);
  summary = signal<{ total: number; ranked: number; top3: number; top10: number; avgPosition: number | null }>({
    total: 0,
    ranked: 0,
    top3: 0,
    top10: 0,
    avgPosition: null,
  });
  intents: KeywordIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];

  newKw: Partial<Keyword> = { text: '', targetUrl: '', volume: undefined, difficulty: undefined, intent: undefined, group: '' };

  // Edit-keyword modal state
  editingKeyword = signal<Keyword | null>(null);
  editForm: Partial<Keyword> = {};
  savingEdit = signal(false);
  editError = signal<string | null>(null);

  // GSC pull state
  pullModal = signal(false);
  pullPreset = signal<'last7' | 'last28' | 'last90' | 'custom'>('last28');
  pullFrom = daysAgoIso(28);
  pullTo = todayIso();
  pullLimit = 100;
  pullMinImpressions = 10;
  pulling = signal(false);
  pullResult = signal<GscKeywordPullResult | null>(null);
  pullError = signal<string | null>(null);
  cleaning = signal(false);

  // GSC sync state — refreshes metrics for existing keywords
  syncModal = signal(false);
  syncPreset = signal<'last7' | 'last28' | 'last90' | 'custom'>('last28');
  syncFrom = daysAgoIso(28);
  syncTo = todayIso();
  syncing = signal(false);
  syncResult = signal<{
    updated: number;
    notFound: number;
    failed: number;
    totalProcessed: number;
    range: { from: string; to: string };
    warnings: string[];
  } | null>(null);
  syncError = signal<string | null>(null);

  ngOnChanges() {
    this.load();
  }

  load() {
    this.svc.byClient(this.clientId).subscribe((k) => this.keywords.set(k));
    this.svc.summary(this.clientId).subscribe((s) => this.summary.set(s));
  }

  add() {
    if (!this.newKw.text?.trim()) return;
    this.svc.create({ ...this.newKw, clientId: this.clientId } as Partial<Keyword>).subscribe(() => {
      this.newKw = { text: '', targetUrl: '', volume: undefined, difficulty: undefined, intent: undefined, group: '' };
      this.load();
    });
  }

  record(k: Keyword, value: string) {
    const pos = Number(value);
    if (!k._id || !pos || Number.isNaN(pos)) return;
    this.svc.recordPosition(k._id, { position: pos }).subscribe(() => this.load());
  }

  remove(k: Keyword) {
    if (!k._id) return;
    this.svc.remove(k._id).subscribe(() => this.load());
  }

  openEditModal(k: Keyword) {
    this.editingKeyword.set(k);
    this.editForm = {
      text: k.text,
      targetUrl: k.targetUrl ?? '',
      volume: k.volume,
      difficulty: k.difficulty,
      intent: k.intent,
      group: k.group ?? '',
    };
    this.editError.set(null);
  }

  closeEditModal() {
    if (this.savingEdit()) return;
    this.editingKeyword.set(null);
    this.editError.set(null);
  }

  saveEdit() {
    const k = this.editingKeyword();
    if (!k?._id) return;
    const text = this.editForm.text?.trim();
    if (!text) {
      this.editError.set('Keyword text is required.');
      return;
    }
    const patch: Partial<Keyword> = {
      text,
      targetUrl: this.editForm.targetUrl?.trim() || undefined,
      volume: typeof this.editForm.volume === 'number' ? this.editForm.volume : undefined,
      difficulty:
        typeof this.editForm.difficulty === 'number'
          ? this.editForm.difficulty
          : undefined,
      intent: this.editForm.intent || undefined,
      group: this.editForm.group?.trim() || undefined,
    };
    this.savingEdit.set(true);
    this.editError.set(null);
    this.svc.update(k._id, patch).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingKeyword.set(null);
        this.load();
      },
      error: (err) => {
        this.savingEdit.set(false);
        const m = err?.error?.message;
        this.editError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not save changes.',
        );
      },
    });
  }

  gscCount(): number {
    return this.keywords().filter((k) => k.source === 'gsc').length;
  }

  // --- GSC pull ----------------------------------------------------------

  openPullModal() {
    this.pullModal.set(true);
    this.pullError.set(null);
    this.pullResult.set(null);
    this.setPreset(this.pullPreset());
  }

  closePullModal() {
    this.pullModal.set(false);
  }

  setPreset(preset: 'last7' | 'last28' | 'last90' | 'custom') {
    this.pullPreset.set(preset);
    if (preset === 'last7') {
      this.pullFrom = daysAgoIso(7);
      this.pullTo = todayIso();
    } else if (preset === 'last28') {
      this.pullFrom = daysAgoIso(28);
      this.pullTo = todayIso();
    } else if (preset === 'last90') {
      this.pullFrom = daysAgoIso(90);
      this.pullTo = todayIso();
    }
  }

  runPull() {
    if (!this.pullFrom || !this.pullTo) {
      this.pullError.set('Pick a from and to date.');
      return;
    }
    if (this.pullFrom > this.pullTo) {
      this.pullError.set('From date must be on or before To.');
      return;
    }
    this.pulling.set(true);
    this.pullError.set(null);
    this.pullResult.set(null);
    this.svc
      .pullFromGsc({
        clientId: this.clientId,
        from: this.pullFrom,
        to: this.pullTo,
        limit: this.pullLimit || 100,
        minImpressions: this.pullMinImpressions ?? 0,
      })
      .subscribe({
        next: (r) => {
          this.pulling.set(false);
          this.pullResult.set(r);
          this.load();
        },
        error: (err) => {
          this.pulling.set(false);
          const msg = err?.error?.message;
          this.pullError.set(
            Array.isArray(msg) ? msg.join(', ') : msg || 'Could not pull from GSC.',
          );
        },
      });
  }

  cleanGscPulled() {
    const count = this.gscCount();
    if (count === 0) return;
    if (!confirm(`Delete the ${count} keyword(s) imported from GSC? Manual keywords are kept.`))
      return;
    this.cleaning.set(true);
    this.svc.cleanGscPulled(this.clientId).subscribe({
      next: () => {
        this.cleaning.set(false);
        this.load();
      },
      error: () => this.cleaning.set(false),
    });
  }

  positionClass(pos?: number) {
    if (!pos) return 'text-slate-400';
    if (pos <= 3) return 'text-emerald-600';
    if (pos <= 10) return 'text-teal-600';
    if (pos <= 20) return 'text-amber-600';
    return 'text-slate-700';
  }

  delta(k: Keyword): string {
    if (k.currentPosition === undefined || k.previousPosition === undefined) return '—';
    const diff = k.previousPosition - k.currentPosition;
    if (diff === 0) return '0';
    return diff > 0 ? `▲ ${diff}` : `▼ ${Math.abs(diff)}`;
  }

  deltaClass(k: Keyword): string {
    if (k.currentPosition === undefined || k.previousPosition === undefined) return 'text-slate-400';
    const diff = k.previousPosition - k.currentPosition;
    if (diff > 0) return 'text-emerald-600 font-semibold';
    if (diff < 0) return 'text-red-500 font-semibold';
    return 'text-slate-400';
  }

  // --- GSC sync ----------------------------------------------------------

  openSyncModal() {
    this.syncModal.set(true);
    this.syncError.set(null);
    this.setSyncPreset(this.syncPreset());
  }

  closeSyncModal() {
    if (this.syncing()) return;
    this.syncModal.set(false);
  }

  setSyncPreset(preset: 'last7' | 'last28' | 'last90' | 'custom') {
    this.syncPreset.set(preset);
    if (preset === 'last7') {
      this.syncFrom = daysAgoIso(7);
      this.syncTo = todayIso();
    } else if (preset === 'last28') {
      this.syncFrom = daysAgoIso(28);
      this.syncTo = todayIso();
    } else if (preset === 'last90') {
      this.syncFrom = daysAgoIso(90);
      this.syncTo = todayIso();
    }
  }

  runSync() {
    if (!this.syncFrom || !this.syncTo) {
      this.syncError.set('Pick a from and to date.');
      return;
    }
    if (this.keywords().length === 0) {
      this.syncError.set('No keywords to sync. Add some first.');
      return;
    }
    this.syncing.set(true);
    this.syncError.set(null);
    this.svc
      .syncFromGsc({
        clientId: this.clientId,
        from: this.syncFrom,
        to: this.syncTo,
      })
      .subscribe({
        next: (r) => {
          this.syncing.set(false);
          this.syncResult.set(r);
          this.syncModal.set(false);
          this.load();
        },
        error: (err) => {
          this.syncing.set(false);
          const m = err?.error?.message;
          this.syncError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not sync from GSC.',
          );
        },
      });
  }
}
