import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PACKAGE_COLOR_PALETTE, PackageColor, Service } from '@seo/shared';
import { ServicesCatalogService } from '../../core/services.service';

type FormMode = 'create' | 'edit' | null;

/**
 * Admin CRUD for the Service catalog. Services are the top-level
 * product lines (SEO / PPC / Website / Tracking / …) that packages
 * and client subscriptions hang off of. The five built-in defaults
 * (SEO, PPC, Website, Tracking, Other) are seeded on first boot and
 * can't be deleted — deactivate them instead.
 */
@Component({
  selector: 'app-services-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="page-container max-w-4xl">
      <header class="page-header">
        <div><h1 class="page-title">Settings</h1></div>
      </header>

      <nav class="tab-bar mb-6">
        <div class="tab-bar-scroll flex-1 min-w-0">
          <a routerLink="/settings/working-hours" routerLinkActive="tab-active" class="tab">Working hours</a>
          <a routerLink="/settings/services" routerLinkActive="tab-active" class="tab">Services</a>
          <a routerLink="/settings/packages" routerLinkActive="tab-active" class="tab">Packages</a>
          <a routerLink="/settings/report-layout" routerLinkActive="tab-active" class="tab">Report layout</a>
          <a routerLink="/settings/onboarding" routerLinkActive="tab-active" class="tab">Onboarding</a>
          <a routerLink="/settings/activity-log" routerLinkActive="tab-active" class="tab">Activity Log</a>
        </div>
      </nav>

      <div class="mb-4 flex items-start justify-between">
        <div>
          <h2 class="text-xl font-bold text-ink-900">Services</h2>
          <p class="text-sm text-ink-500 max-w-2xl">
            The product lines you sell (SEO, PPC, Website, Tracking…). Each Package belongs to
            exactly one service, and every client Subscription pairs a service with a package.
          </p>
        </div>
        <button class="btn-primary" (click)="openCreate()">+ New service</button>
      </div>

      <div class="card-flush">
        <table class="table">
          <thead>
            <tr>
              <th class="w-14"></th>
              <th>Name</th>
              <th class="w-40">Slug</th>
              <th class="w-24">Order</th>
              <th class="w-20">Status</th>
              <th class="w-32 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (s of services(); track s._id) {
              <tr>
                <td>
                  <span class="inline-flex items-center justify-center w-9 h-9 rounded-md text-lg"
                        [class]="chipBg(s.color)">
                    {{ s.icon || '·' }}
                  </span>
                </td>
                <td>
                  <div class="font-semibold text-ink-900">{{ s.name }}</div>
                  @if (s.description) {
                    <div class="text-xs text-ink-500 mt-0.5">{{ s.description }}</div>
                  }
                </td>
                <td class="text-xs font-mono text-ink-500">{{ s.slug }}</td>
                <td class="text-xs text-ink-500">{{ s.order }}</td>
                <td>
                  @if (s.active) {
                    <span class="badge-success">Active</span>
                  } @else {
                    <span class="badge-neutral">Inactive</span>
                  }
                </td>
                <td class="text-right">
                  <button class="btn-ghost btn-sm" (click)="openEdit(s)">Edit</button>
                  @if (!isBuiltin(s)) {
                    <button class="btn-ghost btn-sm text-danger-500" (click)="remove(s)">Delete</button>
                  }
                </td>
              </tr>
            }
            @if (!services().length && !loading()) {
              <tr><td colspan="6" class="py-10 text-center text-ink-400 italic">No services yet.</td></tr>
            }
          </tbody>
        </table>
      </div>

      @if (mode()) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeModal()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
               (click)="$event.stopPropagation()">
            <div class="flex items-start justify-between mb-4">
              <h2 class="text-lg font-bold text-ink-900">
                {{ mode() === 'create' ? 'New service' : 'Edit service' }}
              </h2>
              <button class="text-ink-400 hover:text-ink-900 text-2xl leading-none"
                      (click)="closeModal()">×</button>
            </div>

            <div class="space-y-3">
              <div>
                <label class="label">Name</label>
                <input class="input" [(ngModel)]="form.name" placeholder="e.g. Email Marketing" />
              </div>
              <div>
                <label class="label">Slug (URL-safe)</label>
                <input class="input font-mono text-sm"
                       [(ngModel)]="form.slug"
                       [readonly]="mode() === 'edit' && isBuiltin(editing())"
                       placeholder="email-marketing" />
                <div class="text-[11px] text-ink-500 mt-1">
                  Lowercase, dashes only. Used internally + can't be changed for built-in services.
                </div>
              </div>
              <div>
                <label class="label">Description</label>
                <textarea class="input min-h-[60px]" [(ngModel)]="form.description"
                          placeholder="Optional short blurb"></textarea>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="label">Icon</label>
                  <input class="input text-center" [(ngModel)]="form.icon" placeholder="📧" />
                </div>
                <div>
                  <label class="label">Order</label>
                  <input type="number" class="input" [(ngModel)]="form.order" />
                </div>
                <div>
                  <label class="label">Color</label>
                  <select class="input" [(ngModel)]="form.color">
                    @for (c of colors; track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </div>
              </div>
              <label class="flex items-center gap-2 mt-2">
                <input type="checkbox" [(ngModel)]="form.active" />
                <span class="text-sm text-ink-700">Active (can be picked when creating packages / subscriptions)</span>
              </label>
            </div>

            @if (error()) {
              <div class="text-xs text-danger-500 mt-3">{{ error() }}</div>
            }

            <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
              <button class="btn-secondary" (click)="closeModal()" [disabled]="saving()">Cancel</button>
              <button class="btn-primary" (click)="submit()" [disabled]="saving() || !form.name || !form.slug">
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class ServicesSettingsComponent implements OnInit {
  private svc = inject(ServicesCatalogService);
  readonly colors: PackageColor[] = [
    'ink', 'sky', 'brand', 'positive', 'amber', 'purple', 'rose',
  ];
  private readonly BUILT_IN_SLUGS = ['seo', 'ppc', 'website', 'tracking', 'other'];

  services = signal<Service[]>([]);
  loading = signal(true);
  mode = signal<FormMode>(null);
  editing = signal<Service | null>(null);
  saving = signal(false);
  error = signal<string | null>(null);

  form: {
    name: string;
    slug: string;
    description: string;
    color: PackageColor;
    icon: string;
    order: number;
    active: boolean;
  } = this.blankForm();

  chipBg(color?: PackageColor): string {
    if (!color) return 'bg-ink-100 text-ink-700';
    const p = PACKAGE_COLOR_PALETTE[color];
    return `${p.bg} ${p.text}`;
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: (list) => {
        this.services.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isBuiltin(s: Service | null): boolean {
    return !!s && this.BUILT_IN_SLUGS.includes(s.slug);
  }

  openCreate() {
    this.editing.set(null);
    this.form = this.blankForm();
    this.error.set(null);
    this.mode.set('create');
  }

  openEdit(s: Service) {
    this.editing.set(s);
    this.form = {
      name: s.name,
      slug: s.slug,
      description: s.description || '',
      color: s.color,
      icon: s.icon || '',
      order: s.order,
      active: s.active,
    };
    this.error.set(null);
    this.mode.set('edit');
  }

  closeModal() {
    this.mode.set(null);
    this.editing.set(null);
    this.saving.set(false);
    this.error.set(null);
  }

  submit() {
    this.saving.set(true);
    this.error.set(null);
    const payload = {
      name: this.form.name.trim(),
      slug: this.form.slug.trim().toLowerCase(),
      description: this.form.description.trim() || undefined,
      color: this.form.color,
      icon: this.form.icon.trim() || undefined,
      order: this.form.order,
      active: this.form.active,
    };
    const done = () => {
      this.saving.set(false);
      this.closeModal();
      this.load();
    };
    const onErr = (err: unknown) => {
      this.saving.set(false);
      const msg = (err as { error?: { message?: string } })?.error?.message ?? 'Request failed';
      this.error.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
    };
    if (this.mode() === 'create') {
      this.svc.create(payload).subscribe({ next: done, error: onErr });
    } else if (this.editing()?._id) {
      this.svc.update(this.editing()!._id!, payload).subscribe({ next: done, error: onErr });
    }
  }

  remove(s: Service) {
    if (!s._id) return;
    if (!confirm(`Delete "${s.name}"? Packages assigned to this service will lose their link.`)) return;
    this.svc.remove(s._id).subscribe({
      next: () => this.load(),
      error: (err) => alert(err?.error?.message || 'Delete failed'),
    });
  }

  private blankForm() {
    return {
      name: '',
      slug: '',
      description: '',
      color: 'sky' as PackageColor,
      icon: '',
      order: 100,
      active: true,
    };
  }
}
