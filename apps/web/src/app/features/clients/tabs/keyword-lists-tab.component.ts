import { CommonModule, DecimalPipe } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  KEYWORD_INTENTS,
  KEYWORD_INTENT_LABELS,
  KEYWORD_PRIORITIES,
  KEYWORD_STATUSES,
  KEYWORD_STATUS_LABELS,
  Keyword,
  KeywordIntent,
  KeywordListWithStats,
  KeywordStatus,
} from '@seo/shared';
import {
  KeywordListsService,
  ParsedKeywordRow,
} from '../../../core/keyword-lists.service';
import { KeywordsService } from '../../../core/keywords.service';

type SortKey = 'volume' | 'difficulty' | 'cpc' | 'text' | 'position';

/**
 * Keyword research lists for a client — the planning surface that sits
 * alongside the Keywords tracking table.
 *
 * A list is a named selection over the client's keyword pool, so the
 * same keyword can sit in several lists without being duplicated, and
 * a researched keyword can be promoted to tracking in one click. Rows
 * imported here start untracked, which keeps them out of the position
 * cron and the GSC sync until someone decides they're worth watching.
 */
@Component({
  selector: 'app-client-keyword-lists-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-ink-900">Keyword Lists</h2>
          <p class="text-xs text-ink-500 mt-0.5">
            Research buckets — by cluster, by core term, by campaign. Rows here
            don't enter position tracking until you promote them.
          </p>
        </div>
        <button class="btn-primary text-sm" (click)="openListModal()">
          + New list
        </button>
      </div>

      @if (loading()) {
        <div class="card text-center py-10 text-ink-400 italic">Loading…</div>
      } @else if (lists().length === 0) {
        <div class="card text-center py-12">
          <p class="text-ink-700 font-semibold">No keyword lists yet</p>
          <p class="text-sm text-ink-500 mt-1 max-w-md mx-auto">
            Create one per cluster or core term — "Core: storage units",
            "Q4 content gaps" — then paste your research export straight in.
          </p>
          <button class="btn-primary mt-4" (click)="openListModal()">
            Create the first list
          </button>
        </div>
      } @else {
        <div class="flex flex-col lg:flex-row gap-4 items-start">
          <!-- List rail -->
          <div class="w-full lg:w-64 flex-shrink-0 card !p-2 space-y-1">
            @for (l of lists(); track l._id) {
              <button
                type="button"
                class="w-full text-left rounded-lg px-3 py-2 transition-colors"
                [class.bg-brand-50]="l._id === selectedId()"
                [class.text-brand-600]="l._id === selectedId()"
                [class.hover:bg-ink-50]="l._id !== selectedId()"
                (click)="select(l._id!)">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-semibold text-sm truncate">{{ l.name }}</span>
                  <span class="text-[10px] font-bold text-ink-500 bg-ink-100 rounded-full px-1.5 py-0.5 flex-shrink-0">
                    {{ l.keywordCount }}
                  </span>
                </div>
                <div class="text-[11px] text-ink-500 mt-0.5">
                  {{ l.totalVolume | number }} vol
                  @if (l.trackedCount > 0) {
                    · {{ l.trackedCount }} tracked
                  }
                </div>
              </button>
            }
          </div>

          <!-- Selected list -->
          <div class="flex-1 min-w-0 space-y-3">
            @if (selected(); as list) {
              <div class="card !p-3 flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="font-bold text-ink-900">{{ list.name }}</div>
                  @if (list.description) {
                    <div class="text-xs text-ink-500 mt-0.5">{{ list.description }}</div>
                  }
                </div>
                <div class="flex items-center gap-2">
                  <button class="btn-primary text-xs" (click)="openAddModal()">
                    + Add keywords
                  </button>
                  <button class="btn-secondary text-xs" (click)="openListModal(list)">
                    Rename
                  </button>
                  <button
                    class="btn-secondary text-xs !text-danger-500"
                    (click)="confirmDeleteList(list)">
                    Delete list
                  </button>
                </div>
              </div>

              <!-- Filters -->
              <div class="card !p-3 flex flex-wrap items-end gap-2">
                <div class="flex-1 min-w-[180px]">
                  <label class="label">Search</label>
                  <input
                    class="input"
                    [ngModel]="search()"
                    (ngModelChange)="search.set($event)"
                    placeholder="Filter keywords…" />
                </div>
                <div>
                  <label class="label">Intent</label>
                  <select class="input" [ngModel]="intentFilter()" (ngModelChange)="intentFilter.set($event)">
                    <option value="">All</option>
                    @for (i of intents; track i) {
                      <option [value]="i">{{ intentLabel(i) }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="label">Status</label>
                  <select class="input" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
                    <option value="">All</option>
                    @for (s of statuses; track s) {
                      <option [value]="s">{{ statusLabel(s) }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label class="label">Sort</label>
                  <select class="input" [ngModel]="sortKey()" (ngModelChange)="sortKey.set($event)">
                    <option value="volume">Volume (high→low)</option>
                    <option value="difficulty">Difficulty (low→high)</option>
                    <option value="cpc">CPC (high→low)</option>
                    <option value="position">Position (best first)</option>
                    <option value="text">Keyword (A→Z)</option>
                  </select>
                </div>
              </div>

              @if (rows().length === 0) {
                <div class="card text-center py-10">
                  <p class="text-ink-500 text-sm">
                    @if (keywords().length === 0) {
                      Nothing in this list yet — paste your export to fill it.
                    } @else {
                      No keywords match those filters.
                    }
                  </p>
                </div>
              } @else {
                <div class="card overflow-x-auto p-0">
                  <table class="w-full text-sm">
                    <thead class="bg-ink-50 border-b border-ink-200 text-xs uppercase text-ink-500">
                      <tr>
                        <th class="px-3 py-2 text-left min-w-[220px]">Keyword</th>
                        <th class="px-3 py-2 text-left">Core</th>
                        <th class="px-3 py-2 text-right">Vol.</th>
                        <th class="px-3 py-2 text-right">KD</th>
                        <th class="px-3 py-2 text-right">CPC</th>
                        <th class="px-3 py-2 text-left">Intent</th>
                        <th class="px-3 py-2 text-left">Priority</th>
                        <th class="px-3 py-2 text-left">Status</th>
                        <th class="px-3 py-2 text-right">Pos.</th>
                        <th class="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-ink-100">
                      @for (k of rows(); track k._id) {
                        <tr class="hover:bg-ink-50/60">
                          <td class="px-3 py-2">
                            <div class="font-medium text-ink-900">{{ k.text }}</div>
                            @if (k.targetUrl) {
                              <a [href]="k.targetUrl" target="_blank" rel="noopener"
                                 class="text-[11px] text-sky-500 hover:underline break-all">
                                {{ k.targetUrl }}
                              </a>
                            }
                          </td>
                          <td class="px-3 py-2 text-xs text-ink-500">{{ k.parentTopic || '—' }}</td>
                          <td class="px-3 py-2 text-right tabular-nums">
                            {{ k.volume !== undefined ? (k.volume | number) : '—' }}
                          </td>
                          <td class="px-3 py-2 text-right">
                            @if (k.difficulty !== undefined) {
                              <span class="inline-block rounded px-1.5 py-0.5 text-xs font-bold tabular-nums"
                                    [class]="kdClass(k.difficulty)">
                                {{ k.difficulty }}
                              </span>
                            } @else { <span class="text-ink-300">—</span> }
                          </td>
                          <td class="px-3 py-2 text-right tabular-nums text-xs">
                            {{ k.cpc !== undefined ? '$' + k.cpc.toFixed(2) : '—' }}
                          </td>
                          <td class="px-3 py-2">
                            <select
                              class="input !py-1 !text-xs"
                              [ngModel]="k.intent || ''"
                              (ngModelChange)="patch(k, { intent: $event || undefined })">
                              <option value="">—</option>
                              @for (i of intents; track i) {
                                <option [value]="i">{{ intentLabel(i) }}</option>
                              }
                            </select>
                          </td>
                          <td class="px-3 py-2">
                            <select
                              class="input !py-1 !text-xs"
                              [ngModel]="k.priority || ''"
                              (ngModelChange)="patch(k, { priority: $event || undefined })">
                              <option value="">—</option>
                              @for (p of priorities; track p) {
                                <option [value]="p">{{ p }}</option>
                              }
                            </select>
                          </td>
                          <td class="px-3 py-2">
                            <select
                              class="input !py-1 !text-xs"
                              [ngModel]="k.status || 'idea'"
                              (ngModelChange)="patch(k, { status: $event })">
                              @for (s of statuses; track s) {
                                <option [value]="s">{{ statusLabel(s) }}</option>
                              }
                            </select>
                          </td>
                          <td class="px-3 py-2 text-right">
                            @if (k.tracked === false) {
                              <button
                                class="text-[11px] text-sky-500 hover:underline whitespace-nowrap"
                                title="Start tracking this keyword's position"
                                (click)="patch(k, { tracked: true })">
                                Track
                              </button>
                            } @else if (k.currentPosition !== undefined) {
                              <span class="font-bold tabular-nums">{{ k.currentPosition }}</span>
                            } @else {
                              <span class="text-[11px] text-ink-400">tracked</span>
                            }
                          </td>
                          <td class="px-3 py-2 text-right">
                            <button
                              class="text-ink-400 hover:text-danger-500 text-xs"
                              title="Remove from this list (keeps the keyword)"
                              (click)="removeFromList(k)">
                              ✕
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="text-xs text-ink-500">
                  {{ rows().length }} of {{ keywords().length }} ·
                  {{ totalVolume() | number }} combined monthly volume
                </div>
              }
            }
          </div>
        </div>
      }
    </div>

    <!-- List create / rename modal -->
    @if (listModal()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="listModal.set(false)">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-bold text-ink-900 mb-4">
            {{ editingList() ? 'Rename list' : 'New keyword list' }}
          </h3>
          <div class="space-y-3">
            <div>
              <label class="label">Name</label>
              <input class="input" [(ngModel)]="listForm.name"
                     placeholder="e.g. Core — storage units" />
            </div>
            <div>
              <label class="label">Description (optional)</label>
              <input class="input" [(ngModel)]="listForm.description"
                     placeholder="What this bucket is for" />
            </div>
          </div>
          @if (listError()) {
            <div class="text-xs text-danger-500 mt-3">{{ listError() }}</div>
          }
          <div class="flex justify-end gap-2 mt-6">
            <button class="btn-secondary" (click)="listModal.set(false)">Cancel</button>
            <button class="btn-primary" (click)="saveList()" [disabled]="listSaving()">
              {{ listSaving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Add keywords modal -->
    @if (addModal()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-start justify-center p-4 overflow-y-auto"
           (click)="addModal.set(false)">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 my-8"
             (click)="$event.stopPropagation()">
          <h3 class="text-lg font-bold text-ink-900 mb-1">Add keywords</h3>
          <p class="text-xs text-ink-500 mb-4">
            Adding to <strong>{{ selected()?.name }}</strong>
          </p>

          <div class="flex gap-1 mb-4 border-b border-ink-200">
            <button type="button" class="px-3 py-2 text-sm border-b-2 -mb-px transition-colors"
                    [class.border-brand-500]="addMode() === 'paste'"
                    [class.text-brand-600]="addMode() === 'paste'"
                    [class.font-semibold]="addMode() === 'paste'"
                    [class.border-transparent]="addMode() !== 'paste'"
                    [class.text-ink-500]="addMode() !== 'paste'"
                    (click)="addMode.set('paste')">Paste / import</button>
            <button type="button" class="px-3 py-2 text-sm border-b-2 -mb-px transition-colors"
                    [class.border-brand-500]="addMode() === 'manual'"
                    [class.text-brand-600]="addMode() === 'manual'"
                    [class.font-semibold]="addMode() === 'manual'"
                    [class.border-transparent]="addMode() !== 'manual'"
                    [class.text-ink-500]="addMode() !== 'manual'"
                    (click)="addMode.set('manual')">One at a time</button>
          </div>

          @if (addMode() === 'paste') {
            <p class="text-xs text-ink-500 mb-2">
              Paste straight from Ubersuggest, Ahrefs, Semrush or a spreadsheet.
              Headers are detected automatically; without them the columns are
              read as keyword, volume, difficulty, CPC.
            </p>
            <textarea
              class="input font-mono text-xs"
              rows="10"
              [ngModel]="pasteText()"
              (ngModelChange)="onPasteChange($event)"
              placeholder="Keyword	Search Volume	SEO Difficulty	CPC
storage units near me	12,100	42	$3.40"></textarea>

            @if (parsing()) {
              <div class="text-xs text-ink-500 mt-2">Reading…</div>
            }
            @for (w of parseWarnings(); track w) {
              <div class="text-xs text-amber-600 mt-2">⚠ {{ w }}</div>
            }
            @if (parsedRows().length > 0) {
              <div class="mt-3">
                <div class="text-xs font-semibold text-ink-700 mb-1">
                  {{ parsedRows().length }} keyword(s) detected — preview
                </div>
                <div class="border border-ink-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <table class="w-full text-xs">
                    <thead class="bg-ink-50 text-ink-500 sticky top-0">
                      <tr>
                        <th class="px-2 py-1 text-left">Keyword</th>
                        <th class="px-2 py-1 text-right">Vol.</th>
                        <th class="px-2 py-1 text-right">KD</th>
                        <th class="px-2 py-1 text-right">CPC</th>
                        <th class="px-2 py-1 text-left">Intent</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-ink-100">
                      @for (r of parsedPreview(); track $index) {
                        <tr>
                          <td class="px-2 py-1">{{ r.text }}</td>
                          <td class="px-2 py-1 text-right tabular-nums">{{ r.volume ?? '—' }}</td>
                          <td class="px-2 py-1 text-right tabular-nums">{{ r.difficulty ?? '—' }}</td>
                          <td class="px-2 py-1 text-right tabular-nums">{{ r.cpc ?? '—' }}</td>
                          <td class="px-2 py-1">{{ r.intent || '—' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (parsedRows().length > parsedPreview().length) {
                  <div class="text-[11px] text-ink-400 mt-1">
                    …and {{ parsedRows().length - parsedPreview().length }} more
                  </div>
                }
              </div>

              <label class="inline-flex items-center gap-2 text-xs text-ink-700 mt-3 cursor-pointer">
                <input type="checkbox" [(ngModel)]="importOverwrite" />
                Overwrite values that already exist on a keyword
              </label>
            }
          } @else {
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="sm:col-span-2">
                <label class="label">Keyword</label>
                <input class="input" [(ngModel)]="manualForm.text" placeholder="storage units near me" />
              </div>
              <div>
                <label class="label">Search volume</label>
                <input class="input" type="number" [(ngModel)]="manualForm.volume" />
              </div>
              <div>
                <label class="label">SEO difficulty</label>
                <input class="input" type="number" [(ngModel)]="manualForm.difficulty" />
              </div>
              <div>
                <label class="label">CPC</label>
                <input class="input" type="number" step="0.01" [(ngModel)]="manualForm.cpc" />
              </div>
              <div>
                <label class="label">Intent</label>
                <select class="input" [(ngModel)]="manualForm.intent">
                  <option [ngValue]="undefined">—</option>
                  @for (i of intents; track i) {
                    <option [ngValue]="i">{{ intentLabel(i) }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Parent topic / core</label>
                <input class="input" [(ngModel)]="manualForm.parentTopic" />
              </div>
              <div>
                <label class="label">Target URL</label>
                <input class="input" [(ngModel)]="manualForm.targetUrl" placeholder="https://…" />
              </div>
            </div>
          }

          @if (addError()) {
            <div class="text-xs text-danger-500 mt-3">{{ addError() }}</div>
          }
          @if (addResult(); as res) {
            <div class="text-xs text-positive-500 mt-3">
              ✓ {{ res.created }} created, {{ res.updated }} updated
              @if (res.skipped > 0) { , {{ res.skipped }} skipped }
            </div>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button class="btn-secondary" (click)="addModal.set(false)">Close</button>
            <button class="btn-primary" (click)="commitAdd()" [disabled]="addSaving() || !canCommit()">
              {{ addSaving() ? 'Adding…' : addMode() === 'paste' ? 'Import ' + parsedRows().length + ' keyword(s)' : 'Add keyword' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientKeywordListsTabComponent implements OnInit {
  clientId = input.required<string>();

  private svc = inject(KeywordListsService);
  private keywordsSvc = inject(KeywordsService);

  readonly intents = KEYWORD_INTENTS;
  readonly priorities = KEYWORD_PRIORITIES;
  readonly statuses = KEYWORD_STATUSES;

  loading = signal(true);
  lists = signal<KeywordListWithStats[]>([]);
  selectedId = signal<string | null>(null);
  keywords = signal<Keyword[]>([]);

  search = signal('');
  intentFilter = signal<string>('');
  statusFilter = signal<string>('');
  sortKey = signal<SortKey>('volume');

  // list modal
  listModal = signal(false);
  editingList = signal<KeywordListWithStats | null>(null);
  listForm: { name: string; description: string } = { name: '', description: '' };
  listSaving = signal(false);
  listError = signal<string | null>(null);

  // add modal
  addModal = signal(false);
  addMode = signal<'paste' | 'manual'>('paste');
  pasteText = signal('');
  parsedRows = signal<ParsedKeywordRow[]>([]);
  parseWarnings = signal<string[]>([]);
  parsing = signal(false);
  importOverwrite = false;
  manualForm: Partial<ParsedKeywordRow> = { text: '' };
  addSaving = signal(false);
  addError = signal<string | null>(null);
  addResult = signal<{ created: number; updated: number; skipped: number } | null>(null);

  private parseTimer: ReturnType<typeof setTimeout> | null = null;

  selected = computed(
    () => this.lists().find((l) => l._id === this.selectedId()) ?? null,
  );

  rows = computed<Keyword[]>(() => {
    const term = this.search().trim().toLowerCase();
    const intent = this.intentFilter();
    const status = this.statusFilter();
    const sort = this.sortKey();
    const out = this.keywords().filter((k) => {
      if (term && !k.text.toLowerCase().includes(term)) return false;
      if (intent && k.intent !== intent) return false;
      if (status && (k.status || 'idea') !== status) return false;
      return true;
    });
    // Undefined metrics sort last in every mode — a blank cell should
    // never outrank a real number.
    const byNumber = (a?: number, b?: number, asc = false) => {
      if (a === undefined && b === undefined) return 0;
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      return asc ? a - b : b - a;
    };
    return out.sort((a, b) => {
      switch (sort) {
        case 'text':
          return a.text.localeCompare(b.text);
        case 'difficulty':
          return byNumber(a.difficulty, b.difficulty, true);
        case 'cpc':
          return byNumber(a.cpc, b.cpc);
        case 'position':
          return byNumber(a.currentPosition, b.currentPosition, true);
        default:
          return byNumber(a.volume, b.volume);
      }
    });
  });

  totalVolume = computed(() =>
    this.rows().reduce((acc, k) => acc + (k.volume ?? 0), 0),
  );

  parsedPreview = computed(() => this.parsedRows().slice(0, 25));

  ngOnInit() {
    this.reloadLists();
  }

  // --- data ---------------------------------------------------------------

  private reloadLists(selectId?: string) {
    this.loading.set(true);
    this.svc.byClient(this.clientId()).subscribe({
      next: (lists) => {
        this.lists.set(lists);
        const next =
          selectId ??
          (lists.some((l) => l._id === this.selectedId())
            ? this.selectedId()
            : lists[0]?._id ?? null);
        this.selectedId.set(next ?? null);
        this.loading.set(false);
        if (next) this.loadKeywords(next);
        else this.keywords.set([]);
      },
      error: () => {
        this.lists.set([]);
        this.loading.set(false);
      },
    });
  }

  private loadKeywords(listId: string) {
    this.svc.keywords(listId).subscribe({
      next: (k) => this.keywords.set(k),
      error: () => this.keywords.set([]),
    });
  }

  select(id: string) {
    this.selectedId.set(id);
    this.keywords.set([]);
    this.loadKeywords(id);
  }

  // --- list CRUD ----------------------------------------------------------

  openListModal(list?: KeywordListWithStats) {
    this.editingList.set(list ?? null);
    this.listForm = {
      name: list?.name ?? '',
      description: list?.description ?? '',
    };
    this.listError.set(null);
    this.listModal.set(true);
  }

  saveList() {
    const name = this.listForm.name.trim();
    if (!name) {
      this.listError.set('Name is required.');
      return;
    }
    this.listSaving.set(true);
    this.listError.set(null);
    const editing = this.editingList();
    const done = (id?: string) => {
      this.listSaving.set(false);
      this.listModal.set(false);
      this.reloadLists(id);
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.listSaving.set(false);
      this.listError.set(err?.error?.message || 'Could not save the list.');
    };
    if (editing?._id) {
      this.svc
        .update(editing._id, { name, description: this.listForm.description })
        .subscribe({ next: () => done(editing._id), error: fail });
    } else {
      this.svc
        .create({
          clientId: this.clientId(),
          name,
          description: this.listForm.description,
        })
        .subscribe({ next: (l) => done(l._id), error: fail });
    }
  }

  confirmDeleteList(list: KeywordListWithStats) {
    const ok = confirm(
      `Delete "${list.name}"?\n\nThe ${list.keywordCount} keyword(s) in it are kept — they're only removed from this list.`,
    );
    if (!ok) return;
    if (!list._id) return;
    this.svc.remove(list._id).subscribe({
      next: () => {
        this.selectedId.set(null);
        this.reloadLists();
      },
    });
  }

  // --- keyword row actions -------------------------------------------------

  /** Optimistic inline edit — the row updates before the request lands. */
  patch(k: Keyword, dto: Partial<Keyword>) {
    const id = k._id;
    if (!id) return;
    const before = { ...k };
    this.keywords.update((list) =>
      list.map((row) => (row._id === id ? { ...row, ...dto } : row)),
    );
    this.keywordsSvc.update(id, dto).subscribe({
      error: () => {
        // Roll the row back so the table never shows a value the
        // server rejected.
        this.keywords.update((list) =>
          list.map((row) => (row._id === id ? before : row)),
        );
      },
    });
  }

  removeFromList(k: Keyword) {
    const listId = this.selectedId();
    if (!listId || !k._id) return;
    this.keywords.update((list) => list.filter((row) => row._id !== k._id));
    this.svc.removeKeyword(listId, k._id).subscribe({
      next: () => this.refreshCounts(),
      error: () => this.loadKeywords(listId),
    });
  }

  private refreshCounts() {
    this.svc.byClient(this.clientId()).subscribe({
      next: (lists) => this.lists.set(lists),
    });
  }

  // --- add keywords --------------------------------------------------------

  openAddModal() {
    this.addMode.set('paste');
    this.pasteText.set('');
    this.parsedRows.set([]);
    this.parseWarnings.set([]);
    this.manualForm = { text: '' };
    this.importOverwrite = false;
    this.addError.set(null);
    this.addResult.set(null);
    this.addModal.set(true);
  }

  /**
   * Debounced so a long paste doesn't fire a request per keystroke —
   * parsing runs server-side to keep one implementation of the column
   * mapping rather than duplicating it in the browser.
   */
  onPasteChange(text: string) {
    this.pasteText.set(text);
    this.addResult.set(null);
    if (this.parseTimer) clearTimeout(this.parseTimer);
    if (!text.trim()) {
      this.parsedRows.set([]);
      this.parseWarnings.set([]);
      return;
    }
    this.parsing.set(true);
    this.parseTimer = setTimeout(() => {
      this.svc.parse(text).subscribe({
        next: (res) => {
          this.parsedRows.set(res.rows);
          this.parseWarnings.set(res.warnings);
          this.parsing.set(false);
        },
        error: () => {
          this.parsedRows.set([]);
          this.parsing.set(false);
        },
      });
    }, 350);
  }

  canCommit(): boolean {
    return this.addMode() === 'paste'
      ? this.parsedRows().length > 0
      : !!this.manualForm.text?.trim();
  }

  commitAdd() {
    const listId = this.selectedId();
    if (!listId || !this.canCommit()) return;
    const rows =
      this.addMode() === 'paste'
        ? this.parsedRows()
        : [this.manualForm as ParsedKeywordRow];
    this.addSaving.set(true);
    this.addError.set(null);
    this.svc.import(listId, rows, { overwrite: this.importOverwrite }).subscribe({
      next: (res) => {
        this.addSaving.set(false);
        this.addResult.set(res);
        this.pasteText.set('');
        this.parsedRows.set([]);
        this.manualForm = { text: '' };
        this.loadKeywords(listId);
        this.refreshCounts();
      },
      error: (err) => {
        this.addSaving.set(false);
        this.addError.set(
          err?.error?.message || 'Could not import those keywords.',
        );
      },
    });
  }

  // --- display -------------------------------------------------------------

  intentLabel(i: KeywordIntent): string {
    return KEYWORD_INTENT_LABELS[i];
  }

  statusLabel(s: KeywordStatus): string {
    return KEYWORD_STATUS_LABELS[s];
  }

  /** Ahrefs-style difficulty banding so the number reads at a glance. */
  kdClass(kd: number): string {
    if (kd <= 30) return 'bg-positive-100 text-positive-600';
    if (kd <= 60) return 'bg-amber-100 text-amber-700';
    return 'bg-danger-100 text-danger-500';
  }
}
