import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import cytoscape, { Core, ElementDefinition, NodeSingular } from 'cytoscape';
import {
  SchemaCrawlResult,
  SchemaNode,
  SchemaToolsService,
} from '../../core/schema-tools.service';

@Component({
  selector: 'app-schema-modeler-button',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <button type="button"
            [class]="buttonClass"
            (click)="open()"
            title="Schema Modeler — crawl the site and graph all structured data">
      🧬 {{ label }}
    </button>

    @if (modalOpen()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="close()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col"
             (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-ink-100 flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h2 class="text-lg font-bold text-ink-900 truncate">🧬 Schema Modeler</h2>
              @if (result(); as r) {
                <p class="text-xs text-ink-500 mt-0.5 truncate">
                  {{ r.domain }} · {{ r.pagesCrawled }} pages · {{ r.graph.nodes.length }} schema nodes
                </p>
              } @else if (loading()) {
                <p class="text-xs text-ink-500 mt-0.5 truncate">
                  Crawling {{ domain() }}…
                </p>
              } @else {
                <p class="text-xs text-ink-500 mt-0.5 truncate">
                  Crawl a site, extract all JSON-LD + Microdata, and visualize the schema graph.
                </p>
              }
            </div>
            <button type="button"
                    (click)="close()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-ink-100">×</button>
          </div>

          <div class="flex-1 overflow-hidden flex flex-col">
            <!-- Standalone input -->
            @if (!url && !result() && !loading()) {
              <div class="p-6">
                <form (submit)="$event.preventDefault(); submitStart()" class="space-y-2">
                  <label class="label">Site URL</label>
                  <div class="flex gap-2">
                    <input class="input flex-1"
                           [(ngModel)]="urlInput"
                           name="url"
                           placeholder="example.com or https://example.com"
                           autocomplete="off"
                           autofocus />
                    <input type="number" class="input w-24"
                           [(ngModel)]="maxPages"
                           name="maxPages"
                           min="1" max="75" step="1"
                           title="Max pages to crawl" />
                    <button type="submit"
                            class="btn-primary text-xs whitespace-nowrap"
                            [disabled]="!urlInput.trim()">
                      Run crawl →
                    </button>
                  </div>
                  <p class="text-[11px] text-ink-400">
                    BFS crawl within the same hostname. Honors robots.txt. Max
                    {{ maxPages }} pages — increase up to 75 for larger sites.
                    Server-rendered HTML only; JS-only sites may show fewer schemas.
                  </p>
                </form>
              </div>
            }

            @if (loading()) {
              <div class="p-12 text-center text-sm text-ink-500">
                <div class="inline-block animate-spin mr-2 text-xl">⏳</div>
                Crawling and extracting schema… this can take 30–60 seconds.
              </div>
            } @else if (error()) {
              <div class="m-6 rounded-md bg-danger-100 border border-danger-200 text-danger-700 text-sm px-3 py-2">
                {{ error() }}
              </div>
            } @else if (result(); as r) {
              <div class="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
                <!-- Graph canvas -->
                <div class="relative bg-ink-50 border-r border-ink-100 min-h-[400px]">
                  <div #graphHost class="absolute inset-0"></div>
                  @if (r.graph.nodes.length === 0) {
                    <div class="absolute inset-0 flex items-center justify-center text-sm text-ink-400 italic px-6 text-center">
                      No structured data found on this site. If it's a SPA, the
                      schema may only render client-side and isn't visible to
                      this server-rendered crawler.
                    </div>
                  }
                  @if (r.graph.nodes.length > 0) {
                    <div class="absolute top-2 right-2 flex gap-1 z-10">
                      <button type="button"
                              (click)="fitGraph()"
                              class="text-[11px] font-semibold px-2 py-1 rounded bg-white border border-ink-200 hover:border-ink-300">
                        Fit
                      </button>
                      <button type="button"
                              (click)="exportGraph()"
                              class="text-[11px] font-semibold px-2 py-1 rounded bg-white border border-ink-200 hover:border-ink-300"
                              title="Download as JSON">
                        ↓ JSON
                      </button>
                    </div>
                  }
                </div>

                <!-- Sidebar -->
                <aside class="overflow-y-auto bg-white px-4 py-4 text-sm">
                  <!-- Stats -->
                  <div class="grid grid-cols-2 gap-2 mb-4">
                    <div class="bg-ink-50 rounded p-2">
                      <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500">Pages</div>
                      <div class="text-lg font-bold text-ink-900">
                        {{ r.pagesWithSchema }} / {{ r.pagesCrawled }}
                      </div>
                      <div class="text-[10px] text-ink-400">with schema</div>
                    </div>
                    <div class="bg-ink-50 rounded p-2">
                      <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500">Schemas</div>
                      <div class="text-lg font-bold text-ink-900">{{ r.schemasFound }}</div>
                      <div class="text-[10px] text-ink-400">{{ r.graph.nodes.length }} nodes</div>
                    </div>
                  </div>

                  <!-- Filters -->
                  <div class="mb-4 space-y-2">
                    <div class="flex items-center justify-between">
                      <h3 class="text-[10px] uppercase tracking-wider font-bold text-ink-500">Filters</h3>
                      @if (hasActiveFilters()) {
                        <button type="button"
                                (click)="clearFilters()"
                                class="text-[10px] font-semibold text-brand-500 hover:text-brand-600">
                          Clear
                        </button>
                      }
                    </div>
                    <div class="relative">
                      <span class="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400 text-xs">⌕</span>
                      <input class="input input-sm pl-6 text-xs"
                             placeholder="Search nodes…"
                             [ngModel]="searchQuery()"
                             (ngModelChange)="setSearch($event)" />
                    </div>
                    <label class="inline-flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer select-none">
                      <input type="checkbox" class="rounded border-ink-300 text-brand-500 focus:ring-brand-500 w-3.5 h-3.5"
                             [ngModel]="hideOrphans()"
                             (ngModelChange)="setHideOrphans($event)" />
                      <span>Hide orphan nodes</span>
                    </label>
                    @if (visibleCount() < r.graph.nodes.length) {
                      <div class="text-[10px] text-ink-400">
                        Showing {{ visibleCount() }} of {{ r.graph.nodes.length }} nodes
                      </div>
                    }
                  </div>

                  <!-- Type breakdown (clickable) -->
                  <div class="flex items-center justify-between mb-1.5">
                    <h3 class="text-[10px] uppercase tracking-wider font-bold text-ink-500">
                      Types ({{ r.typeCounts.length }})
                    </h3>
                    @if (selectedTypes().size > 0) {
                      <span class="text-[10px] text-ink-400">
                        {{ selectedTypes().size }} selected
                      </span>
                    }
                  </div>
                  <ul class="space-y-0.5 mb-4 max-h-64 overflow-y-auto">
                    @for (t of r.typeCounts; track t.type) {
                      <li>
                        <button type="button"
                                (click)="toggleType(t.type)"
                                [class]="'w-full text-left flex items-center gap-2 px-1.5 py-0.5 rounded text-xs transition ' +
                                  (isTypeSelected(t.type)
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'hover:bg-ink-50 text-ink-700')">
                          <span class="w-2 h-2 rounded-full flex-shrink-0"
                                [style.background-color]="typeColor(t.type)"></span>
                          <span class="font-mono truncate flex-1">{{ t.type }}</span>
                          <span class="text-ink-400 font-semibold">{{ t.count }}</span>
                        </button>
                      </li>
                    }
                  </ul>

                  <!-- Selected node detail -->
                  @if (selectedNode(); as n) {
                    <div class="border-t border-ink-100 pt-3 mt-3">
                      <h3 class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-1">Selected</h3>
                      <div class="text-sm font-bold text-ink-900 truncate">{{ n.label }}</div>
                      <div class="text-[11px] text-ink-500 mt-0.5">
                        {{ n.types.join(' · ') }}
                      </div>
                      @if (n.schemaIdUrl) {
                        <a [href]="n.schemaIdUrl" target="_blank" rel="noopener"
                           class="text-[11px] text-sky-500 hover:underline mt-0.5 block truncate">
                          {{ n.schemaIdUrl }}
                        </a>
                      }
                      <div class="mt-2 space-y-1 max-h-48 overflow-y-auto">
                        @for (entry of selectedProperties(); track entry.key) {
                          <div class="text-[11px] flex gap-2">
                            <span class="text-ink-500 font-semibold shrink-0">{{ entry.key }}:</span>
                            <span class="text-ink-700 break-words min-w-0">{{ entry.value }}</span>
                          </div>
                        }
                      </div>
                      <div class="mt-2 text-[11px] text-ink-500">
                        Found on {{ n.pages.length }} page{{ n.pages.length === 1 ? '' : 's' }}
                      </div>
                    </div>
                  } @else if (r.graph.nodes.length > 0) {
                    <div class="border-t border-ink-100 pt-3 mt-3 text-[11px] text-ink-400 italic">
                      Click a node in the graph to inspect its properties.
                    </div>
                  }

                  @if (r.errors.length > 0) {
                    <div class="border-t border-ink-100 pt-3 mt-3 text-[11px] text-ink-400">
                      <div class="font-semibold text-ink-500 mb-1">Notes</div>
                      <ul class="list-disc pl-4 space-y-0.5">
                        @for (e of r.errors; track e) {
                          <li>{{ e }}</li>
                        }
                      </ul>
                    </div>
                  }
                </aside>
              </div>
            }
          </div>

          <div class="px-6 py-3 border-t border-ink-100 flex justify-between items-center text-xs">
            @if (result() || loading()) {
              <button type="button"
                      class="text-ink-500 hover:text-ink-900"
                      [disabled]="loading()"
                      (click)="reset()">
                {{ url ? '⟳ Re-run crawl' : '← New crawl' }}
              </button>
            } @else {
              <span></span>
            }
            <div class="flex items-center gap-3">
              @if (result(); as r) {
                <span class="text-ink-400">{{ formatDuration(r.durationMs) }}</span>
              }
              <button class="btn-secondary text-xs" (click)="close()">Close</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class SchemaModelerButtonComponent implements AfterViewChecked, OnDestroy {
  @Input() url?: string;
  @Input() label = 'Schema Modeler';
  @Input() buttonClass =
    'text-xs text-ink-500 hover:text-ink-900 hover:bg-ink-100 rounded px-1.5 py-0.5 inline-flex items-center gap-1 transition';

  @ViewChild('graphHost') graphHost?: ElementRef<HTMLDivElement>;

  private svc = inject(SchemaToolsService);

  modalOpen = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<SchemaCrawlResult | null>(null);
  selectedNode = signal<SchemaNode | null>(null);
  urlInput = '';
  maxPages = 25;
  private resolvedUrl = signal<string>('');

  // Filters
  searchQuery = signal<string>('');
  selectedTypes = signal<Set<string>>(new Set());
  hideOrphans = signal<boolean>(false);
  visibleCount = signal<number>(0);

  private cy: Core | null = null;
  private graphRendered = false;
  private typeColorMap = new Map<string, string>();
  private readonly palette = [
    '#FF7A59',
    '#0EA5E9',
    '#16A34A',
    '#D97706',
    '#7C3AED',
    '#DB2777',
    '#0F172A',
    '#0891B2',
  ];

  domain(): string {
    const raw = this.url || this.resolvedUrl();
    if (!raw) return '';
    try {
      return new URL(/^https?:/.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
    } catch {
      return raw;
    }
  }

  open() {
    this.modalOpen.set(true);
    if (this.url && !this.result()) {
      this.runCrawl(this.url);
    }
  }

  close() {
    if (this.loading()) return;
    this.modalOpen.set(false);
    this.destroyGraph();
    if (!this.url) {
      this.result.set(null);
      this.error.set(null);
      this.urlInput = '';
      this.resolvedUrl.set('');
      this.selectedNode.set(null);
    }
  }

  reset() {
    this.destroyGraph();
    this.selectedNode.set(null);
    this.searchQuery.set('');
    this.selectedTypes.set(new Set());
    this.hideOrphans.set(false);
    if (this.url) {
      this.result.set(null);
      this.runCrawl(this.url);
    } else {
      this.result.set(null);
      this.error.set(null);
      this.resolvedUrl.set('');
    }
  }

  submitStart() {
    const raw = this.urlInput.trim();
    if (!raw) return;
    this.resolvedUrl.set(raw);
    this.runCrawl(raw);
  }

  selectedProperties(): Array<{ key: string; value: string }> {
    const n = this.selectedNode();
    if (!n) return [];
    return Object.entries(n.properties)
      .map(([key, value]) => ({
        key,
        value:
          typeof value === 'string'
            ? value
            : (() => {
                try {
                  return JSON.stringify(value);
                } catch {
                  return String(value);
                }
              })(),
      }))
      .slice(0, 24);
  }

  fitGraph() {
    if (!this.cy) return;
    const visible = this.cy.nodes().filter((n) => n.style('display') !== 'none');
    if (visible.length > 0) this.cy.fit(visible, 30);
    else this.cy.fit(undefined, 30);
  }

  typeColor(type: string): string {
    if (!this.typeColorMap.has(type)) {
      this.typeColorMap.set(
        type,
        this.palette[this.typeColorMap.size % this.palette.length],
      );
    }
    return this.typeColorMap.get(type)!;
  }

  toggleType(type: string) {
    const next = new Set(this.selectedTypes());
    if (next.has(type)) next.delete(type);
    else next.add(type);
    this.selectedTypes.set(next);
    this.applyFilters();
  }

  isTypeSelected(type: string): boolean {
    return this.selectedTypes().has(type);
  }

  setSearch(value: string) {
    this.searchQuery.set(value);
    this.applyFilters();
  }

  setHideOrphans(value: boolean) {
    this.hideOrphans.set(value);
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return (
      this.selectedTypes().size > 0 ||
      this.searchQuery().trim().length > 0 ||
      this.hideOrphans()
    );
  }

  clearFilters() {
    this.selectedTypes.set(new Set());
    this.searchQuery.set('');
    this.hideOrphans.set(false);
    this.applyFilters();
  }

  private applyFilters() {
    if (!this.cy) return;
    const types = this.selectedTypes();
    const q = this.searchQuery().trim().toLowerCase();
    const hideOrphans = this.hideOrphans();
    const r = this.result();
    if (!r) return;

    const nodeMatchesType = (node: NodeSingular): boolean => {
      if (types.size === 0) return true;
      const t = node.data('type') as string;
      return types.has(t);
    };
    const nodeMatchesQuery = (node: NodeSingular): boolean => {
      if (!q) return true;
      const label = String(node.data('label') || '').toLowerCase();
      const t = String(node.data('type') || '').toLowerCase();
      return label.includes(q) || t.includes(q);
    };

    let shown = 0;
    this.cy.batch(() => {
      this.cy!.nodes().forEach((node) => {
        let visible = nodeMatchesType(node) && nodeMatchesQuery(node);
        if (visible && hideOrphans) {
          if (node.connectedEdges().length === 0) visible = false;
        }
        node.style('display', visible ? 'element' : 'none');
        if (visible) shown++;
      });
      // Hide edges whose endpoints are hidden
      this.cy!.edges().forEach((edge) => {
        const sourceVisible = edge.source().style('display') !== 'none';
        const targetVisible = edge.target().style('display') !== 'none';
        edge.style('display', sourceVisible && targetVisible ? 'element' : 'none');
      });
    });
    this.visibleCount.set(shown);
  }

  exportGraph() {
    const r = this.result();
    if (!r) return;
    const blob = new Blob([JSON.stringify(r, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.domain}-schema.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  private runCrawl(url: string) {
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.selectedNode.set(null);
    this.graphRendered = false;
    this.svc.crawl(url, this.maxPages).subscribe({
      next: (r) => {
        this.result.set(r);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not crawl this site.',
        );
      },
    });
  }

  ngAfterViewChecked() {
    if (this.result() && this.graphHost && !this.graphRendered) {
      this.graphRendered = true;
      // Defer to next tick so the container has its final size
      setTimeout(() => this.renderGraph(), 0);
    }
  }

  ngOnDestroy() {
    this.destroyGraph();
  }

  private renderGraph() {
    const r = this.result();
    const host = this.graphHost?.nativeElement;
    if (!r || !host || r.graph.nodes.length === 0) return;

    // Reset color map so it's deterministic per-render and matches sidebar
    this.typeColorMap = new Map<string, string>();
    // Pre-seed in type-count order so the most common types get the first palette colors
    for (const t of r.typeCounts) this.typeColor(t.type);

    const elements: ElementDefinition[] = [
      ...r.graph.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          type: n.types[0] || 'Thing',
          color: this.typeColor(n.types[0] || 'Thing'),
        },
      })),
      ...r.graph.edges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.from,
          target: e.to,
          label: e.label,
        },
      })),
    ];

    this.cy = cytoscape({
      container: host,
      elements,
      wheelSensitivity: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#0F172A',
            'font-size': 10,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-wrap': 'ellipsis',
            'text-max-width': '120px',
            width: 28,
            height: 28,
            'border-width': 2,
            'border-color': '#fff',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#FF7A59',
            'border-width': 3,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.2,
            'line-color': '#CBD5E1',
            'target-arrow-color': '#CBD5E1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 8,
            color: '#64748B',
            'text-rotation': 'autorotate',
            'text-background-color': '#F8FAFC',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeRepulsion: () => 6000,
        idealEdgeLength: () => 90,
        edgeElasticity: () => 80,
      },
    });

    this.cy.on('tap', 'node', (evt) => {
      const id = evt.target.id();
      const node = r.graph.nodes.find((n) => n.id === id) || null;
      this.selectedNode.set(node);
    });
    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy) this.selectedNode.set(null);
    });

    this.visibleCount.set(r.graph.nodes.length);
    this.applyFilters();
  }

  private destroyGraph() {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
    this.graphRendered = false;
  }
}
