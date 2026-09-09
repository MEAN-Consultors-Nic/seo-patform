import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Client } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';

/**
 * Dedicated edit page for a client. Lives at /clients/:id/edit so the
 * URL is share-friendly and the layout doesn't fight the shell sidebar.
 *
 * Client-level fields only. The multi-service Subscriptions tab that
 * used to live here was removed along with the Services / Packages
 * catalogs — hours and end dates are plain client fields again.
 */
@Component({
  selector: 'app-client-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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

      @if (loading()) {
        <div class="card text-center py-10 text-ink-400 italic">Loading…</div>
      } @else if (client(); as c) {
        <div class="card">
          <h2 class="text-lg font-bold text-ink-900 mb-1">General details</h2>
          <p class="text-sm text-ink-500 mb-4">
            Core client fields. Keywords, tasks, and reports live on the
            client detail page.
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
    </div>
  `,
})
export class ClientEditComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private clientsSvc = inject(ClientsService);

  client = signal<Client | null>(null);
  loading = signal(true);

  // Form state. Kept as a plain object so ngModel two-way binding
  // handles the re-render — no signal wrapper needed.
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

  private clientId = '';

  ngOnInit() {
    this.clientId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.clientId) {
      this.loading.set(false);
      return;
    }
    this.reload();
  }

  reload() {
    this.loading.set(true);
    this.clientsSvc.get(this.clientId).subscribe({
      next: (c) => {
        this.client.set(c);
        this.hydrateGenForm(c);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
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
}
