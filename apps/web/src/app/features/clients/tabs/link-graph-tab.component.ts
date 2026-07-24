import { CommonModule, DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import cytoscape from 'cytoscape';
import type { Core, ElementDefinition, LayoutOptions } from 'cytoscape';
import dagre from 'cytoscape-dagre';

// Register the dagre extension once at module load. cytoscape.use() is
// idempotent under the hood so re-imports of this component don't
// re-register.
cytoscape.use(dagre as unknown as cytoscape.Ext);
import {
  LinkGraphNode,
  LinkGraphService,
  LinkGraphSnapshotDetail,
  LinkGraphSnapshotSummary,
} from '../../../core/link-graph.service';

type LayoutKind = 'radial' | 'force' | 'hierarchical';
type ColorBy = 'depth' | 'orphan' | 'status';
type SizeBy = 'inbound' | 'outbound' | 'flat';
type SideTab = 'orphans' | 'deep' | 'hubs';

interface RowEntry {
  url: string;
  title?: string;
  depth: number;
  inboundCount: number;
  outboundCount: number;
}

const POLL_INTERVAL_MS = 3000;

@Component({
  selector: 'app-client-link-graph-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="space-y-3">
      <!-- Header: run crawl + snapshot picker + view controls -->
      <div class="card flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-ink-900">Internal link graph</h3>
          <p class="text-[11px] text-ink-500 max-w-xl">
            Crawler starts at the client's home + sitemap and follows internal
            links. Respects robots.txt with User-Agent
            <code class="bg-ink-100 px-1 rounded">MediaSpearheadCrawler/1.0</code>.
          </p>
          @if (latest(); as s) {
            <div class="text-[11px] text-ink-500 mt-1">
              Latest: {{ s.completedAt | date: 'medium' }} · {{ s.totalPages }} pages · {{ s.orphansCount }} orphans
              @if (s.capHit) {
                <span class="text-warning-500 ml-1">· page cap hit</span>
              }
            </div>
          }
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select class="input input-sm text-xs w-56"
                  [ngModel]="selectedSnapshotId()"
                  (ngModelChange)="onSnapshotChange($event)">
            @for (s of snapshots(); track s._id) {
              <option [value]="s._id">
                {{ s.completedAt || s.startedAt | date: 'MMM d, y HH:mm' }}
                @if (s.status === 'running') { · running… }
                @else if (s.status === 'failed') { · failed }
                @else { · {{ s.totalPages }}p }
              </option>
            }
          </select>
          <button class="btn-primary text-xs"
                  [disabled]="crawlPending()"
                  (click)="runCrawl()">
            {{ crawlPending() ? '⏳ Crawling…' : '🕷️ Run crawl now' }}
          </button>
        </div>
      </div>

      @if (error(); as e) {
        <div class="card border-l-4 border-danger-500 bg-danger-100/30 text-sm text-danger-500">
          {{ e }}
        </div>
      }

      @if (activeSnapshot(); as snap) {
        <!-- Crawl still running: show progress card only. -->
        @if (snap.status === 'running') {
          <div class="card border-l-4 border-sky-500 bg-sky-100/30 flex items-center gap-3 py-3">
            <svg class="animate-spin h-5 w-5 text-sky-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
              <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
            </svg>
            <div class="text-sm">
              <div class="font-semibold text-ink-900">Crawling…</div>
              <div class="text-xs text-ink-600">
                Started {{ snap.startedAt | date: 'medium' }}. Fetching pages + parsing internal links.
                Refresh polls every 3s.
              </div>
            </div>
          </div>
        } @else if (snap.status === 'failed') {
          <div class="card border-l-4 border-danger-500 bg-danger-100/30 py-3">
            <div class="text-sm font-semibold text-ink-900">Crawl failed</div>
            <div class="text-xs text-ink-600 mt-1">{{ snap.errorMessage }}</div>
          </div>
        } @else if ((snap.totalPages || 0) === 0) {
          <div class="card text-center py-10 text-sm text-ink-400 italic">
            Crawl completed but found no pages. Check the client's URL and sitemap.
          </div>
        } @else {
          <!-- Stats. Counts reflect the page-filtered set (media /
               asset / admin URLs excluded), so historical snapshots
               don't inflate the numbers with WordPress upload files.
               Original totals stay on the snapshot doc for the API
               response — we just don't surface them here. -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="stat-card">
              <span class="stat-label">Pages</span>
              <div class="stat-value">{{ filteredStats().pages }}</div>
              <div class="text-xs text-ink-500 mt-0.5">crawled</div>
            </div>
            <div class="stat-card">
              <span class="stat-label">Edges</span>
              <div class="stat-value">{{ filteredStats().edges }}</div>
              <div class="text-xs text-ink-500 mt-0.5">internal links</div>
            </div>
            <div class="stat-card">
              <span class="stat-label">Max depth</span>
              <div class="stat-value">{{ filteredStats().maxDepth }}</div>
              <div class="text-xs text-ink-500 mt-0.5">clicks from home</div>
            </div>
            <div class="stat-card">
              <span class="stat-label">Orphans</span>
              <div class="stat-value text-warning-500">{{ filteredStats().orphans }}</div>
              <div class="text-xs text-ink-500 mt-0.5">no internal inbound</div>
            </div>
          </div>

          <!-- Toolbar -->
          <div class="card flex flex-wrap items-center gap-2">
            <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider mr-1">Layout</div>
            <div class="inline-flex rounded-md border border-ink-200 p-0.5 bg-white">
              @for (l of layouts; track l.key) {
                <button type="button"
                        class="px-2.5 py-1 text-[11px] font-semibold rounded transition"
                        [class.bg-ink-900]="layout() === l.key"
                        [class.text-white]="layout() === l.key"
                        [class.text-ink-600]="layout() !== l.key"
                        (click)="setLayout(l.key)">
                  {{ l.label }}
                </button>
              }
            </div>

            <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider ml-3 mr-1">Color by</div>
            <select class="input input-sm text-xs w-28"
                    [ngModel]="colorBy()"
                    (ngModelChange)="setColorBy($event)">
              <option value="depth">Depth</option>
              <option value="orphan">Orphan</option>
              <option value="status">Status code</option>
            </select>

            <div class="text-xs font-semibold text-ink-500 uppercase tracking-wider ml-3 mr-1">Size by</div>
            <select class="input input-sm text-xs w-32"
                    [ngModel]="sizeBy()"
                    (ngModelChange)="setSizeBy($event)">
              <option value="inbound">Inbound links</option>
              <option value="outbound">Outbound links</option>
              <option value="flat">Flat</option>
            </select>

            <div class="ml-auto text-[11px] text-ink-500">
              @if (selectedNode(); as sel) {
                Selected: <span class="text-ink-900 font-semibold truncate max-w-xs inline-block align-middle">{{ shortPath(sel.url) }}</span>
              } @else {
                Click a node for details.
              }
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-4 gap-3">
            <!-- Graph canvas -->
            <div class="lg:col-span-3 card p-0 relative min-h-[640px]">
              <div #cy class="w-full h-[640px]"></div>

              <!-- Rendering overlay. Layout + init of a 500-node graph
                   can block the main thread for a few seconds — this
                   overlay gives the reader a clear signal something's
                   happening (and prevents Chrome's "page unresponsive"
                   dialog by proving the tab is still under our
                   control). -->
              @if (graphRendering()) {
                <div class="absolute inset-0 bg-white/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10 rounded-lg">
                  <svg class="animate-spin h-8 w-8 text-brand-500" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
                  </svg>
                  <div class="text-sm font-semibold text-ink-900">
                    Rendering graph…
                  </div>
                  @if (renderProgress(); as p) {
                    <div class="text-xs text-ink-600">{{ p }}</div>
                  }
                </div>
              }
            </div>

            <!-- Side panel: node detail OR aggregated tables -->
            <div class="lg:col-span-1 space-y-3">
              @if (selectedNode(); as node) {
                <div class="card">
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-ink-500">
                      Selected page
                    </h4>
                    <button type="button" class="text-ink-400 hover:text-ink-900 text-lg leading-none"
                            (click)="selectedNode.set(null)">×</button>
                  </div>
                  <div class="text-sm font-semibold text-ink-900 truncate" [title]="node.title">
                    {{ node.title || '(no title)' }}
                  </div>
                  <a [href]="node.url" target="_blank" rel="noopener"
                     class="text-[11px] text-brand-500 hover:underline break-all block mt-1">
                    {{ node.url }} ↗
                  </a>
                  <dl class="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div>
                      <dt class="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">Depth</dt>
                      <dd class="text-ink-900 font-semibold">{{ node.depth }}</dd>
                    </div>
                    <div>
                      <dt class="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">Status</dt>
                      <dd class="text-ink-900 font-semibold">{{ node.statusCode ?? '—' }}</dd>
                    </div>
                    <div>
                      <dt class="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">Inbound</dt>
                      <dd class="text-ink-900 font-semibold">{{ node.inboundCount }}</dd>
                    </div>
                    <div>
                      <dt class="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">Outbound</dt>
                      <dd class="text-ink-900 font-semibold">{{ node.outboundCount }}</dd>
                    </div>
                    @if (node.isOrphan) {
                      <div class="col-span-2">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warning-100 text-warning-500">
                          ⚠ Orphan
                        </span>
                      </div>
                    }
                    @if (node.errorMessage) {
                      <div class="col-span-2 text-[11px] text-danger-500 leading-tight">
                        {{ node.errorMessage }}
                      </div>
                    }
                  </dl>
                </div>
              }

              <!-- Aggregated tables. Always visible. -->
              <div class="card">
                <div class="inline-flex rounded-md border border-ink-200 p-0.5 bg-white mb-3">
                  @for (t of sideTabs; track t.key) {
                    <button type="button"
                            class="px-2 py-1 text-[10px] font-semibold rounded transition"
                            [class.bg-ink-900]="sideTab() === t.key"
                            [class.text-white]="sideTab() === t.key"
                            [class.text-ink-600]="sideTab() !== t.key"
                            (click)="sideTab.set(t.key)">
                      {{ t.label }} ({{ sideTabCount(t.key) }})
                    </button>
                  }
                </div>
                @if (sideRows().length === 0) {
                  <div class="text-xs text-ink-400 italic py-3 text-center">
                    Nothing to show here.
                  </div>
                } @else {
                  <ul class="space-y-1 max-h-[380px] overflow-y-auto">
                    @for (r of sideRows(); track r.url) {
                      <li>
                        <button type="button"
                                class="w-full text-left px-2 py-1.5 rounded hover:bg-ink-50 border border-transparent hover:border-ink-200 transition"
                                (click)="focusNode(r.url)">
                          <div class="text-[11px] font-semibold text-ink-900 truncate" [title]="r.title">
                            {{ r.title || shortPath(r.url) }}
                          </div>
                          <div class="text-[10px] text-ink-500 flex items-center gap-2 mt-0.5">
                            <span>d{{ r.depth }}</span>
                            <span>· in {{ r.inboundCount }}</span>
                            <span>· out {{ r.outboundCount }}</span>
                          </div>
                        </button>
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>
          </div>

          @if (snap.warnings?.length) {
            <div class="card text-xs text-warning-500 border-l-4 border-warning-500 bg-warning-100/30">
              <div class="font-semibold uppercase tracking-wider text-[10px] mb-1">Warnings</div>
              <ul class="list-disc pl-5">
                @for (w of snap.warnings.slice(0, 5); track w) {
                  <li>{{ w }}</li>
                }
                @if ((snap.warnings.length || 0) > 5) {
                  <li>… and {{ snap.warnings.length - 5 }} more.</li>
                }
              </ul>
            </div>
          }
        }
      } @else if (!loading() && snapshots().length === 0) {
        <div class="card text-center py-12 text-sm text-ink-400 italic">
          No crawls yet. Click "Run crawl now" to build the graph.
        </div>
      }
    </div>
  `,
  styles: [`
    .stat-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      padding: 0.75rem;
    }
    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
      color: #6b7280;
    }
    .stat-value {
      font-size: 1.35rem;
      font-weight: 700;
      color: #111827;
      margin-top: 0.15rem;
    }
  `],
})
export class ClientLinkGraphTab implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) clientId!: string;
  @ViewChild('cy') cyRef?: ElementRef<HTMLDivElement>;

  private svc = inject(LinkGraphService);
  private cy?: Core;
  private pollTimer?: ReturnType<typeof setInterval>;

  readonly layouts: { key: LayoutKind; label: string }[] = [
    // Tree first because it's the layout that reads like Screaming
    // Frog's default — root on the left, children fanning out to the
    // right with clearly labeled nodes. Radial is only useful when a
    // site has real multi-level depth; most client sites are 1-2
    // levels deep so radial collapses to a boring single ring.
    { key: 'hierarchical', label: 'Tree' },
    { key: 'radial', label: 'Radial' },
    { key: 'force', label: 'Force' },
  ];
  readonly sideTabs: { key: SideTab; label: string }[] = [
    { key: 'orphans', label: 'Orphans' },
    { key: 'deep', label: 'Deep (>4)' },
    { key: 'hubs', label: 'Hubs' },
  ];

  snapshots = signal<LinkGraphSnapshotSummary[]>([]);
  selectedSnapshotId = signal<string | null>(null);
  activeSnapshot = signal<LinkGraphSnapshotDetail | null>(null);
  loading = signal(false);
  crawlPending = signal(false);
  error = signal<string | null>(null);
  selectedNode = signal<LinkGraphNode | null>(null);
  /** True while Cytoscape init + layout is in flight. Drives the
   *  overlay spinner so the reader knows a render is happening. */
  graphRendering = signal(false);
  /** Optional progress string shown under the spinner. */
  renderProgress = signal<string | null>(null);

  layout = signal<LayoutKind>('hierarchical');
  colorBy = signal<ColorBy>('status');
  sizeBy = signal<SizeBy>('inbound');
  sideTab = signal<SideTab>('orphans');

  latest = computed(() =>
    this.snapshots().find((s) => s.status === 'completed'),
  );

  // Nodes that should show up in the side tables + node picker.
  // Same media/asset filter used at render time so the tables never
  // surface a /wp-content/uploads/*.webp as an "orphan page".
  private pageNodes = computed<LinkGraphNode[]>(() =>
    (this.activeSnapshot()?.nodes ?? []).filter((n) => this.isPageUrl(n.url)),
  );

  // Recomputed on the frontend so historical snapshots don't leak
  // media/asset counts into the stats cards above the graph.
  filteredStats = computed(() => {
    const snap = this.activeSnapshot();
    if (!snap) return { pages: 0, edges: 0, maxDepth: 0, orphans: 0 };
    const nodes = this.pageNodes();
    const urlSet = new Set(nodes.map((n) => n.url));
    const edges = snap.edges.filter(
      (e) => urlSet.has(e.from) && urlSet.has(e.to),
    );
    let maxDepth = 0;
    let orphans = 0;
    for (const n of nodes) {
      if (n.depth > maxDepth) maxDepth = n.depth;
      if (n.isOrphan) orphans++;
    }
    return {
      pages: nodes.length,
      edges: edges.length,
      maxDepth,
      orphans,
    };
  });

  sideRows = computed<RowEntry[]>(() => {
    const nodes = this.pageNodes();
    if (!nodes.length) return [];
    const tab = this.sideTab();
    let arr: LinkGraphNode[] = [];
    if (tab === 'orphans') {
      arr = nodes.filter((n) => n.isOrphan);
    } else if (tab === 'deep') {
      arr = nodes.filter((n) => n.depth > 4);
    } else {
      arr = [...nodes]
        .sort((a, b) => b.inboundCount - a.inboundCount)
        .slice(0, 20);
    }
    return arr.map((n) => ({
      url: n.url,
      title: n.title,
      depth: n.depth,
      inboundCount: n.inboundCount,
      outboundCount: n.outboundCount,
    }));
  });

  sideTabCount(tab: SideTab): number {
    const nodes = this.pageNodes();
    if (!nodes.length) return 0;
    if (tab === 'orphans') return nodes.filter((n) => n.isOrphan).length;
    if (tab === 'deep') return nodes.filter((n) => n.depth > 4).length;
    return Math.min(20, nodes.length);
  }

  ngOnChanges() {
    this.loadSnapshots();
  }

  ngAfterViewInit() {
    // If the tab is opened with a snapshot already selected, render.
    if (this.activeSnapshot()) this.renderGraph();
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.cy?.destroy();
  }

  loadSnapshots() {
    this.loading.set(true);
    this.svc.listSnapshots(this.clientId).subscribe({
      next: (list) => {
        this.snapshots.set(list);
        // Auto-select the most recent completed snapshot.
        const first = list.find((s) => s.status === 'completed') || list[0];
        if (first && first._id !== this.selectedSnapshotId()) {
          this.selectedSnapshotId.set(first._id);
          this.loadSnapshotDetail(first._id);
        } else {
          this.loading.set(false);
        }
        // If any snapshot is running, keep polling until done.
        if (list.some((s) => s.status === 'running')) {
          this.startPolling();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Failed to load snapshots.');
      },
    });
  }

  loadSnapshotDetail(id: string) {
    this.loading.set(true);
    this.svc.getSnapshot(this.clientId, id).subscribe({
      next: (snap) => {
        this.activeSnapshot.set(snap);
        this.loading.set(false);
        this.selectedNode.set(null);
        // Wait a tick so #cy is attached, then render.
        setTimeout(() => this.renderGraph(), 0);
        if (snap.status === 'running') this.startPolling();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Failed to load snapshot.');
      },
    });
  }

  onSnapshotChange(id: string) {
    this.selectedSnapshotId.set(id);
    this.loadSnapshotDetail(id);
  }

  runCrawl() {
    if (this.crawlPending()) return;
    this.crawlPending.set(true);
    this.error.set(null);
    this.svc.crawl(this.clientId, 500).subscribe({
      next: (snap) => {
        this.crawlPending.set(false);
        this.selectedSnapshotId.set(snap._id);
        this.loadSnapshots();
      },
      error: (err) => {
        this.crawlPending.set(false);
        this.error.set(err?.error?.message || 'Failed to start crawl.');
      },
    });
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      const id = this.selectedSnapshotId();
      if (!id) return;
      this.svc.getSnapshot(this.clientId, id).subscribe({
        next: (snap) => {
          this.activeSnapshot.set(snap);
          if (snap.status !== 'running') {
            this.stopPolling();
            this.loadSnapshots();
            setTimeout(() => this.renderGraph(), 0);
          }
        },
        error: () => {
          this.stopPolling();
        },
      });
    }, POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  setLayout(l: LayoutKind) {
    const prev = this.layout();
    this.layout.set(l);
    // Switching in or out of Tree changes the edge set (spanning
    // tree vs full) — cheaper to rebuild the graph than to swap
    // elements mid-flight. Same-layout re-toggles just rerun the
    // layout algorithm.
    if (prev === 'hierarchical' || l === 'hierarchical') {
      this.renderGraph();
    } else {
      this.applyLayout();
    }
  }

  setColorBy(v: ColorBy) {
    this.colorBy.set(v);
    this.restyle();
  }

  setSizeBy(v: SizeBy) {
    this.sizeBy.set(v);
    this.restyle();
  }

  focusNode(url: string) {
    const snap = this.activeSnapshot();
    const node = snap?.nodes?.find((n) => n.url === url);
    if (node) this.selectedNode.set(node);
    const cy = this.cy;
    if (!cy) return;
    const target = cy.$(`node[id = "${this.cssEscape(url)}"]`);
    if (target.length) {
      cy.animate({
        fit: { eles: target, padding: 80 },
        duration: 400,
      });
      target.select();
    }
  }

  private cssEscape(v: string): string {
    return v.replace(/(["\\])/g, '\\$1');
  }

  /**
   * BFS spanning tree of the crawl: each non-seed node gets exactly
   * one incoming edge, chosen so its parent has the shallowest depth
   * among nodes that link to it. Result is an N-1 edge tree that
   * dagre can lay out instantly, regardless of how densely the raw
   * graph cross-links via nav/footer boilerplate.
   */
  private spanningTreeEdges(
    snap: LinkGraphSnapshotDetail,
  ): Array<{ from: string; to: string; anchor?: string }> {
    const depthByUrl = new Map<string, number>();
    for (const n of snap.nodes) depthByUrl.set(n.url, n.depth);

    // For each target, find its best parent = the incoming edge whose
    // source has the smallest depth. Ties broken by lexicographic
    // source URL so runs are deterministic.
    const bestParent = new Map<string, { from: string; anchor?: string }>();
    for (const e of snap.edges) {
      if (e.from === e.to) continue;
      const sourceDepth = depthByUrl.get(e.from);
      const targetDepth = depthByUrl.get(e.to);
      if (sourceDepth === undefined || targetDepth === undefined) continue;
      // Only accept a parent that's strictly shallower than the target;
      // that guarantees no cycles and the seed (depth 0) roots naturally.
      if (sourceDepth >= targetDepth) continue;
      const current = bestParent.get(e.to);
      if (
        !current ||
        (depthByUrl.get(current.from) ?? Infinity) > sourceDepth ||
        ((depthByUrl.get(current.from) ?? Infinity) === sourceDepth &&
          e.from < current.from)
      ) {
        bestParent.set(e.to, { from: e.from, anchor: e.anchor });
      }
    }

    return Array.from(bestParent.entries()).map(([to, p]) => ({
      from: p.from,
      to,
      anchor: p.anchor,
    }));
  }

  shortPath(url: string): string {
    try {
      const u = new URL(url);
      return u.pathname === '/' ? u.origin : u.pathname;
    } catch {
      return url;
    }
  }

  // Mirror of the backend's isPageUrl gate. Kept in sync so historical
  // snapshots (which may have media/asset URLs baked in from before
  // the crawler filter landed) still render as a page-only graph.
  private readonly SKIP_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp',
    '.avif', '.heic', '.heif', '.tiff',
    '.mp4', '.mov', '.webm', '.mkv', '.avi', '.mp3', '.wav', '.ogg',
    '.flac', '.m4a',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip',
    '.rar', '.7z', '.tar', '.gz', '.csv',
    '.css', '.js', '.mjs', '.map', '.json', '.xml', '.txt',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
  ]);
  private readonly SKIP_PATH_PREFIXES = [
    '/wp-admin/', '/wp-login', '/wp-json/',
    '/wp-content/uploads/', '/wp-content/plugins/', '/wp-content/themes/',
    '/wp-includes/',
    '/feed/', '/rss/', '/comments/feed/',
    '/assets/', '/static/', '/cdn-cgi/',
    '/cart', '/checkouts/',
  ];

  private isPageUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      const lastDot = path.lastIndexOf('.');
      const lastSlash = path.lastIndexOf('/');
      if (lastDot > lastSlash && lastDot !== -1) {
        const ext = path.slice(lastDot);
        if (this.SKIP_EXTENSIONS.has(ext)) return false;
      }
      for (const prefix of this.SKIP_PATH_PREFIXES) {
        if (path.startsWith(prefix)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  // --- Cytoscape rendering ----------------------------------------------

  private renderGraph() {
    const snap = this.activeSnapshot();
    const container = this.cyRef?.nativeElement;
    if (!snap || !container || snap.status !== 'completed') return;
    if (this.cy) this.cy.destroy();

    // Defer the heavy init off the current change-detection tick so
    // the spinner overlay actually paints before we block on
    // cytoscape() + dagre layout. Without this the browser jumps
    // straight from the previous state into a frozen main thread and
    // Chrome pops "page unresponsive".
    this.graphRendering.set(true);
    const willRenderTree = this.layout() === 'hierarchical';
    // Use page-only counts in the overlay so the number the reader
    // sees ("Building 342 nodes…") matches what actually renders,
    // not the raw crawl count that includes media/asset URLs.
    const stats = this.filteredStats();
    const edgeCount = willRenderTree
      ? Math.max(0, stats.pages - 1)
      : stats.edges;
    this.renderProgress.set(
      `Building ${stats.pages} nodes · ${edgeCount} edges…`,
    );

    setTimeout(() => this.doRender(snap, container), 30);
  }

  private doRender(snap: LinkGraphSnapshotDetail, container: HTMLElement) {
    // Frontend media/asset filter. The backend crawler now skips these
    // at extraction time, but historical snapshots still hold nodes
    // for /wp-content/uploads/*.webp, PDFs, etc. This second pass
    // cleans them out at render time so the reader gets a page-only
    // graph without needing to recrawl.
    const pageNodes = snap.nodes.filter((n) => this.isPageUrl(n.url));
    const pageUrlSet = new Set(pageNodes.map((n) => n.url));
    const pageEdges = snap.edges.filter(
      (e) => pageUrlSet.has(e.from) && pageUrlSet.has(e.to),
    );
    const filteredSnap = {
      ...snap,
      nodes: pageNodes,
      edges: pageEdges,
    } as LinkGraphSnapshotDetail;

    // Tree layouts choke when a site's nav/footer forms an all-to-all
    // subgraph (166 pages × avg 66 outbound = ~11k edges dagre has to
    // route). For Tree mode we collapse to a BFS spanning tree — each
    // non-root node keeps a single incoming edge from its shallowest
    // neighbor — so the tree renders in ~N-1 edges instead of the raw
    // multi-thousand. Radial + Force keep the full edge set since
    // their layouts don't route per-edge.
    const isTree = this.layout() === 'hierarchical';
    const renderEdges = isTree
      ? this.spanningTreeEdges(filteredSnap)
      : filteredSnap.edges;

    const elements: ElementDefinition[] = [
      ...filteredSnap.nodes.map((n) => ({
        data: {
          id: n.url,
          // Label prefers the page title (like SF does), falls back to
          // the URL path so unlabeled pages still tell you what they
          // are.
          label: (n.title && n.title.trim()) || this.shortPath(n.url),
          depth: n.depth,
          inbound: n.inboundCount,
          outbound: n.outboundCount,
          orphan: n.isOrphan,
          statusCode: n.statusCode ?? 0,
          hasError: !!n.errorMessage,
        },
      })),
      ...renderEdges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.from,
          target: e.to,
        },
      })),
    ];

    this.cy = cytoscape({
      container,
      elements,
      minZoom: 0.05,
      maxZoom: 2,
      wheelSensitivity: 0.2,
      // Perf flags for large graphs. hideEdgesOnViewport + textureOnViewport
      // trade a bit of visual quality during pan/zoom for a big FPS win
      // on 500+ node graphs. hideLabelsOnViewport keeps labels off
      // while the user is dragging — they snap back on release.
      hideEdgesOnViewport: filteredSnap.nodes.length > 200,
      textureOnViewport: filteredSnap.nodes.length > 200,
      hideLabelsOnViewport: filteredSnap.nodes.length > 200,
      pixelRatio: 'auto',
      style: this.buildStyle() as never,
    });

    this.cy.on('tap', 'node', (evt) => {
      const url = evt.target.id() as string;
      const node = filteredSnap.nodes.find((n) => n.url === url);
      if (node) this.selectedNode.set(node);
    });

    // Yield again so cytoscape's DOM/canvas init can finish before
    // dagre kicks off its geometry pass.
    setTimeout(() => {
      this.renderProgress.set('Computing layout…');
      const layout = this.cy!.layout(this.layoutOptions());
      layout.one('layoutstop', () => {
        this.graphRendering.set(false);
        this.renderProgress.set(null);
      });
      // Failsafe: if layout doesn't emit stop within 20s (dagre on huge
      // graphs), clear the overlay anyway so the user isn't stuck.
      setTimeout(() => {
        if (this.graphRendering()) {
          this.graphRendering.set(false);
          this.renderProgress.set(null);
        }
      }, 20000);
      layout.run();
    }, 30);
  }

  private applyLayout() {
    if (!this.cy) return;
    this.graphRendering.set(true);
    this.renderProgress.set('Computing layout…');
    setTimeout(() => {
      const layout = this.cy!.layout(this.layoutOptions());
      layout.one('layoutstop', () => {
        this.graphRendering.set(false);
        this.renderProgress.set(null);
      });
      setTimeout(() => {
        if (this.graphRendering()) {
          this.graphRendering.set(false);
          this.renderProgress.set(null);
        }
      }, 20000);
      layout.run();
    }, 30);
  }

  private restyle() {
    if (!this.cy) return;
    (this.cy.style(this.buildStyle() as never) as unknown as { update: () => void }).update();
  }

  private layoutOptions(): LayoutOptions {
    const kind = this.layout();
    if (kind === 'radial') {
      // Concentric works well only when the site has real multi-level
      // depth. Reversed levelWidth so root sits at the outermost ring
      // is intentional — Cytoscape's concentric wants a "higher = more
      // central" mapping and we invert with -depth so d0 is closest to
      // center. minNodeSpacing chosen so 100+ nodes still don't
      // overlap.
      return {
        name: 'concentric',
        concentric: (ele) => -(ele.data('depth') ?? 0),
        levelWidth: () => 1,
        minNodeSpacing: 60,
        animate: true,
        animationDuration: 600,
        padding: 30,
      };
    }
    if (kind === 'hierarchical') {
      // dagre gives a proper directed acyclic layout: root on the
      // left, children fanning right, with dagre's own edge routing
      // so overlapping links don't tangle. rankSep controls the
      // horizontal breathing room between depth levels; nodeSep is
      // the vertical space between siblings.
      return {
        name: 'dagre',
        rankDir: 'LR',
        rankSep: 220,
        nodeSep: 24,
        edgeSep: 12,
        animate: true,
        animationDuration: 600,
        padding: 40,
        fit: true,
      } as unknown as LayoutOptions;
    }
    return {
      name: 'cose',
      animate: true,
      animationDuration: 600,
      idealEdgeLength: 120,
      nodeRepulsion: 12000,
      gravity: 0.15,
      padding: 40,
    } as LayoutOptions;
  }

  // Cytoscape's TS types split stylesheets into several union members
  // and none of them accept the `{ selector, style }` shape all the
  // examples use cleanly. Widening to `unknown[]` bypasses the union
  // noise — the runtime shape is well-documented and stable.
  private buildStyle(): unknown[] {
    const colorBy = this.colorBy();
    const sizeBy = this.sizeBy();
    const isTree = this.layout() === 'hierarchical';

    const depthColor = (d: number): string => {
      const palette = [
        '#0F172A', '#1E40AF', '#0891B2', '#059669', '#65A30D',
        '#D97706', '#EA580C', '#DC2626', '#7C3AED', '#6B7280',
      ];
      return palette[Math.min(palette.length - 1, Math.max(0, d))];
    };
    // Screaming Frog-inspired palette. Green when the URL crawled
    // cleanly (2xx); orange for orphans; red on 4xx/5xx or crawl
    // errors so problems are impossible to miss.
    const orphanOrOkColor = (isOrphan: boolean, sc: number, hasError: boolean): string => {
      if (hasError || (sc && sc >= 400)) return '#B91C1C';
      if (isOrphan) return '#F97316';
      return '#4D8B31';
    };
    const orphanColor = (o: boolean): string => (o ? '#F97316' : '#4D8B31');
    const statusColor = (s: number, hasError: boolean): string => {
      if (hasError) return '#B91C1C';
      if (!s) return '#9CA3AF';
      if (s >= 500) return '#B91C1C';
      if (s >= 400) return '#DC2626';
      if (s >= 300) return '#EAB308';
      return '#4D8B31';
    };

    const sizeExpr = (n: { data: (k: string) => number }) => {
      if (sizeBy === 'flat') return isTree ? 18 : 24;
      const v = sizeBy === 'inbound' ? n.data('inbound') : n.data('outbound');
      const base = isTree ? 14 : 18;
      const max = isTree ? 44 : 70;
      return Math.max(base, Math.min(max, base + Math.sqrt(Math.max(0, v)) * 7));
    };

    const colorExpr = (n: {
      data: (k: string) => number | boolean | string;
    }): string => {
      const hasError = !!n.data('hasError');
      if (colorBy === 'orphan')
        return orphanOrOkColor(
          !!n.data('orphan'),
          Number(n.data('statusCode')),
          hasError,
        );
      if (colorBy === 'status')
        return statusColor(Number(n.data('statusCode')), hasError);
      return depthColor(Number(n.data('depth')));
    };

    // Two label placements: on the tree layout, put the label to the
    // right of each node like Screaming Frog does; on the other
    // layouts drop it below to avoid overlap in the concentric ring.
    const labelStyle = isTree
      ? {
          'text-valign': 'center',
          'text-halign': 'right',
          'text-margin-x': 8,
          'text-max-width': '260px',
        }
      : {
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 6,
          'text-max-width': '160px',
        };

    return [
      {
        selector: 'node',
        style: {
          'background-color': colorExpr as unknown as string,
          width: sizeExpr as unknown as number,
          height: sizeExpr as unknown as number,
          label: 'data(label)',
          'font-size': isTree ? 11 : 10,
          'font-family': 'Inter, system-ui, sans-serif',
          'font-weight': 500,
          color: '#111827',
          'text-outline-color': '#ffffff',
          'text-outline-width': 2,
          'text-wrap': 'ellipsis',
          'text-events': 'yes',
          'border-width': 2,
          'border-color': '#ffffff',
          ...labelStyle,
        },
      },
      {
        selector: 'node:selected',
        style: {
          'border-width': 4,
          'border-color': '#FF7A59',
          'text-outline-color': '#FFF7ED',
        },
      },
      {
        selector: 'node[?orphan]',
        style: {
          'border-color': '#FED7AA',
          'border-width': 2,
        },
      },
      {
        selector: 'edge',
        style: {
          width: 1.2,
          'line-color': '#D1D5DB',
          'curve-style': isTree ? 'bezier' : 'straight',
          'control-point-step-size': 60,
          // Arrows on every layout now — L-to-R placement alone was
          // ambiguous when the reader wanted to know which page
          // links to which. Slightly smaller in Tree so they don't
          // fight the label placement to the right of each node.
          'target-arrow-shape': 'triangle',
          'target-arrow-color': '#94A3B8',
          'arrow-scale': isTree ? 0.8 : 0.9,
          'target-endpoint': 'outside-to-node',
          opacity: 0.75,
        },
      },
      {
        selector: 'edge:selected',
        style: {
          'line-color': '#FF7A59',
          'target-arrow-color': '#FF7A59',
          width: 2,
          opacity: 1,
        },
      },
    ];
  }
}
