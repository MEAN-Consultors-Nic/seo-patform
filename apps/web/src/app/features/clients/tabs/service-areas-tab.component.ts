import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, Input, OnChanges, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, ServiceArea } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { GoogleIntegrationsService } from '../../../core/google-integrations.service';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch {
    return url.replace(/\/$/, '').toLowerCase();
  }
}

@Component({
  selector: 'app-client-service-areas-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="space-y-4">
      <div class="card">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-ink-900">Service Areas</h2>
            <p class="text-xs text-ink-500 mt-0.5 max-w-2xl">
              Track every city this client serves. Link each area to its
              dedicated landing page so we can pull live Search Console
              metrics per city (clicks, impressions, CTR, position).
            </p>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <select class="input input-sm" [ngModel]="preset()" (ngModelChange)="setPreset($event)">
              <option value="last7">Last 7 days</option>
              <option value="last28">Last 28 days</option>
              <option value="last90">Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
            @if (preset() === 'custom') {
              <input type="date" class="input input-sm" [(ngModel)]="from" />
              <input type="date" class="input input-sm" [(ngModel)]="to" />
            }
            <button class="btn-primary text-xs"
                    (click)="refreshMetrics()"
                    [disabled]="refreshing() || pagedAreas().length === 0">
              {{ refreshing() ? 'Refreshing…' : '⚡ Refresh metrics' }}
            </button>
          </div>
        </div>
        @if (refreshError()) {
          <div class="mt-3 text-xs text-danger-500">{{ refreshError() }}</div>
        }
        @if (refreshSummary(); as s) {
          <div class="mt-3 text-xs text-positive-500">
            ✓ Refreshed {{ s.matched }} of {{ s.total }} areas with data from
            {{ s.from }} → {{ s.to }}.
          </div>
        }
      </div>

      <!-- New area -->
      <div class="card">
        <h3 class="text-sm font-semibold text-ink-900 mb-3">+ Add service area</h3>
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newArea.name" placeholder="Area name (e.g. Downtown LA)" />
          <input class="input" [(ngModel)]="newArea.city" placeholder="City" />
          <input class="input" [(ngModel)]="newArea.region" placeholder="State / region" />
          <input class="input" [(ngModel)]="newArea.country" placeholder="Country (US, MX...)" />
          <input class="input" [(ngModel)]="newArea.postalCode" placeholder="ZIP / postal" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          <input class="input" [(ngModel)]="newArea.landingPageUrl"
                 placeholder="Landing page URL (e.g. https://site.com/services/los-angeles)" />
          <input class="input" [(ngModel)]="newArea.googleMapsUrl"
                 placeholder="Google Maps link (e.g. https://maps.google.com/...)" />
          <input class="input md:col-span-2" [(ngModel)]="newArea.primaryKeyword"
                 placeholder="Primary keyword for this area" />
        </div>
        <textarea class="input mt-2" rows="2" [(ngModel)]="newArea.notes"
                  placeholder="Notes (optional)"></textarea>
        @if (addError()) {
          <div class="mt-2 text-xs text-danger-500">{{ addError() }}</div>
        }
        <button class="btn-primary mt-3" (click)="addArea()" [disabled]="saving() || !newArea.name?.trim()">
          {{ saving() ? 'Saving…' : 'Add area' }}
        </button>
      </div>

      <!-- Areas list -->
      @if (pagedAreas().length === 0) {
        <div class="card text-center py-10 text-ink-400 italic text-sm">
          No service areas yet. Add the first one above.
        </div>
      } @else {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          @for (a of pagedAreas(); track a._key) {
            <article class="card border border-ink-200">
              @if (editingIndex() === a._key) {
                <div class="space-y-2">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input class="input" [(ngModel)]="editDraft.name" placeholder="Area name" />
                    <input class="input" [(ngModel)]="editDraft.city" placeholder="City" />
                    <input class="input" [(ngModel)]="editDraft.region" placeholder="State / region" />
                    <input class="input" [(ngModel)]="editDraft.country" placeholder="Country" />
                    <input class="input" [(ngModel)]="editDraft.postalCode" placeholder="ZIP" />
                    <input class="input" [(ngModel)]="editDraft.primaryKeyword" placeholder="Primary keyword" />
                  </div>
                  <input class="input" [(ngModel)]="editDraft.landingPageUrl" placeholder="Landing page URL" />
                  <input class="input" [(ngModel)]="editDraft.googleMapsUrl" placeholder="Google Maps link" />
                  <textarea class="input" rows="2" [(ngModel)]="editDraft.notes" placeholder="Notes"></textarea>
                  <div class="flex justify-end gap-2 mt-2">
                    <button class="btn-ghost text-xs" (click)="cancelEdit()">Cancel</button>
                    <button class="btn-primary text-xs" (click)="saveEdit(a._key)" [disabled]="saving()">
                      {{ saving() ? 'Saving…' : 'Save' }}
                    </button>
                  </div>
                </div>
              } @else {
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-semibold text-ink-900">{{ a.name }}</h3>
                      @if (a.country) {
                        <span class="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">
                          {{ a.country }}
                        </span>
                      }
                    </div>
                    <div class="text-xs text-ink-500 mt-0.5">
                      {{ areaLocationLabel(a) }}
                      @if (a.primaryKeyword) {
                        <span class="text-ink-300">·</span>
                        <span class="text-ink-600">
                          🎯 <em class="text-ink-700">{{ a.primaryKeyword }}</em>
                        </span>
                      }
                    </div>
                    <div class="flex flex-wrap items-center gap-3 mt-1">
                      @if (a.landingPageUrl) {
                        <a [href]="a.landingPageUrl" target="_blank"
                           class="text-xs text-brand-500 hover:underline truncate inline-flex items-center gap-1 max-w-[200px]"
                           [title]="a.landingPageUrl">
                          🔗 {{ shortUrl(a.landingPageUrl) }}
                        </a>
                      } @else {
                        <span class="text-[11px] text-warning-500">
                          ⚠ No landing page configured — can't pull metrics
                        </span>
                      }
                      @if (a.googleMapsUrl) {
                        <a [href]="a.googleMapsUrl" target="_blank"
                           class="text-xs text-sky-600 hover:underline inline-flex items-center gap-1"
                           [title]="a.googleMapsUrl">
                          📍 Google Maps
                        </a>
                      }
                    </div>
                    @if (a.notes) {
                      <p class="text-xs text-ink-500 mt-1 italic">{{ a.notes }}</p>
                    }
                  </div>
                  <div class="flex flex-col items-end gap-1 flex-shrink-0">
                    <button class="text-xs font-semibold text-brand-500 hover:text-brand-600"
                            (click)="startEdit(a._key, a)">
                      Edit
                    </button>
                    <button class="text-xs font-semibold text-danger-500 hover:text-danger-600"
                            (click)="removeArea(a._key)">
                      Remove
                    </button>
                  </div>
                </div>

                @if (a.metrics) {
                  <div class="mt-3 pt-3 border-t border-ink-100 grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Clicks</div>
                      <div class="font-bold text-ink-900">{{ a.metrics.clicks | number }}</div>
                    </div>
                    <div>
                      <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Impressions</div>
                      <div class="font-bold text-ink-900">{{ a.metrics.impressions | number }}</div>
                    </div>
                    <div>
                      <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">CTR</div>
                      <div class="font-bold text-ink-900">{{ a.metrics.ctr | number: '1.1-2' }}%</div>
                    </div>
                    <div>
                      <div class="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Avg position</div>
                      <div class="font-bold text-ink-900" [ngClass]="positionClass(a.metrics.position)">
                        {{ a.metrics.position | number: '1.1-1' }}
                      </div>
                    </div>
                    <div class="col-span-4 text-[10px] text-ink-400 mt-1">
                      Range {{ a.metrics.rangeFrom }} → {{ a.metrics.rangeTo }}
                      · refreshed {{ a.metrics.refreshedAt | date: 'shortDate' }}
                    </div>
                  </div>
                } @else if (a.landingPageUrl) {
                  <div class="mt-3 pt-3 border-t border-ink-100 text-[11px] text-ink-400">
                    Click "Refresh metrics" above to pull from GSC.
                  </div>
                }
              }
            </article>
          }
        </div>
      }
    </div>
  `,
})
export class ClientServiceAreasTab implements OnInit, OnChanges {
  @Input({ required: true }) client!: Client;

  private clientsSvc = inject(ClientsService);
  private google = inject(GoogleIntegrationsService);

  areas = signal<Array<ServiceArea & { _key: string }>>([]);
  preset = signal<'last7' | 'last28' | 'last90' | 'custom'>('last28');
  from = daysAgoIso(28);
  to = todayIso();
  refreshing = signal(false);
  refreshError = signal<string | null>(null);
  refreshSummary = signal<{ matched: number; total: number; from: string; to: string } | null>(null);
  saving = signal(false);
  addError = signal<string | null>(null);

  newArea: Partial<ServiceArea> = {
    name: '',
    city: '',
    region: '',
    country: '',
    postalCode: '',
    landingPageUrl: '',
    googleMapsUrl: '',
    primaryKeyword: '',
    notes: '',
  };

  editingIndex = signal<string | null>(null);
  editDraft: Partial<ServiceArea> = {};

  pagedAreas = () => this.areas();

  ngOnInit() {
    this.hydrate();
  }

  ngOnChanges() {
    this.hydrate();
  }

  private hydrate() {
    const list = (this.client?.serviceAreas || []).map((a, i) => ({
      ...a,
      _key: `${i}-${a.name}`,
    }));
    this.areas.set(list);
  }

  setPreset(preset: 'last7' | 'last28' | 'last90' | 'custom') {
    this.preset.set(preset);
    if (preset === 'last7') {
      this.from = daysAgoIso(7);
      this.to = todayIso();
    } else if (preset === 'last28') {
      this.from = daysAgoIso(28);
      this.to = todayIso();
    } else if (preset === 'last90') {
      this.from = daysAgoIso(90);
      this.to = todayIso();
    }
  }

  // --- CRUD ---------------------------------------------------------------

  addArea() {
    const name = (this.newArea.name || '').trim();
    if (!name) {
      this.addError.set('Area name is required.');
      return;
    }
    this.addError.set(null);
    const next: ServiceArea = {
      name,
      city: this.newArea.city?.trim() || undefined,
      region: this.newArea.region?.trim() || undefined,
      country: this.newArea.country?.trim()?.toUpperCase() || undefined,
      postalCode: this.newArea.postalCode?.trim() || undefined,
      landingPageUrl: this.newArea.landingPageUrl?.trim() || undefined,
      googleMapsUrl: this.newArea.googleMapsUrl?.trim() || undefined,
      primaryKeyword: this.newArea.primaryKeyword?.trim() || undefined,
      notes: this.newArea.notes?.trim() || undefined,
    };
    const next_list = this.stripKey([...this.areas(), { ...next, _key: '' }]);
    this.persist(next_list, () => {
      this.newArea = {
        name: '',
        city: '',
        region: '',
        country: '',
        postalCode: '',
        landingPageUrl: '',
        primaryKeyword: '',
        notes: '',
      };
    });
  }

  startEdit(key: string, a: ServiceArea) {
    this.editingIndex.set(key);
    this.editDraft = { ...a };
  }

  cancelEdit() {
    this.editingIndex.set(null);
    this.editDraft = {};
  }

  saveEdit(key: string) {
    const updated = this.areas().map((a) =>
      a._key === key
        ? {
            ...a,
            name: this.editDraft.name?.trim() || a.name,
            city: this.editDraft.city?.trim() || undefined,
            region: this.editDraft.region?.trim() || undefined,
            country: this.editDraft.country?.trim()?.toUpperCase() || undefined,
            postalCode: this.editDraft.postalCode?.trim() || undefined,
            landingPageUrl: this.editDraft.landingPageUrl?.trim() || undefined,
            googleMapsUrl: this.editDraft.googleMapsUrl?.trim() || undefined,
            primaryKeyword: this.editDraft.primaryKeyword?.trim() || undefined,
            notes: this.editDraft.notes?.trim() || undefined,
          }
        : a,
    );
    this.persist(this.stripKey(updated), () => {
      this.editingIndex.set(null);
      this.editDraft = {};
    });
  }

  removeArea(key: string) {
    if (!confirm('Remove this service area? Its metrics will be lost too.')) return;
    const next = this.areas().filter((a) => a._key !== key);
    this.persist(this.stripKey(next));
  }

  private stripKey(list: Array<ServiceArea & { _key: string }>): ServiceArea[] {
    return list.map(({ _key, ...rest }) => rest);
  }

  private persist(next: ServiceArea[], onDone?: () => void) {
    if (!this.client._id) return;
    this.saving.set(true);
    this.clientsSvc.update(this.client._id, { serviceAreas: next }).subscribe({
      next: (c) => {
        this.client = c;
        this.hydrate();
        this.saving.set(false);
        onDone?.();
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.addError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save service areas.',
        );
      },
    });
  }

  // --- Metrics refresh ----------------------------------------------------

  refreshMetrics() {
    if (!this.client._id) return;
    if (!this.from || !this.to) {
      this.refreshError.set('Pick a from and to date.');
      return;
    }
    const areas = this.areas();
    if (areas.length === 0) return;
    this.refreshing.set(true);
    this.refreshError.set(null);
    this.refreshSummary.set(null);
    this.google.gscBreakdown(this.client._id, this.from, this.to).subscribe({
      next: (b) => {
        const byUrl = new Map<string, { clicks: number; impressions: number; ctr: number; position: number }>();
        for (const row of b.topPages) {
          byUrl.set(normalizeUrl(row.key), {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          });
        }
        const now = new Date();
        let matched = 0;
        const updated = areas.map((a) => {
          if (!a.landingPageUrl) return a;
          const m = byUrl.get(normalizeUrl(a.landingPageUrl));
          if (!m) return a;
          matched++;
          return {
            ...a,
            metrics: {
              clicks: Math.round(m.clicks),
              impressions: Math.round(m.impressions),
              ctr: Number(m.ctr.toFixed(2)),
              position: Number(m.position.toFixed(1)),
              rangeFrom: this.from,
              rangeTo: this.to,
              refreshedAt: now,
            },
          };
        });
        this.persist(this.stripKey(updated), () => {
          this.refreshSummary.set({
            matched,
            total: areas.filter((a) => a.landingPageUrl).length,
            from: this.from,
            to: this.to,
          });
        });
        this.refreshing.set(false);
      },
      error: (err) => {
        this.refreshing.set(false);
        const msg = err?.error?.message;
        this.refreshError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not refresh metrics.',
        );
      },
    });
  }

  // --- Helpers ------------------------------------------------------------

  areaLocationLabel(a: ServiceArea): string {
    const parts = [a.city, a.region, a.postalCode].filter(Boolean);
    return parts.length ? parts.join(' · ') : '—';
  }

  shortUrl(url: string): string {
    try {
      const u = new URL(url);
      return (u.pathname === '/' ? u.hostname : u.pathname) || url;
    } catch {
      return url;
    }
  }

  positionClass(pos?: number): string {
    if (!pos) return '';
    if (pos <= 3) return 'text-positive-500';
    if (pos <= 10) return 'text-sky-600';
    if (pos <= 20) return 'text-warning-500';
    return 'text-ink-700';
  }
}
