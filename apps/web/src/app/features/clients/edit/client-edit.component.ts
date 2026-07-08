import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import {
  Client,
  ClientSubscription,
  PACKAGE_COLOR_PALETTE,
  Package,
  PackageColor,
  Service,
} from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { PackagesService } from '../../../core/packages.service';
import { ServicesCatalogService } from '../../../core/services.service';

type TabKey = 'general' | 'subscriptions';

interface SubscriptionRow extends ClientSubscription {
  serviceDoc?: Service;
  packageDoc?: Package;
}

/**
 * Dedicated edit page for a client. Lives at /clients/:id/edit so the
 * URL is share-friendly and the layout doesn't fight the shell sidebar.
 *
 * Tabs:
 *   - General: legacy fields (name, url, hours, etc.) — for now this
 *     bounces back into the client detail's existing edit modal
 *     because the form is huge and rebuilding it here inline would
 *     duplicate ~500 lines. Follow-up extracts that form so General
 *     works standalone.
 *   - Subscriptions: the new multi-service flow. Add / edit / delete
 *     one row per Service the agency delivers to this client, each
 *     with its own Package + hours + dates. Package options are
 *     filtered by the picked Service so the operator can't pair
 *     mismatched combinations.
 */
@Component({
  selector: 'app-client-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe],
  template: `
    <div class="page-container max-w-5xl">
      <header class="page-header">
        <div>
          @if (client(); as c) {
            <a [routerLink]="['/clients', c._id]" class="text-xs text-ink-500 hover:text-ink-900 flex items-center gap-1 mb-1">
              ← Back to {{ c.name }}
            </a>
          }
          <h1 class="page-title">Edit client</h1>
        </div>
      </header>

      <nav class="tab-bar mb-6">
        <div class="tab-bar-scroll flex-1 min-w-0">
          <button type="button" class="tab" [class.tab-active]="tab() === 'general'"
                  (click)="tab.set('general')">General</button>
          <button type="button" class="tab" [class.tab-active]="tab() === 'subscriptions'"
                  (click)="tab.set('subscriptions')">
            Subscriptions
            <span class="ml-1 text-[10px] font-bold text-ink-500 bg-ink-100 rounded-full px-1.5 py-0.5">
              {{ (client()?.subscriptions?.length) || 0 }}
            </span>
          </button>
        </div>
      </nav>

      @if (loading()) {
        <div class="card text-center py-10 text-ink-400 italic">Loading…</div>
      } @else if (client(); as c) {
        @switch (tab()) {
          @case ('general') {
            <div class="card">
              <h2 class="text-lg font-bold text-ink-900 mb-1">General details</h2>
              <p class="text-sm text-ink-500 mb-4">
                Client-level fields only. Package, hours, and end dates
                are per-service — manage them in the Subscriptions tab.
              </p>

              <div class="space-y-3">
                <div>
                  <label class="label">Client name</label>
                  <input class="input" [(ngModel)]="genForm.name" placeholder="Company name" />
                </div>
                <div>
                  <label class="label">Status</label>
                  <select class="input" [(ngModel)]="genForm.active">
                    <option [ngValue]="true">Active</option>
                    <option [ngValue]="false">Inactive</option>
                  </select>
                </div>
                <div>
                  <label class="label">URL</label>
                  <input class="input" [(ngModel)]="genForm.url" placeholder="https://example.com" />
                </div>
                <div>
                  <label class="label">Calendar aliases</label>
                  <input class="input"
                         [ngModel]="calendarAliasesText()"
                         (ngModelChange)="setCalendarAliases($event)"
                         placeholder="MB Global Logistics, Buck Waste" />
                  <p class="text-[11px] text-ink-500 mt-1">
                    Comma-separated alt names for the Calendar sync to match.
                  </p>
                </div>
                <div>
                  <label class="label">Logo (URL)</label>
                  <input class="input" [(ngModel)]="genForm.logoUrl" placeholder="https://..." />
                  @if (genForm.logoUrl) {
                    <div class="mt-2 flex items-center gap-2">
                      <img [src]="genForm.logoUrl"
                           class="max-h-16 max-w-[160px] object-contain border border-ink-200 rounded p-1 bg-white"
                           alt="preview" />
                    </div>
                  }
                </div>
                <div>
                  <label class="label">Industry</label>
                  <input class="input" [(ngModel)]="genForm.industry" placeholder="e.g. Storage, Logistics" />
                </div>
                <div>
                  <label class="label">Website platform</label>
                  <select class="input" [(ngModel)]="genForm.websitePlatform">
                    <option value="">— Unspecified —</option>
                    <option value="shopify">🛍️ Shopify</option>
                    <option value="wordpress">📝 WordPress</option>
                    <option value="custom">⚙️ Custom / Other</option>
                  </select>
                  <p class="text-[11px] text-ink-400 mt-1">
                    Enables the platform-specific tab (Shopify or WordPress) with page
                    browsing and bulk meta tag updates.
                  </p>
                </div>
                <label class="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer select-none pt-1">
                  <input type="checkbox" [(ngModel)]="genForm.isEcommerce" />
                  <span>🛒 <strong>Ecommerce client</strong></span>
                  <span class="text-xs text-ink-400">— enables the Ecommerce performance tab</span>
                </label>
              </div>

              @if (genError()) {
                <div class="text-xs text-danger-500 mt-3">{{ genError() }}</div>
              }
              @if (genSaved()) {
                <div class="text-xs text-positive-500 mt-3">✓ Saved</div>
              }

              <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
                <a [routerLink]="['/clients', c._id]" class="btn-secondary">Cancel</a>
                <button class="btn-primary" (click)="saveGeneral()" [disabled]="genSaving()">
                  {{ genSaving() ? 'Saving…' : 'Save changes' }}
                </button>
              </div>
            </div>
          }
          @case ('subscriptions') {
            <div class="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 class="text-lg font-bold text-ink-900">Subscriptions</h2>
                <p class="text-sm text-ink-500 max-w-2xl">
                  One row per service the client is subscribed to. Each has its own
                  Package and hours — so you can bill SEO on Package A while running
                  PPC on Gold and Website on Package 3.
                </p>
              </div>
              <button class="btn-primary" (click)="openAdd()"
                      [disabled]="availableServices().length === 0">
                + Add subscription
              </button>
            </div>

            @if (rows().length === 0) {
              <div class="card text-center py-10 text-ink-400 italic">
                No subscriptions yet. Add one to start tracking work for a service.
              </div>
            } @else {
              <div class="card-flush">
                <table class="table">
                  <thead>
                    <tr>
                      <th class="w-40">Service</th>
                      <th>Package</th>
                      <th class="w-24">Hours / cycle</th>
                      <th class="w-32">Ends</th>
                      <th class="w-20">Status</th>
                      <th class="w-32 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of rows(); track r._id) {
                      <tr>
                        <td>
                          <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded"
                                [class]="serviceChip(r.serviceDoc?.color)">
                            <span>{{ r.serviceDoc?.icon || '·' }}</span>
                            <span class="font-semibold">{{ r.serviceDoc?.name || 'Unknown' }}</span>
                          </span>
                        </td>
                        <td>
                          @if (r.packageDoc) {
                            <div class="text-sm font-semibold text-ink-900">
                              {{ r.packageDoc.name }}
                            </div>
                            <div class="text-[11px] text-ink-500">
                              {{ r.packageDoc.hoursPerPeriod || 0 }} h · package default
                            </div>
                          } @else {
                            <span class="text-xs italic text-ink-400">No package</span>
                          }
                        </td>
                        <td class="text-sm text-ink-900">{{ r.hoursPerCycle ?? '—' }}</td>
                        <td class="text-xs text-ink-500">
                          {{ r.endingDate ? (r.endingDate | date: 'mediumDate') : 'Open-ended' }}
                        </td>
                        <td>
                          @if (r.active) {
                            <span class="badge-success">Active</span>
                          } @else {
                            <span class="badge-neutral">Paused</span>
                          }
                        </td>
                        <td class="text-right">
                          <button class="btn-ghost btn-sm" (click)="openEdit(r)">Edit</button>
                          <button class="btn-ghost btn-sm text-danger-500" (click)="remove(r)">Delete</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        }
      }

      @if (subModal()) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeSubModal()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-lg p-6"
               (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between mb-4">
              <h2 class="text-lg font-bold text-ink-900">
                {{ subForm.editingId ? 'Edit subscription' : 'Add subscription' }}
              </h2>
              <button class="text-ink-400 hover:text-ink-900 text-2xl leading-none"
                      (click)="closeSubModal()">×</button>
            </div>

            <div class="space-y-3">
              <div>
                <label class="label">Service</label>
                <select class="input" [(ngModel)]="subForm.serviceId"
                        [disabled]="!!subForm.editingId"
                        (ngModelChange)="onServiceChange()">
                  <option value="">— Select a service —</option>
                  @for (s of pickerServices(); track s._id) {
                    <option [value]="s._id">{{ s.icon }} {{ s.name }}</option>
                  }
                </select>
                @if (subForm.editingId) {
                  <div class="text-[11px] text-ink-500 mt-1">
                    Service can't be changed after add. Delete + re-add to switch.
                  </div>
                }
              </div>

              <div>
                <label class="label">Package</label>
                <select class="input" [(ngModel)]="subForm.packageId">
                  <option value="">— No package —</option>
                  @for (p of pickerPackages(); track p._id) {
                    <option [value]="p._id">{{ p.name }}</option>
                  }
                </select>
                <div class="text-[11px] text-ink-500 mt-1">
                  Only packages tied to the picked service show up here.
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Hours / cycle</label>
                  <input type="number" class="input" min="0" step="0.5"
                         [(ngModel)]="subForm.hoursPerCycle"
                         placeholder="package default" />
                </div>
                <div>
                  <label class="label">Ends</label>
                  <input type="date" class="input" [(ngModel)]="subForm.endingDate" />
                </div>
              </div>

              <label class="flex items-center gap-2">
                <input type="checkbox" [(ngModel)]="subForm.active" />
                <span class="text-sm text-ink-700">Active</span>
              </label>

              <div>
                <label class="label">Notes</label>
                <textarea class="input min-h-[60px]" [(ngModel)]="subForm.notes"
                          placeholder="Optional context — special billing, custom scope, …"></textarea>
              </div>
            </div>

            @if (subError()) {
              <div class="text-xs text-danger-500 mt-3">{{ subError() }}</div>
            }

            <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
              <button class="btn-secondary" (click)="closeSubModal()" [disabled]="subSaving()">Cancel</button>
              <button class="btn-primary" (click)="submitSub()"
                      [disabled]="subSaving() || !subForm.serviceId">
                {{ subSaving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ClientEditComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private clientsSvc = inject(ClientsService);
  private packagesSvc = inject(PackagesService);
  private servicesSvc = inject(ServicesCatalogService);

  client = signal<Client | null>(null);
  services = signal<Service[]>([]);
  packages = signal<Package[]>([]);
  loading = signal(true);
  tab = signal<TabKey>('subscriptions');

  // General-tab form state. Kept as a plain object so ngModel two-way
  // binding handles the re-render — no signal wrapper needed.
  genForm: {
    name: string;
    url: string;
    logoUrl: string;
    industry: string;
    active: boolean;
    isEcommerce: boolean;
    websitePlatform: '' | 'shopify' | 'wordpress' | 'custom';
    calendarAliases: string[];
  } = {
    name: '',
    url: '',
    logoUrl: '',
    industry: '',
    active: true,
    isEcommerce: false,
    websitePlatform: '',
    calendarAliases: [],
  };
  genSaving = signal(false);
  genError = signal<string | null>(null);
  genSaved = signal(false);

  subModal = signal(false);
  subSaving = signal(false);
  subError = signal<string | null>(null);
  subForm: {
    editingId?: string;
    serviceId: string;
    packageId: string;
    hoursPerCycle?: number;
    endingDate: string;
    active: boolean;
    notes: string;
  } = this.blankSubForm();

  private clientId = '';

  rows = computed<SubscriptionRow[]>(() => {
    const c = this.client();
    if (!c?.subscriptions) return [];
    const svcMap = new Map(this.services().map((s) => [s._id, s]));
    const pkgMap = new Map(this.packages().map((p) => [p._id, p]));
    return c.subscriptions.map((s) => {
      const svcId = typeof s.serviceId === 'object' ? (s.serviceId as { _id: string })._id : s.serviceId;
      const pkgId = typeof s.packageId === 'object'
        ? (s.packageId as { _id: string })._id
        : s.packageId;
      return {
        ...s,
        serviceDoc: svcMap.get(svcId as string),
        packageDoc: pkgId ? pkgMap.get(pkgId as string) : undefined,
      };
    });
  });

  availableServices = computed<Service[]>(() => {
    const used = new Set(
      (this.client()?.subscriptions ?? []).map((s) => {
        const id = typeof s.serviceId === 'object' ? (s.serviceId as { _id: string })._id : s.serviceId;
        return id as string;
      }),
    );
    return this.services().filter((s) => s.active && !used.has(s._id!));
  });

  pickerServices = computed<Service[]>(() => {
    // When editing, allow the currently-picked service to stay in the
    // list even though it's "used" — otherwise the select clears.
    if (this.subForm.editingId) {
      return this.services().filter((s) => s.active);
    }
    return this.availableServices();
  });

  pickerPackages = computed<Package[]>(() => {
    const svcId = this.subForm.serviceId;
    if (!svcId) return [];
    return this.packages().filter((p) => {
      const pkgSvcId = typeof p.serviceId === 'object'
        ? (p.serviceId as { _id: string })._id
        : p.serviceId;
      return pkgSvcId === svcId;
    });
  });

  ngOnInit() {
    this.clientId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.clientId) {
      this.loading.set(false);
      return;
    }
    // Deep-link support: ?tab=subscriptions from the client detail
    // header lands the user on the Subscriptions tab. Anything else
    // falls back to General.
    const requestedTab = this.route.snapshot.queryParamMap.get('tab');
    if (requestedTab === 'subscriptions') {
      this.tab.set('subscriptions');
    } else {
      this.tab.set('general');
    }
    this.reload();
  }

  reload() {
    this.loading.set(true);
    Promise.all([
      new Promise<Client>((resolve, reject) =>
        this.clientsSvc.get(this.clientId).subscribe({ next: resolve, error: reject }),
      ),
      new Promise<Service[]>((resolve) =>
        this.servicesSvc.list().subscribe({ next: resolve, error: () => resolve([]) }),
      ),
      new Promise<Package[]>((resolve) =>
        this.packagesSvc.list().subscribe({ next: resolve, error: () => resolve([]) }),
      ),
    ]).then(
      ([c, s, p]) => {
        this.client.set(c);
        this.services.set(s);
        this.packages.set(p);
        this.hydrateGenForm(c);
        this.loading.set(false);
      },
      () => this.loading.set(false),
    );
  }

  private hydrateGenForm(c: Client) {
    this.genForm = {
      name: c.name,
      url: c.url,
      logoUrl: c.logoUrl || '',
      industry: c.industry || '',
      active: c.active ?? true,
      isEcommerce: !!c.isEcommerce,
      websitePlatform: (c.websitePlatform as '' | 'shopify' | 'wordpress' | 'custom') || '',
      calendarAliases: (c.calendarAliases ?? []).slice(),
    };
  }

  calendarAliasesText(): string {
    return (this.genForm.calendarAliases || []).join(', ');
  }

  setCalendarAliases(raw: string) {
    this.genForm.calendarAliases = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  saveGeneral() {
    const name = this.genForm.name?.trim();
    if (!name) {
      this.genError.set('Client name is required.');
      return;
    }
    this.genError.set(null);
    this.genSaved.set(false);
    this.genSaving.set(true);
    const patch: Partial<Client> = {
      name,
      url: this.genForm.url?.trim(),
      logoUrl: this.genForm.logoUrl?.trim() || undefined,
      industry: this.genForm.industry?.trim() || undefined,
      active: !!this.genForm.active,
      isEcommerce: !!this.genForm.isEcommerce,
      websitePlatform: this.genForm.websitePlatform || undefined,
      calendarAliases: this.genForm.calendarAliases.filter((a) => a.trim()),
    };
    this.clientsSvc.update(this.clientId, patch).subscribe({
      next: (updated) => {
        this.client.set(updated);
        this.hydrateGenForm(updated);
        this.genSaving.set(false);
        this.genSaved.set(true);
        setTimeout(() => this.genSaved.set(false), 1500);
      },
      error: (err) => {
        this.genSaving.set(false);
        const msg = err?.error?.message;
        this.genError.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save.',
        );
      },
    });
  }

  serviceChip(color?: PackageColor): string {
    if (!color) return 'bg-ink-100 text-ink-700';
    const p = PACKAGE_COLOR_PALETTE[color];
    return `${p.bg} ${p.text}`;
  }

  openAdd() {
    this.subForm = this.blankSubForm();
    this.subError.set(null);
    this.subModal.set(true);
  }

  openEdit(r: SubscriptionRow) {
    const svcId = typeof r.serviceId === 'object'
      ? (r.serviceId as { _id: string })._id
      : (r.serviceId as string);
    const pkgId = typeof r.packageId === 'object'
      ? (r.packageId as { _id: string })._id
      : ((r.packageId as string) || '');
    const end = r.endingDate ? new Date(r.endingDate).toISOString().slice(0, 10) : '';
    this.subForm = {
      editingId: r._id,
      serviceId: svcId,
      packageId: pkgId,
      hoursPerCycle: r.hoursPerCycle,
      endingDate: end,
      active: r.active,
      notes: r.notes || '',
    };
    this.subError.set(null);
    this.subModal.set(true);
  }

  closeSubModal() {
    if (this.subSaving()) return;
    this.subModal.set(false);
  }

  onServiceChange() {
    // Clear the picked package when switching service so mismatches
    // aren't possible.
    this.subForm.packageId = '';
  }

  submitSub() {
    this.subError.set(null);
    if (!this.subForm.serviceId) {
      this.subError.set('Pick a service.');
      return;
    }
    this.subSaving.set(true);
    const payload = {
      serviceId: this.subForm.serviceId,
      packageId: this.subForm.packageId || undefined,
      hoursPerCycle:
        this.subForm.hoursPerCycle === undefined || this.subForm.hoursPerCycle === null
          ? undefined
          : Number(this.subForm.hoursPerCycle),
      endingDate: this.subForm.endingDate || undefined,
      active: this.subForm.active,
      notes: this.subForm.notes?.trim() || undefined,
    };
    const done = () => {
      this.subSaving.set(false);
      this.subModal.set(false);
      this.reload();
    };
    const onErr = (err: unknown) => {
      this.subSaving.set(false);
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Request failed';
      this.subError.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
    };
    if (this.subForm.editingId) {
      this.clientsSvc
        .updateSubscription(this.clientId, this.subForm.editingId, payload)
        .subscribe({ next: done, error: onErr });
    } else {
      this.clientsSvc
        .addSubscription(this.clientId, payload)
        .subscribe({ next: done, error: onErr });
    }
  }

  remove(r: SubscriptionRow) {
    if (!r._id) return;
    if (!confirm(`Remove the ${r.serviceDoc?.name || 'this'} subscription? Historical data stays.`)) return;
    this.clientsSvc.removeSubscription(this.clientId, r._id).subscribe({
      next: () => this.reload(),
      error: (err) => alert(err?.error?.message || 'Failed to remove'),
    });
  }

  private blankSubForm() {
    return {
      editingId: undefined as string | undefined,
      serviceId: '',
      packageId: '',
      hoursPerCycle: undefined as number | undefined,
      endingDate: '',
      active: true,
      notes: '',
    };
  }
}
