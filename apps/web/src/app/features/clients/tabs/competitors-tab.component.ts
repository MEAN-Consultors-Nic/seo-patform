import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Client,
  Competitor,
  CompetitorKeyword,
  Keyword,
  ServiceArea,
} from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { CompetitorsService } from '../../../core/competitors.service';
import { KeywordsService } from '../../../core/keywords.service';

const GLOBAL_SCOPE = '__global__';

@Component({
  selector: 'app-client-competitors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="space-y-4">
      <div class="card">
        <h3 class="font-semibold text-navy-700 mb-3">+ Competitor</h3>
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newC.name" placeholder="Name" />
          <input class="input md:col-span-2" [(ngModel)]="newC.url" placeholder="https://..." />
          <input class="input" type="number" [(ngModel)]="newC.domainRating" placeholder="DR" />
          @if (serviceAreas().length > 0) {
            <select class="input" [(ngModel)]="newC.serviceAreaName">
              <option value="">🌐 All locations (global)</option>
              @for (a of serviceAreas(); track a.name) {
                <option [value]="a.name">📍 {{ a.name }}</option>
              }
            </select>
          }
        </div>
        @if (serviceAreas().length > 0) {
          <p class="text-[11px] text-ink-500 mt-2">
            Pick a specific location if this competitor only matters for one
            of the client's service areas, or leave on "All locations" to
            track them globally.
          </p>
        }
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newC.name || !newC.url">
          Create competitor
        </button>
      </div>

      <!-- Filter bar -->
      @if (competitors().length > 0) {
        <div class="card !p-3 flex flex-wrap items-end gap-3">
          <div class="min-w-[180px]">
            <label class="label">Filter by scope</label>
            <select class="input input-sm"
                    [ngModel]="scopeFilter()"
                    (ngModelChange)="scopeFilter.set($event)">
              <option value="">All competitors ({{ competitors().length }})</option>
              <option [value]="globalScope">🌐 Global only ({{ globalCount() }})</option>
              @if (serviceAreas().length > 0) {
                <optgroup label="By location">
                  @for (a of serviceAreas(); track a.name) {
                    <option [value]="a.name">
                      📍 {{ a.name }} ({{ countFor(a.name) }})
                    </option>
                  }
                </optgroup>
              }
            </select>
          </div>
          <div class="text-[11px] text-ink-500 ml-auto">
            Showing <strong class="text-ink-900">{{ filteredCompetitors().length }}</strong>
            of {{ competitors().length }}
          </div>
        </div>
      }

      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm min-w-[720px]">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th class="w-8"></th>
              <th class="px-4 py-2 text-left">Competitor</th>
              <th class="px-4 py-2 text-left">Scope</th>
              <th class="px-4 py-2 text-left">Keywords</th>
              <th class="px-4 py-2 text-right">DR</th>
              <th class="px-4 py-2 text-right">Est. traffic</th>
              <th class="px-4 py-2 text-left">Notes</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of filteredCompetitors(); track c._id) {
              <tr class="border-b border-slate-100"
                  [class.bg-brand-50/30]="expandedId() === c._id">
                <td class="px-2 py-2 text-center">
                  <button type="button"
                          class="w-6 h-6 rounded hover:bg-ink-100 text-ink-500 text-xs transition"
                          (click)="toggleExpand(c._id!)"
                          [attr.aria-label]="expandedId() === c._id ? 'Collapse' : 'Expand'">
                    {{ expandedId() === c._id ? '▼' : '▶' }}
                  </button>
                </td>
                <td class="px-4 py-2">
                  <div class="font-medium text-navy-700">{{ c.name }}</div>
                  <a [href]="c.url" target="_blank" rel="noopener"
                     class="text-[11px] text-brand-500 hover:underline truncate max-w-[240px] block"
                     [title]="c.url">
                    {{ c.url }} ↗
                  </a>
                </td>
                <td class="px-4 py-2 text-xs">
                  @if (c.serviceAreaName) {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 text-brand-600 font-semibold whitespace-nowrap">
                      📍 {{ c.serviceAreaName }}
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ink-100 text-ink-600 font-semibold whitespace-nowrap">
                      🌐 Global
                    </span>
                  }
                </td>
                <td class="px-4 py-2 text-xs text-ink-600">
                  @if ((c.keywords?.length || 0) > 0) {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 text-sky-700 font-semibold">
                      {{ c.keywords?.length }} tracked
                    </span>
                  } @else {
                    <button type="button"
                            class="text-[11px] text-brand-500 hover:underline"
                            (click)="toggleExpand(c._id!)">
                      + Add
                    </button>
                  }
                </td>
                <td class="px-4 py-2 text-right">
                  <input type="number" class="w-14 text-xs border rounded px-1 py-0.5 text-right"
                         [ngModel]="c.domainRating" (ngModelChange)="patch(c, 'domainRating', $event)" />
                </td>
                <td class="px-4 py-2 text-right">
                  <input type="number" class="w-20 text-xs border rounded px-1 py-0.5 text-right"
                         [ngModel]="c.estimatedTraffic" (ngModelChange)="patch(c, 'estimatedTraffic', $event)" />
                </td>
                <td class="px-4 py-2">
                  <input class="w-full text-xs border rounded px-1 py-0.5"
                         [ngModel]="c.notes" (ngModelChange)="patch(c, 'notes', $event)" />
                </td>
                <td class="px-4 py-2 text-right whitespace-nowrap">
                  @if (serviceAreas().length > 0) {
                    <select class="text-[10px] border border-ink-200 rounded px-1 py-0.5 bg-white mr-1"
                            [ngModel]="c.serviceAreaName || ''"
                            (ngModelChange)="patchScope(c, $event)"
                            title="Change scope">
                      <option value="">🌐 Global</option>
                      @for (a of serviceAreas(); track a.name) {
                        <option [value]="a.name">📍 {{ a.name }}</option>
                      }
                    </select>
                  }
                  <button class="text-red-500 hover:text-red-700" (click)="remove(c)">×</button>
                </td>
              </tr>

              @if (expandedId() === c._id) {
                <tr class="border-b border-slate-200 bg-ink-50/40">
                  <td colspan="8" class="px-4 py-3">
                    <div class="space-y-3">
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <h4 class="text-xs font-bold uppercase tracking-wider text-ink-700">
                          Keywords {{ c.name }} competes on
                        </h4>
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <select class="input input-sm text-xs w-64"
                                  [(ngModel)]="addKwDraft.keywordId">
                            <option value="">Pick a keyword to track…</option>
                            @for (k of availableClientKeywords(c); track k._id) {
                              <option [value]="k._id">
                                {{ k.text }}@if (k.currentPosition) { · we're at {{ k.currentPosition }} }
                              </option>
                            }
                          </select>
                          <input type="number" class="input input-sm w-20 text-xs" min="1" max="200"
                                 [(ngModel)]="addKwDraft.position"
                                 placeholder="Pos" />
                          <button type="button"
                                  class="btn-primary text-xs px-3 py-1"
                                  [disabled]="!addKwDraft.keywordId"
                                  (click)="addKeyword(c)">
                            Track
                          </button>
                        </div>
                      </div>

                      @if ((c.keywords?.length || 0) === 0) {
                        <div class="text-xs text-ink-400 italic py-3 text-center">
                          No keywords tracked yet for this competitor. Pick one above and record their current SERP position.
                        </div>
                      } @else {
                        <table class="w-full text-xs">
                          <thead class="border-b border-ink-200 text-[10px] uppercase text-ink-500">
                            <tr>
                              <th class="text-left py-1.5">Keyword</th>
                              <th class="text-right py-1.5 w-24">Our pos</th>
                              <th class="text-right py-1.5 w-24">Their pos</th>
                              <th class="text-left py-1.5 w-24">Δ vs us</th>
                              <th class="text-left py-1.5 w-32">Last checked</th>
                              <th class="text-right py-1.5 w-32">Actions</th>
                            </tr>
                          </thead>
                          <tbody class="divide-y divide-ink-100">
                            @for (kw of c.keywords; track kw._id) {
                              <tr class="hover:bg-white">
                                <td class="py-1.5 text-ink-900">
                                  {{ keywordText(kw.keywordId) }}
                                </td>
                                <td class="text-right text-ink-700">
                                  @if (ourPosition(kw.keywordId); as pos) {
                                    {{ pos | number: '1.0-1' }}
                                  } @else {
                                    <span class="text-ink-400">—</span>
                                  }
                                </td>
                                <td class="text-right">
                                  <input type="number" min="1" max="200"
                                         class="w-16 border border-ink-200 rounded px-1 py-0.5 text-right text-xs"
                                         [ngModel]="kw.position"
                                         (blur)="onKeywordPositionBlur(c, kw, $any($event.target).value)"
                                         (keyup.enter)="onKeywordPositionBlur(c, kw, $any($event.target).value)" />
                                </td>
                                <td>
                                  @if (deltaVsUs(kw); as d) {
                                    <span [class.text-positive-500]="d.better"
                                          [class.text-danger-500]="!d.better"
                                          class="text-xs font-semibold">
                                      {{ d.better ? '▲' : '▼' }} {{ d.abs | number: '1.0-1' }}
                                    </span>
                                  } @else {
                                    <span class="text-ink-400">—</span>
                                  }
                                </td>
                                <td class="text-[11px] text-ink-500">
                                  @if (kw.lastCheckedAt) {
                                    {{ kw.lastCheckedAt | date: 'MMM d, y' }}
                                  } @else {
                                    <span class="text-ink-400 italic">never</span>
                                  }
                                </td>
                                <td class="text-right whitespace-nowrap">
                                  <a [href]="googleSearchUrl(kw.keywordId)"
                                     target="_blank" rel="noopener"
                                     class="text-[10px] px-1.5 py-1 rounded hover:bg-ink-100 text-ink-600 hover:text-brand-500"
                                     title="Open Google search for this keyword">
                                    🔍
                                  </a>
                                  <button type="button"
                                          class="text-[10px] px-1.5 py-1 rounded hover:bg-danger-100 text-ink-400 hover:text-danger-500"
                                          (click)="removeKeyword(c, kw)"
                                          title="Stop tracking">
                                    ×
                                  </button>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      }
                    </div>
                  </td>
                </tr>
              }
            }
            @if (!competitors().length) {
              <tr>
                <td colspan="8" class="px-4 py-8 text-center text-slate-400 italic">
                  No competitors registered.
                </td>
              </tr>
            } @else if (filteredCompetitors().length === 0) {
              <tr>
                <td colspan="8" class="px-4 py-8 text-center text-slate-400 italic">
                  No competitors match the current scope filter.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ClientCompetitorsTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  private svc = inject(CompetitorsService);
  private clientsSvc = inject(ClientsService);
  private keywordsSvc = inject(KeywordsService);

  globalScope = GLOBAL_SCOPE;
  competitors = signal<Competitor[]>([]);
  client = signal<Client | null>(null);
  scopeFilter = signal<string>('');
  clientKeywords = signal<Keyword[]>([]);
  expandedId = signal<string | null>(null);
  addKwDraft: { keywordId: string; position?: number } = {
    keywordId: '',
    position: undefined,
  };
  newC: Partial<Competitor> = {
    name: '',
    url: '',
    domainRating: undefined,
    serviceAreaName: '',
  };
  private debounce: Record<string, ReturnType<typeof setTimeout>> = {};

  serviceAreas = computed<ServiceArea[]>(
    () => this.client()?.serviceAreas ?? [],
  );

  globalCount = computed(
    () => this.competitors().filter((c) => !c.serviceAreaName).length,
  );

  countFor(areaName: string): number {
    return this.competitors().filter((c) => c.serviceAreaName === areaName)
      .length;
  }

  filteredCompetitors = computed(() => {
    const scope = this.scopeFilter();
    if (!scope) return this.competitors();
    if (scope === GLOBAL_SCOPE) {
      return this.competitors().filter((c) => !c.serviceAreaName);
    }
    return this.competitors().filter((c) => c.serviceAreaName === scope);
  });

  ngOnChanges() {
    this.load();
  }

  load() {
    this.svc.byClient(this.clientId).subscribe((c) => this.competitors.set(c));
    this.clientsSvc.get(this.clientId).subscribe((c) => this.client.set(c));
    this.keywordsSvc
      .byClient(this.clientId)
      .subscribe((k) => this.clientKeywords.set(k));
  }

  // --- Row expansion + keyword tracking -------------------------------

  toggleExpand(competitorId: string) {
    this.expandedId.update((current) =>
      current === competitorId ? null : competitorId,
    );
    // Reset the draft so opening a different row doesn't inherit the
    // previous selection.
    this.addKwDraft = { keywordId: '', position: undefined };
  }

  /**
   * Keywords the client tracks that this competitor isn't tracking
   * yet. Used to populate the "Add keyword" picker so we don't offer
   * duplicates and the operator sees the shortlist.
   */
  availableClientKeywords(c: Competitor): Keyword[] {
    const alreadyTracked = new Set(
      (c.keywords ?? []).map((k) => String(k.keywordId)),
    );
    return this.clientKeywords().filter(
      (k) => !!k._id && !alreadyTracked.has(String(k._id)),
    );
  }

  keywordText(keywordId: string | { _id?: string; text?: string }): string {
    const id =
      typeof keywordId === 'object' && keywordId
        ? String(keywordId._id ?? '')
        : String(keywordId);
    const kw = this.clientKeywords().find((k) => String(k._id) === id);
    if (kw) return kw.text;
    // Fallback when the object came populated from Mongo already.
    if (typeof keywordId === 'object' && keywordId?.text) return keywordId.text;
    return '(unknown keyword)';
  }

  /**
   * Client's current position on the same keyword — pulled from the
   * Keyword doc so the row can show "our pos vs their pos" without
   * a second round-trip.
   */
  ourPosition(keywordId: string | { _id?: string }): number | undefined {
    const id =
      typeof keywordId === 'object' && keywordId
        ? String(keywordId._id ?? '')
        : String(keywordId);
    const kw = this.clientKeywords().find((k) => String(k._id) === id);
    return kw?.currentPosition;
  }

  /**
   * Delta vs the client's own position. Positive `better` means the
   * competitor is ranking worse than the client — visually shown with
   * a green ▲ (our win). Negative means they're ranking above us.
   */
  deltaVsUs(kw: CompetitorKeyword): { abs: number; better: boolean } | null {
    if (kw.position === undefined || kw.position === null) return null;
    const our = this.ourPosition(kw.keywordId);
    if (our === undefined || our === null) return null;
    const diff = kw.position - our;
    return { abs: Math.abs(diff), better: diff > 0 };
  }

  /**
   * URL that opens the Google search results for a keyword in a new
   * tab — quick way to eyeball the SERP without leaving the platform.
   */
  googleSearchUrl(keywordId: string | { _id?: string }): string {
    const id =
      typeof keywordId === 'object' && keywordId
        ? String(keywordId._id ?? '')
        : String(keywordId);
    const kw = this.clientKeywords().find((k) => String(k._id) === id);
    const q = encodeURIComponent(kw?.text || '');
    return `https://www.google.com/search?q=${q}`;
  }

  addKeyword(c: Competitor) {
    if (!c._id || !this.addKwDraft.keywordId) return;
    this.svc
      .addKeyword(c._id, {
        keywordId: this.addKwDraft.keywordId,
        position: this.addKwDraft.position ?? undefined,
      })
      .subscribe({
        next: (updated) => {
          this.competitors.update((list) =>
            list.map((x) => (x._id === updated._id ? updated : x)),
          );
          this.addKwDraft = { keywordId: '', position: undefined };
        },
        error: (err) => {
          alert(err?.error?.message || 'Could not track keyword.');
        },
      });
  }

  onKeywordPositionBlur(c: Competitor, kw: CompetitorKeyword, raw: string) {
    if (!c._id || !kw._id) return;
    const parsed = raw?.trim() ? Number(raw) : undefined;
    if (parsed !== undefined && (isNaN(parsed) || parsed < 1)) return;
    if (parsed === kw.position) return;
    this.svc
      .updateKeyword(c._id, kw._id, { position: parsed })
      .subscribe({
        next: (updated) => {
          this.competitors.update((list) =>
            list.map((x) => (x._id === updated._id ? updated : x)),
          );
        },
      });
  }

  removeKeyword(c: Competitor, kw: CompetitorKeyword) {
    if (!c._id || !kw._id) return;
    if (!confirm(`Stop tracking "${this.keywordText(kw.keywordId)}" on ${c.name}?`)) return;
    this.svc.removeKeyword(c._id, kw._id).subscribe({
      next: () => {
        this.competitors.update((list) =>
          list.map((x) =>
            x._id === c._id
              ? { ...x, keywords: (x.keywords ?? []).filter((k) => k._id !== kw._id) }
              : x,
          ),
        );
      },
    });
  }

  add() {
    if (!this.newC.name || !this.newC.url) return;
    this.svc
      .create({
        ...this.newC,
        clientId: this.clientId,
        serviceAreaName: this.newC.serviceAreaName?.trim() || undefined,
      } as Partial<Competitor>)
      .subscribe(() => {
        this.newC = {
          name: '',
          url: '',
          domainRating: undefined,
          serviceAreaName: '',
        };
        this.load();
      });
  }

  patch(c: Competitor, field: keyof Competitor, value: unknown) {
    if (!c._id) return;
    clearTimeout(this.debounce[c._id]);
    this.debounce[c._id] = setTimeout(() => {
      this.svc.update(c._id!, { [field]: value }).subscribe();
    }, 500);
  }

  patchScope(c: Competitor, value: string) {
    if (!c._id) return;
    // Setting to empty string clears the scope back to global.
    this.svc
      .update(c._id, { serviceAreaName: value || undefined })
      .subscribe(() => this.load());
  }

  remove(c: Competitor) {
    if (!c._id) return;
    this.svc.remove(c._id).subscribe(() => this.load());
  }
}
