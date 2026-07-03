import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import cytoscape from 'cytoscape';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — cytoscape-dagre ships no .d.ts as of 2.5.
import dagre from 'cytoscape-dagre';
import {
  CrawlAnalysis,
  CrawlJob,
  CrawlPage,
  CrawlerService,
} from '../../../core/crawler.service';

cytoscape.use(dagre);

type SubTab = 'tree' | 'issues' | 'pages';

/**
 * Site Structure tab — spawns a crawl of the client's website and
 * renders the result as an interactive tree (Cytoscape.js with the
 * dagre layout), an SEO issues panel, and a filterable pages table.
 *
 * The tab is designed to survive tab switches: the crawl runs on the
 * server so leaving the tab (or the whole app) doesn't abort it —
 * the poll picks up again when the user returns.
 */
@Component({
  selector: 'app-client-site-structure-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- Start form / progress panel -->
      <section class="card">
        @if (!activeJob() || activeJob()!.status === 'completed' ||
             activeJob()!.status === 'interrupted' ||
             activeJob()!.status === 'failed') {
          <header class="flex items-baseline justify-between gap-3 mb-3">
            <div>
              <h3 class="text-sm font-bold text-ink-900">🕸️ Site structure crawler</h3>
              <p class="text-[11px] text-ink-500 mt-0.5">
                Crawls the site starting from the root URL and maps every internal page. Uses HTTP-only fetching (no JS render), respects a 3 req/sec rate limit by default.
              </p>
            </div>
            @if (jobs().length > 0) {
              <select class="input !py-1 !text-xs !w-auto"
                      [ngModel]="selectedJobId()"
                      (ngModelChange)="switchJob($event)">
                @for (j of jobs(); track j._id) {
                  <option [value]="j._id">
                    {{ j.startedAt | date: 'short' }} · {{ j.status }}
                    ({{ j.stats.pagesCrawled }} pages)
                  </option>
                }
              </select>
            }
          </header>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div class="md:col-span-2">
              <label class="label">Root URL</label>
              <input class="input" type="url" [(ngModel)]="rootUrl"
                     placeholder="https://buckwaste.com" />
            </div>
            <div>
              <label class="label">Max depth</label>
              <select class="input" [(ngModel)]="maxDepth">
                <option [ngValue]="1">1</option>
                <option [ngValue]="2">2</option>
                <option [ngValue]="3">3</option>
                <option [ngValue]="4">4</option>
                <option [ngValue]="5">5</option>
              </select>
            </div>
            <div>
              <label class="label">Max pages</label>
              <select class="input" [(ngModel)]="maxPages">
                <option [ngValue]="100">100</option>
                <option [ngValue]="250">250</option>
                <option [ngValue]="500">500</option>
                <option [ngValue]="1000">1000</option>
              </select>
            </div>
          </div>
          <div class="mt-3">
            <label class="label">
              Sitemap URL <span class="text-ink-400 font-normal">(optional — recommended for JS-only sites)</span>
            </label>
            <input class="input" type="url" [(ngModel)]="sitemapUrl"
                   placeholder="https://buckwaste.com/sitemap.xml" />
            <p class="text-[11px] text-ink-500 mt-1 leading-snug">
              Paste the sitemap URL directly to skip auto-discovery. Especially useful when the site is JS-rendered (React/Next.js/Wix) and cheerio can't extract links from the shell HTML.
            </p>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <label class="text-xs text-ink-700 inline-flex items-center gap-1.5">
              <input type="checkbox" class="rounded border-ink-300" [(ngModel)]="respectRobots" />
              Respect robots.txt
            </label>
            <label class="text-xs text-ink-700 inline-flex items-center gap-1.5">
              <input type="checkbox" class="rounded border-ink-300" [(ngModel)]="ignoreUtm" />
              Ignore UTM / tracking params
            </label>
            <button class="btn-primary text-xs ml-auto"
                    (click)="startCrawl()"
                    [disabled]="!rootUrl || starting()">
              {{ starting() ? 'Starting…' : '🕷 Start crawl' }}
            </button>
          </div>
          @if (startError(); as e) {
            <div class="mt-2 text-xs text-danger-500">⚠ {{ e }}</div>
          }
        } @else {
          <!-- Running state -->
          <header class="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 class="text-sm font-bold text-ink-900">🕷 Crawl in progress</h3>
              <p class="text-[11px] text-ink-500 mt-0.5">
                {{ activeJob()!.rootUrl }}
              </p>
            </div>
            <button class="btn-secondary text-xs" (click)="cancelCrawl()"
                    [disabled]="cancelling()">
              {{ cancelling() ? 'Cancelling…' : 'Cancel crawl' }}
            </button>
          </header>
          <div class="space-y-2">
            <div class="flex items-baseline justify-between text-xs">
              <span class="font-semibold text-ink-900">
                {{ activeJob()!.stats.pagesCrawled }} / ~{{ activeJob()!.settings.maxPages }} pages
              </span>
              @if (activeJob()!.currentUrl; as u) {
                <span class="text-ink-500 truncate max-w-[60%]" [title]="u">
                  Fetching: {{ u }}
                </span>
              }
            </div>
            <div class="h-2 bg-ink-100 rounded-full overflow-hidden">
              <div class="h-full bg-brand-500 transition-all"
                   [style.width.%]="progressPct()"></div>
            </div>
          </div>
        }
      </section>

      <!-- Results -->
      @if (activeJob() && (activeJob()!.status === 'completed' ||
           activeJob()!.status === 'interrupted') &&
           activeJob()!.stats.pagesCrawled > 0) {

        <!-- Stats strip -->
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <div class="rounded-md border border-ink-200 bg-white p-2 text-center">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500">Pages</div>
            <div class="text-lg font-bold text-ink-900">{{ activeJob()!.stats.pagesCrawled }}</div>
          </div>
          <div class="rounded-md border border-danger-500/30 bg-danger-100/40 p-2 text-center">
            <div class="text-[10px] uppercase tracking-wider font-bold text-danger-700">Broken</div>
            <div class="text-lg font-bold text-danger-700">{{ activeJob()!.stats.brokenLinks }}</div>
          </div>
          <div class="rounded-md border border-warning-500/30 bg-warning-100/40 p-2 text-center">
            <div class="text-[10px] uppercase tracking-wider font-bold text-warning-500">Redirects</div>
            <div class="text-lg font-bold text-warning-500">{{ activeJob()!.stats.redirects }}</div>
          </div>
          <div class="rounded-md border border-warning-500/30 bg-warning-100/40 p-2 text-center">
            <div class="text-[10px] uppercase tracking-wider font-bold text-warning-500">Orphans</div>
            <div class="text-lg font-bold text-warning-500">{{ activeJob()!.stats.orphans }}</div>
          </div>
          <div class="rounded-md border border-ink-200 bg-white p-2 text-center">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500">Dup titles</div>
            <div class="text-lg font-bold text-ink-900">{{ activeJob()!.stats.dupTitles }}</div>
          </div>
          <div class="rounded-md border border-ink-200 bg-white p-2 text-center">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500">Dup metas</div>
            <div class="text-lg font-bold text-ink-900">{{ activeJob()!.stats.dupMetas }}</div>
          </div>
          <div class="rounded-md border border-ink-200 bg-white p-2 text-center">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500">No H1</div>
            <div class="text-lg font-bold text-ink-900">{{ activeJob()!.stats.missingH1 }}</div>
          </div>
        </div>

        <!-- Sub-tab switcher -->
        <div class="flex items-center gap-1 border-b border-ink-200">
          <button type="button" (click)="subTab.set('tree')"
                  [class]="'px-3 py-2 text-xs font-semibold border-b-2 transition-colors ' +
                    (subTab() === 'tree'
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-ink-500 hover:text-ink-900')">
            Tree
          </button>
          <button type="button" (click)="subTab.set('issues')"
                  [class]="'px-3 py-2 text-xs font-semibold border-b-2 transition-colors ' +
                    (subTab() === 'issues'
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-ink-500 hover:text-ink-900')">
            Issues
          </button>
          <button type="button" (click)="subTab.set('pages')"
                  [class]="'px-3 py-2 text-xs font-semibold border-b-2 transition-colors ' +
                    (subTab() === 'pages'
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-ink-500 hover:text-ink-900')">
            Pages ({{ pages().length }})
          </button>
          <a class="ml-auto text-xs text-brand-500 hover:text-brand-600 px-3 py-2"
             (click)="downloadCsv()">
            ⬇ Export CSV
          </a>
        </div>

        <!-- TREE view -->
        @if (subTab() === 'tree') {
          <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
            <div>
              <div class="mb-2 flex items-center gap-2">
                <input class="input !py-1 !text-xs"
                       [(ngModel)]="searchQuery"
                       (ngModelChange)="onSearchChange()"
                       placeholder="Search URL…" />
                <span class="text-[10px] text-ink-500 whitespace-nowrap">
                  {{ visibleNodeCount() }} nodes
                </span>
              </div>
              <div #cyContainer
                   class="bg-white border border-ink-200 rounded-md"
                   style="height: 620px;">
              </div>
              <div class="mt-2 flex items-center gap-3 text-[10px] text-ink-500">
                <span class="inline-flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-positive-500"></span> 2xx
                </span>
                <span class="inline-flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-warning-500"></span> Redirect
                </span>
                <span class="inline-flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-danger-500"></span> 4xx / 5xx
                </span>
                <span class="inline-flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-ink-400"></span> Noindex
                </span>
                <span class="ml-auto">Scroll to zoom · drag to pan · click a node for details</span>
              </div>
            </div>
            <!-- Detail panel -->
            <aside class="bg-white border border-ink-200 rounded-md p-3 text-xs h-fit">
              @if (selectedPage(); as p) {
                <div class="flex items-start justify-between gap-2 mb-2">
                  <span [class]="'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ' + statusClass(p.statusCode)">
                    {{ p.statusCode || 'ERR' }}
                  </span>
                  <button type="button" (click)="selectedPage.set(null)"
                          class="text-ink-400 hover:text-ink-900 text-sm leading-none">×</button>
                </div>
                <div class="text-ink-900 font-semibold break-all mb-2">
                  <a [href]="p.url" target="_blank" rel="noopener" class="hover:text-brand-500">
                    {{ p.url }} ↗
                  </a>
                </div>
                <dl class="space-y-2">
                  <div>
                    <dt class="text-[10px] uppercase text-ink-500 font-semibold">Title</dt>
                    <dd class="text-ink-900">{{ p.title || '—' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[10px] uppercase text-ink-500 font-semibold">Meta description</dt>
                    <dd class="text-ink-700">{{ p.metaDescription || '—' }}</dd>
                  </div>
                  <div>
                    <dt class="text-[10px] uppercase text-ink-500 font-semibold">H1 ({{ p.h1s.length }})</dt>
                    <dd class="text-ink-700">
                      @for (h of p.h1s; track $index) {
                        <div>· {{ h }}</div>
                      }
                      @if (p.h1s.length === 0) { — }
                    </dd>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Depth</dt>
                      <dd class="text-ink-900">{{ p.depth }}</dd>
                    </div>
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Response</dt>
                      <dd class="text-ink-900">{{ p.responseTimeMs }}ms</dd>
                    </div>
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Incoming</dt>
                      <dd class="text-ink-900">{{ p.incomingLinks.length }}</dd>
                    </div>
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Outgoing</dt>
                      <dd class="text-ink-900">{{ p.outgoingLinks.length }}</dd>
                    </div>
                  </div>
                  @if (p.canonical) {
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Canonical</dt>
                      <dd class="text-ink-700 break-all">{{ p.canonical }}</dd>
                    </div>
                  }
                  @if (p.robotsMeta) {
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Robots meta</dt>
                      <dd class="text-ink-700">{{ p.robotsMeta }}</dd>
                    </div>
                  }
                  @if (p.redirectChain.length > 0) {
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Redirect chain</dt>
                      <dd class="text-ink-700 break-all">
                        @for (r of p.redirectChain; track $index) {
                          <div>→ {{ r }}</div>
                        }
                      </dd>
                    </div>
                  }
                  @if (p.fetchError) {
                    <div>
                      <dt class="text-[10px] uppercase text-ink-500 font-semibold">Error</dt>
                      <dd class="text-danger-500">{{ p.fetchError }}</dd>
                    </div>
                  }
                  <!-- Debug panel: exposes why link discovery may have
                       stalled (bot-gated content, JS-only SPA, empty
                       response body). -->
                  <div class="pt-2 mt-2 border-t border-ink-100">
                    <dt class="text-[10px] uppercase text-ink-500 font-semibold">Debug</dt>
                    <dd class="text-ink-700 space-y-0.5">
                      <div>HTML bytes: <span class="tabular-nums">{{ p.htmlBytes ?? 0 }}</span></div>
                      <div>Raw &lt;a href&gt; found: <span class="tabular-nums">{{ p.rawLinksFound ?? 0 }}</span></div>
                      <div>After same-origin filter: <span class="tabular-nums">{{ p.filteredLinkCount ?? 0 }}</span></div>
                      <div>Content-type: <span class="break-all">{{ p.contentType || '—' }}</span></div>
                    </dd>
                  </div>
                </dl>
              } @else {
                <div class="text-[11px] text-ink-500 italic">
                  Click a node in the tree to see its details.
                </div>
              }
            </aside>
          </div>
        }

        <!-- ISSUES view -->
        @if (subTab() === 'issues') {
          @if (analysis(); as a) {
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Broken links', rows: a.brokenLinks, color: 'danger', keys: ['url', 'statusCode'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Redirects', rows: a.redirects, color: 'warning', keys: ['url', 'finalUrl'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Orphan pages', rows: a.orphans, color: 'warning', keys: ['url', 'depth'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Duplicate titles', rows: a.duplicateTitles, color: 'ink', keys: ['title', 'count'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Duplicate meta descriptions', rows: a.duplicateMetaDescriptions, color: 'ink', keys: ['metaDescription', 'count'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Missing title', rows: a.missingTitles, color: 'danger', keys: ['url'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Missing meta description', rows: a.missingMetaDescriptions, color: 'warning', keys: ['url'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Missing H1', rows: a.missingH1, color: 'warning', keys: ['url'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Multiple H1', rows: a.multipleH1, color: 'ink', keys: ['url', 'count'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Canonical mismatches', rows: a.canonicalMismatches, color: 'ink', keys: ['url', 'canonical'] } }"></ng-container>
              <ng-container *ngTemplateOutlet="issueCard; context: { $implicit: { title: 'Noindex pages', rows: a.noindex, color: 'ink', keys: ['url', 'robotsMeta'] } }"></ng-container>
            </div>
          } @else {
            <div class="card text-center text-xs text-ink-500 py-8">
              <span class="spinner mr-2"></span> Running analysis…
            </div>
          }
        }

        <!-- PAGES view -->
        @if (subTab() === 'pages') {
          <div class="card">
            <input class="input mb-3"
                   [(ngModel)]="pagesFilter"
                   placeholder="Filter URL / title / status…" />
            <div class="overflow-x-auto">
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500 border-b border-ink-200">
                    <th class="py-2 px-2 font-bold">Status</th>
                    <th class="py-2 px-2 font-bold">URL</th>
                    <th class="py-2 px-2 font-bold">Title</th>
                    <th class="py-2 px-2 font-bold text-right">Depth</th>
                    <th class="py-2 px-2 font-bold text-right">In</th>
                    <th class="py-2 px-2 font-bold text-right">Out</th>
                    <th class="py-2 px-2 font-bold text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of filteredPages(); track p._id) {
                    <tr class="border-b border-ink-100 hover:bg-ink-50 cursor-pointer"
                        (click)="selectedPage.set(p); subTab.set('tree'); focusNode(p.urlHash)">
                      <td class="py-2 px-2">
                        <span [class]="'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ' + statusClass(p.statusCode)">
                          {{ p.statusCode || 'ERR' }}
                        </span>
                      </td>
                      <td class="py-2 px-2 text-sky-600 truncate max-w-[280px]" [title]="p.url">
                        {{ shortPath(p.url) }}
                      </td>
                      <td class="py-2 px-2 text-ink-900 truncate max-w-[240px]">
                        {{ p.title || '—' }}
                      </td>
                      <td class="py-2 px-2 text-right tabular-nums">{{ p.depth }}</td>
                      <td class="py-2 px-2 text-right tabular-nums">{{ p.incomingLinks.length }}</td>
                      <td class="py-2 px-2 text-right tabular-nums">{{ p.outgoingLinks.length }}</td>
                      <td class="py-2 px-2 text-right tabular-nums">{{ p.responseTimeMs || 0 }}ms</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </div>

    <ng-template #issueCard let-ctx>
      <section class="border border-ink-200 rounded-md bg-white p-3">
        <header class="flex items-baseline justify-between mb-2">
          <h4 class="text-xs font-bold text-ink-900">{{ ctx.title }}</h4>
          <span [class]="'text-[10px] font-bold px-2 py-0.5 rounded ' +
            (ctx.rows.length === 0 ? 'bg-ink-100 text-ink-500' :
             ctx.color === 'danger' ? 'bg-danger-100 text-danger-700' :
             ctx.color === 'warning' ? 'bg-warning-100 text-warning-500' :
             'bg-ink-100 text-ink-700')">
            {{ ctx.rows.length }}
          </span>
        </header>
        @if (ctx.rows.length === 0) {
          <div class="text-[11px] text-positive-500 italic">✓ Clean</div>
        } @else {
          <ul class="space-y-1 max-h-48 overflow-y-auto">
            @for (row of ctx.rows.slice(0, 20); track $index) {
              <li class="text-[11px] text-ink-700 leading-snug">
                @for (k of ctx.keys; track k) {
                  <div [class.font-semibold]="k === 'url' || k === 'title'"
                       class="truncate">
                    <span class="text-ink-400">{{ k }}:</span> {{ row[k] }}
                  </div>
                }
              </li>
            }
          </ul>
          @if (ctx.rows.length > 20) {
            <div class="text-[10px] text-ink-400 mt-1">
              +{{ ctx.rows.length - 20 }} more (see Pages tab or Export CSV)
            </div>
          }
        }
      </section>
    </ng-template>
  `,
})
export class ClientSiteStructureTab
  implements OnChanges, AfterViewInit, OnDestroy
{
  @Input({ required: true }) clientId!: string;
  @Input() rootUrl = '';

  @ViewChild('cyContainer', { static: false })
  cyContainer?: ElementRef<HTMLDivElement>;

  private crawler = inject(CrawlerService);

  maxDepth = 3;
  maxPages = 500;
  respectRobots = false;
  ignoreUtm = true;
  sitemapUrl = '';

  jobs = signal<CrawlJob[]>([]);
  selectedJobId = signal<string>('');
  activeJob = signal<CrawlJob | null>(null);
  pages = signal<CrawlPage[]>([]);
  analysis = signal<CrawlAnalysis | null>(null);
  selectedPage = signal<CrawlPage | null>(null);

  starting = signal(false);
  cancelling = signal(false);
  startError = signal<string | null>(null);

  subTab = signal<SubTab>('tree');
  searchQuery = '';
  pagesFilter = '';

  private cy: cytoscape.Core | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  progressPct = computed(() => {
    const job = this.activeJob();
    if (!job) return 0;
    return Math.min(
      100,
      Math.round(
        (job.stats.pagesCrawled / Math.max(1, job.settings.maxPages)) * 100,
      ),
    );
  });

  filteredPages = computed(() => {
    const q = this.pagesFilter.trim().toLowerCase();
    const list = this.pages();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.url.toLowerCase().includes(q) ||
        (p.title || '').toLowerCase().includes(q) ||
        String(p.statusCode || '').includes(q),
    );
  });

  visibleNodeCount = computed(() => this.pages().length);

  constructor() {
    // Rebuild the tree any time a completed crawl's pages arrive
    // or the sub-tab flips back to 'tree'.
    effect(() => {
      const pages = this.pages();
      const tab = this.subTab();
      if (tab === 'tree' && pages.length > 0 && this.cyContainer) {
        this.renderTree(pages);
      }
    });
  }

  ngOnChanges() {
    if (!this.clientId) return;
    this.crawler.list(this.clientId).subscribe({
      next: (js) => {
        this.jobs.set(js);
        const running = js.find(
          (j) => j.status === 'running' || j.status === 'queued',
        );
        if (running) {
          this.selectedJobId.set(running._id);
          this.activeJob.set(running);
          this.startPolling();
        } else if (js.length > 0) {
          this.selectedJobId.set(js[0]._id);
          this.activeJob.set(js[0]);
          this.loadJobData(js[0]._id);
        }
      },
    });
  }

  ngAfterViewInit() {
    // If pages already loaded before the view initialized, render now.
    if (this.pages().length > 0 && this.subTab() === 'tree') {
      this.renderTree(this.pages());
    }
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.cy) this.cy.destroy();
  }

  startCrawl() {
    if (!this.rootUrl.trim()) return;
    this.starting.set(true);
    this.startError.set(null);
    this.crawler
      .start(this.clientId, {
        rootUrl: this.rootUrl.trim(),
        maxDepth: this.maxDepth,
        maxPages: this.maxPages,
        rateLimit: 3,
        respectRobots: this.respectRobots,
        ignoreUtm: this.ignoreUtm,
        sitemapUrl: this.sitemapUrl.trim() || undefined,
      })
      .subscribe({
        next: (job) => {
          this.starting.set(false);
          this.activeJob.set(job);
          this.selectedJobId.set(job._id);
          this.jobs.update((list) => [job, ...list]);
          this.pages.set([]);
          this.analysis.set(null);
          this.selectedPage.set(null);
          this.startPolling();
        },
        error: (err) => {
          this.starting.set(false);
          this.startError.set(
            err?.error?.message || 'Could not start the crawl.',
          );
        },
      });
  }

  cancelCrawl() {
    const job = this.activeJob();
    if (!job) return;
    this.cancelling.set(true);
    this.crawler.cancel(this.clientId, job._id).subscribe({
      next: () => {
        this.cancelling.set(false);
      },
      error: () => this.cancelling.set(false),
    });
  }

  switchJob(jobId: string) {
    this.selectedJobId.set(jobId);
    const job = this.jobs().find((j) => j._id === jobId);
    if (!job) return;
    this.activeJob.set(job);
    this.selectedPage.set(null);
    this.loadJobData(jobId);
    if (job.status === 'running' || job.status === 'queued') {
      this.startPolling();
    } else if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.pollStatus(), 2500);
  }

  private pollStatus() {
    const jobId = this.selectedJobId();
    if (!jobId) return;
    this.crawler.status(this.clientId, jobId).subscribe({
      next: (job) => {
        this.activeJob.set(job);
        this.jobs.update((list) =>
          list.map((j) => (j._id === job._id ? job : j)),
        );
        if (
          job.status === 'completed' ||
          job.status === 'interrupted' ||
          job.status === 'failed'
        ) {
          if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
          }
          this.loadJobData(job._id);
        }
      },
    });
  }

  private loadJobData(jobId: string) {
    this.crawler.pages(this.clientId, jobId).subscribe({
      next: (p) => this.pages.set(p),
    });
    this.crawler.analysis(this.clientId, jobId).subscribe({
      next: (a) => this.analysis.set(a),
    });
  }

  downloadCsv() {
    const jobId = this.selectedJobId();
    if (!jobId) return;
    this.crawler.csvBlob(this.clientId, jobId).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crawl-${jobId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }

  onSearchChange() {
    if (!this.cy) return;
    const q = this.searchQuery.trim().toLowerCase();
    this.cy.elements().removeClass('search-hit');
    if (!q) return;
    this.cy
      .nodes()
      .filter((n) => (n.data('url') || '').toLowerCase().includes(q))
      .addClass('search-hit');
  }

  focusNode(urlHash: string) {
    if (!this.cy) return;
    const n = this.cy.getElementById(urlHash);
    if (n && n.length > 0) {
      this.cy.animate({ center: { eles: n }, zoom: 1.5 }, { duration: 300 });
      n.flashClass('focused', 1500);
    }
  }

  statusClass(status?: number): string {
    if (!status) return 'bg-ink-200 text-ink-700';
    if (status >= 200 && status < 300) return 'bg-positive-100 text-positive-500';
    if (status >= 300 && status < 400) return 'bg-warning-100 text-warning-500';
    return 'bg-danger-100 text-danger-700';
  }

  shortPath(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return path.length > 60 ? path.slice(0, 57) + '…' : path;
    } catch {
      return url;
    }
  }

  /**
   * Renders the crawl result as a hierarchical Cytoscape graph.
   * Root URL is the anchor; every page's shallowest incoming link is
   * used as its parent edge to produce a clean tree without cycles.
   */
  private renderTree(pages: CrawlPage[]) {
    if (!this.cyContainer) return;
    const container = this.cyContainer.nativeElement;
    if (this.cy) {
      this.cy.destroy();
    }

    const byHash = new Map(pages.map((p) => [p.urlHash, p]));
    const nodes = pages.map((p) => ({
      data: {
        id: p.urlHash,
        label: this.shortPath(p.url),
        url: p.url,
        statusClass: this.nodeStatusClass(p),
      },
    }));

    // Edges: each non-root page connects to its shallowest incoming
    // parent so the dagre layout produces a tree, not a graph with
    // cycles. Pages with no incoming links (orphans + root) attach
    // to no parent — the layout drops them near the top.
    const edges: { data: { source: string; target: string } }[] = [];
    for (const p of pages) {
      if (p.depth === 0 || p.incomingLinks.length === 0) continue;
      const parents = p.incomingLinks
        .map((h) => byHash.get(h))
        .filter((x): x is CrawlPage => !!x);
      if (parents.length === 0) continue;
      const shallowest = parents.reduce((a, b) => (a.depth <= b.depth ? a : b));
      edges.push({
        data: { source: shallowest.urlHash, target: p.urlHash },
      });
    }

    this.cy = cytoscape({
      container,
      elements: { nodes, edges },
      wheelSensitivity: 0.2,
      layout: {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: 20,
        rankSep: 90,
        edgeSep: 10,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#94A3B8',
            label: 'data(label)',
            'font-size': 10,
            color: '#334155',
            'text-valign': 'center',
            'text-halign': 'right',
            'text-margin-x': 6,
            width: 10,
            height: 10,
          },
        },
        {
          selector: 'node.ok',
          style: { 'background-color': '#10B981' },
        },
        {
          selector: 'node.redirect',
          style: { 'background-color': '#F59E0B' },
        },
        {
          selector: 'node.broken',
          style: { 'background-color': '#EF4444' },
        },
        {
          selector: 'node.noindex',
          style: { 'background-color': '#9CA3AF' },
        },
        {
          selector: 'node.search-hit',
          style: {
            'border-width': 3,
            'border-color': '#E5613D',
          },
        },
        {
          selector: 'node.focused',
          style: {
            'border-width': 4,
            'border-color': '#E5613D',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#CBD5E1',
            'curve-style': 'bezier',
          },
        },
      ],
    });

    // Apply status classes AFTER init so the selector above works.
    for (const p of pages) {
      this.cy.getElementById(p.urlHash).addClass(this.nodeStatusClass(p));
    }

    this.cy.on('tap', 'node', (evt) => {
      const id = evt.target.id();
      const p = byHash.get(id);
      if (p) this.selectedPage.set(p);
    });
  }

  private nodeStatusClass(p: CrawlPage): string {
    if (p.robotsMeta && /noindex/i.test(p.robotsMeta)) return 'noindex';
    if (!p.statusCode || p.statusCode === 0) return 'broken';
    if (p.statusCode >= 400) return 'broken';
    if (p.redirectChain && p.redirectChain.length > 0) return 'redirect';
    if (p.statusCode >= 200 && p.statusCode < 300) return 'ok';
    return 'redirect';
  }
}
