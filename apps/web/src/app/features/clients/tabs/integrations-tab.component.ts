import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Client, GbpAccount, GbpLocation } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import {
  GoogleConnectionTest,
  GoogleIntegrationsService,
} from '../../../core/google-integrations.service';

@Component({
  selector: 'app-client-integrations-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="card max-w-2xl space-y-4">
      <div>
        <h2 class="text-base font-semibold text-ink-900">Google integrations</h2>
        <p class="text-xs text-ink-500 mt-0.5">
          Configure how this client connects to Google Search Console and
          Google Analytics so we can pull KPIs automatically.
          <a routerLink="/profile/integrations"
             class="text-brand-500 hover:underline">Manage connection.</a>
        </p>
      </div>

      <div>
        <label class="label">GSC site URL</label>
        <input class="input" [(ngModel)]="form.gscSiteUrl"
               placeholder="sc-domain:americanstoragepr.com or https://americanstoragepr.com/" />
        <p class="text-[11px] text-ink-400 mt-1">
          Use the exact value shown in Search Console. Domain properties look
          like <code>sc-domain:example.com</code>; URL prefix properties
          include the protocol.
        </p>
      </div>

      <div>
        <label class="label">GA4 Property ID</label>
        <input class="input" [(ngModel)]="form.ga4PropertyId"
               placeholder="123456789" />
        <p class="text-[11px] text-ink-400 mt-1">
          A numeric ID, found in GA4 Admin → Property settings.
        </p>
      </div>

      <div>
        <label class="label">Google Doc (working notes)</label>
        <input class="input"
               [ngModel]="docUrlInput()"
               (ngModelChange)="onDocUrlChange($event)"
               placeholder="https://docs.google.com/document/d/.../edit" />
        <p class="text-[11px] text-ink-400 mt-1">
          Paste the full URL of the working doc for this client. Completed
          tasks get appended to the doc's monthly tab automatically. The
          connected Google account must have edit access.
          @if (form.googleDocId) {
            <span class="text-positive-500 ml-1">✓ Linked (id {{ form.googleDocId.slice(0, 8) }}…)</span>
          }
        </p>
      </div>

      <div>
        <label class="label">Google Sheet (read-only, optional)</label>
        <input class="input"
               [ngModel]="sheetUrlInput()"
               (ngModelChange)="onSheetUrlChange($event)"
               placeholder="https://docs.google.com/spreadsheets/d/.../edit" />
        <p class="text-[11px] text-ink-400 mt-1">
          Reserved for an upcoming read integration. Pasting now grants the
          OAuth scope so the future feature works without a reconnect.
          @if (form.googleSheetId) {
            <span class="text-positive-500 ml-1">✓ Saved (id {{ form.googleSheetId.slice(0, 8) }}…)</span>
          }
        </p>
      </div>

      @if (client.isEcommerce) {
        <div>
          <label class="label">Google Merchant Center ID</label>
          <input class="input" [(ngModel)]="form.merchantCenterId"
                 placeholder="123456789" />
          <p class="text-[11px] text-ink-400 mt-1">
            Numeric account ID — find it in
            <a href="https://merchants.google.com" target="_blank" rel="noopener"
               class="text-brand-500 hover:underline">Merchant Center</a>
            top-right (next to the account name).
          </p>
        </div>
      }

      <!-- Google Business Profile -->
      <div class="border-t border-ink-100 pt-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-ink-900">📍 Google Business Profile</h3>
          <button class="btn-secondary text-xs"
                  type="button"
                  (click)="loadGbpAccounts()"
                  [disabled]="loadingGbpAccounts()">
            {{ loadingGbpAccounts() ? 'Loading…' : (gbpAccounts().length ? '⟳ Refresh accounts' : '⚡ Load accounts') }}
          </button>
        </div>

        @if (gbpError()) {
          <div class="text-xs text-danger-500">{{ gbpError() }}</div>
        }

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="label">GBP account</label>
            <select class="input"
                    [ngModel]="form.gbpAccountName"
                    (ngModelChange)="onGbpAccountChange($event)"
                    [disabled]="gbpAccounts().length === 0">
              <option value="">— Select account —</option>
              @for (a of gbpAccounts(); track a.name) {
                <option [value]="a.name">
                  {{ a.accountName || a.name }}
                </option>
              }
            </select>
            <p class="text-[11px] text-ink-400 mt-1">
              The agency or business account that owns this client's listing.
            </p>
          </div>
          <div>
            <label class="label">GBP location</label>
            <select class="input"
                    [(ngModel)]="form.gbpLocationName"
                    [disabled]="!form.gbpAccountName || loadingGbpLocations()">
              <option value="">
                @if (loadingGbpLocations()) { — Loading locations… }
                @else if (!form.gbpAccountName) { — Pick an account first — }
                @else { — Select location — }
              </option>
              @for (l of gbpLocations(); track l.name) {
                <option [value]="l.name">
                  {{ l.title || l.name }}
                  @if (l.storefrontAddress?.locality) {
                    · {{ l.storefrontAddress?.locality }}
                  }
                </option>
              }
            </select>
            <p class="text-[11px] text-ink-400 mt-1">
              The specific store/office tracked for this client.
            </p>
          </div>
        </div>
      </div>

      @if (saved()) {
        <div class="text-xs text-positive-500">✓ Saved</div>
      }
      @if (error()) {
        <div class="text-xs text-danger-500">{{ error() }}</div>
      }

      <div class="flex justify-between items-center pt-3 border-t border-ink-100">
        <button class="btn-ghost" (click)="test()" [disabled]="testing() || !canTest()">
          {{ testing() ? 'Testing…' : 'Test connections' }}
        </button>
        <button class="btn-primary" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </div>

      @if (testResult(); as r) {
        <div class="border-t border-ink-100 pt-4 space-y-2">
          <div class="text-xs uppercase tracking-wider font-semibold text-ink-500">Connection test</div>
          <div class="flex items-start gap-2">
            <span [class]="r.gsc.ok ? 'text-positive-500' : 'text-danger-500'">
              {{ r.gsc.ok ? '✓' : '✗' }}
            </span>
            <div>
              <div class="text-sm text-ink-900 font-medium">GSC</div>
              <div class="text-xs text-ink-500">{{ r.gsc.message || (r.gsc.ok ? 'OK' : 'Failed') }}</div>
            </div>
          </div>
          <div class="flex items-start gap-2">
            <span [class]="r.ga4.ok ? 'text-positive-500' : 'text-danger-500'">
              {{ r.ga4.ok ? '✓' : '✗' }}
            </span>
            <div>
              <div class="text-sm text-ink-900 font-medium">GA4</div>
              <div class="text-xs text-ink-500">{{ r.ga4.message || (r.ga4.ok ? 'OK' : 'Failed') }}</div>
            </div>
          </div>
          @if (r.merchantCenter) {
            <div class="flex items-start gap-2">
              <span [class]="r.merchantCenter.ok ? 'text-positive-500' : 'text-danger-500'">
                {{ r.merchantCenter.ok ? '✓' : '✗' }}
              </span>
              <div>
                <div class="text-sm text-ink-900 font-medium">Merchant Center</div>
                <div class="text-xs text-ink-500">
                  {{ r.merchantCenter.message || (r.merchantCenter.ok ? 'OK' : 'Failed') }}
                </div>
              </div>
            </div>
          }
          @if (r.gbp) {
            <div class="flex items-start gap-2">
              <span [class]="r.gbp.ok ? 'text-positive-500' : 'text-danger-500'">
                {{ r.gbp.ok ? '✓' : '✗' }}
              </span>
              <div>
                <div class="text-sm text-ink-900 font-medium">Google Business Profile</div>
                <div class="text-xs text-ink-500">
                  {{ r.gbp.message || (r.gbp.ok ? 'OK' : 'Failed') }}
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ClientIntegrationsTab implements OnInit {
  @Input({ required: true }) client!: Client;

  private clientsSvc = inject(ClientsService);
  private google = inject(GoogleIntegrationsService);

  form = {
    gscSiteUrl: '',
    ga4PropertyId: '',
    merchantCenterId: '',
    gbpAccountName: '',
    gbpLocationName: '',
    googleDocId: '',
    googleSheetId: '',
  };
  // Local state for the URL-shaped inputs so the user can paste / edit
  // the full URL while the backend stores only the id.
  docUrlInput = signal('');
  sheetUrlInput = signal('');
  saving = signal(false);
  saved = signal(false);
  error = signal<string | null>(null);
  testing = signal(false);
  testResult = signal<GoogleConnectionTest | null>(null);

  // GBP picker state
  gbpAccounts = signal<GbpAccount[]>([]);
  gbpLocations = signal<GbpLocation[]>([]);
  loadingGbpAccounts = signal(false);
  loadingGbpLocations = signal(false);
  gbpError = signal<string | null>(null);

  ngOnInit() {
    this.form.gscSiteUrl = this.client.gscSiteUrl || '';
    this.form.ga4PropertyId = this.client.ga4PropertyId || '';
    this.form.merchantCenterId = this.client.merchantCenterId || '';
    this.form.gbpAccountName = this.client.gbpAccountName || '';
    this.form.gbpLocationName = this.client.gbpLocationName || '';
    this.form.googleDocId = this.client.googleDocId || '';
    this.form.googleSheetId = this.client.googleSheetId || '';
    this.docUrlInput.set(
      this.form.googleDocId
        ? `https://docs.google.com/document/d/${this.form.googleDocId}/edit`
        : '',
    );
    this.sheetUrlInput.set(
      this.form.googleSheetId
        ? `https://docs.google.com/spreadsheets/d/${this.form.googleSheetId}/edit`
        : '',
    );
    // If the client already has an account configured, preload its locations
    // so the existing selection renders properly.
    if (this.form.gbpAccountName) {
      this.loadGbpLocationsForAccount(this.form.gbpAccountName);
    }
  }

  canTest(): boolean {
    return !!(
      this.form.gscSiteUrl ||
      this.form.ga4PropertyId ||
      (this.client.isEcommerce && this.form.merchantCenterId) ||
      this.form.gbpLocationName
    );
  }

  loadGbpAccounts() {
    this.loadingGbpAccounts.set(true);
    this.gbpError.set(null);
    this.google.gbpAccounts().subscribe({
      next: (accounts) => {
        this.gbpAccounts.set(accounts);
        this.loadingGbpAccounts.set(false);
      },
      error: (err) => {
        this.loadingGbpAccounts.set(false);
        const m = err?.error?.message;
        this.gbpError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not load GBP accounts',
        );
      },
    });
  }

  onGbpAccountChange(accountName: string) {
    this.form.gbpAccountName = accountName;
    this.form.gbpLocationName = '';
    this.gbpLocations.set([]);
    if (accountName) {
      this.loadGbpLocationsForAccount(accountName);
    }
  }

  private loadGbpLocationsForAccount(accountName: string) {
    this.loadingGbpLocations.set(true);
    this.gbpError.set(null);
    this.google.gbpLocations(accountName).subscribe({
      next: (locations) => {
        this.gbpLocations.set(locations);
        this.loadingGbpLocations.set(false);
      },
      error: (err) => {
        this.loadingGbpLocations.set(false);
        const m = err?.error?.message;
        this.gbpError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not load GBP locations',
        );
      },
    });
  }

  private formPatch(): Partial<Client> {
    return {
      gscSiteUrl: this.form.gscSiteUrl?.trim() || undefined,
      ga4PropertyId: this.form.ga4PropertyId?.trim() || undefined,
      merchantCenterId: this.form.merchantCenterId?.trim() || undefined,
      gbpAccountName: this.form.gbpAccountName?.trim() || undefined,
      gbpLocationName: this.form.gbpLocationName?.trim() || undefined,
      googleDocId: this.form.googleDocId?.trim() || undefined,
      googleSheetId: this.form.googleSheetId?.trim() || undefined,
    };
  }

  /**
   * Accepts either a raw id (already stripped) or a full Google Docs
   * URL and extracts the id portion. Handles both
   * /document/d/<ID>/edit and /document/d/<ID>?... patterns. Stores the
   * raw URL in docUrlInput so the user keeps seeing what they pasted.
   */
  onDocUrlChange(value: string) {
    this.docUrlInput.set(value);
    this.form.googleDocId = this.extractDocsId(value, '/document/d/');
  }

  onSheetUrlChange(value: string) {
    this.sheetUrlInput.set(value);
    this.form.googleSheetId = this.extractDocsId(value, '/spreadsheets/d/');
  }

  private extractDocsId(value: string, pathFragment: string): string {
    const v = (value || '').trim();
    if (!v) return '';
    const m = v.match(new RegExp(`${pathFragment}([a-zA-Z0-9_-]+)`));
    if (m) return m[1];
    // If the user pasted just an id, accept it verbatim provided it
    // looks plausibly like one.
    if (/^[a-zA-Z0-9_-]{20,}$/.test(v)) return v;
    return '';
  }

  save() {
    if (!this.client._id) return;
    this.saving.set(true);
    this.error.set(null);
    this.clientsSvc.update(this.client._id, this.formPatch()).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save',
        );
      },
    });
  }

  test() {
    if (!this.client._id) return;
    // Make sure we test the current form values, not stale ones
    this.testing.set(true);
    this.testResult.set(null);
    this.clientsSvc.update(this.client._id, this.formPatch()).subscribe({
      next: () => {
        this.google.testConnections(this.client._id!).subscribe({
          next: (r) => {
            this.testResult.set(r);
            this.testing.set(false);
          },
          error: (err) => {
            this.testing.set(false);
            this.error.set(err?.error?.message || 'Test failed');
          },
        });
      },
      error: () => this.testing.set(false),
    });
  }
}
