import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Client } from '@seo/shared';
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
          <a routerLink="/settings/integrations"
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
        </div>
      }
    </div>
  `,
})
export class ClientIntegrationsTab implements OnInit {
  @Input({ required: true }) client!: Client;

  private clientsSvc = inject(ClientsService);
  private google = inject(GoogleIntegrationsService);

  form = { gscSiteUrl: '', ga4PropertyId: '', merchantCenterId: '' };
  saving = signal(false);
  saved = signal(false);
  error = signal<string | null>(null);
  testing = signal(false);
  testResult = signal<GoogleConnectionTest | null>(null);

  ngOnInit() {
    this.form.gscSiteUrl = this.client.gscSiteUrl || '';
    this.form.ga4PropertyId = this.client.ga4PropertyId || '';
    this.form.merchantCenterId = this.client.merchantCenterId || '';
  }

  canTest(): boolean {
    return !!(
      this.form.gscSiteUrl ||
      this.form.ga4PropertyId ||
      (this.client.isEcommerce && this.form.merchantCenterId)
    );
  }

  save() {
    if (!this.client._id) return;
    this.saving.set(true);
    this.error.set(null);
    this.clientsSvc
      .update(this.client._id, {
        gscSiteUrl: this.form.gscSiteUrl?.trim() || undefined,
        ga4PropertyId: this.form.ga4PropertyId?.trim() || undefined,
        merchantCenterId: this.form.merchantCenterId?.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 3000);
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message;
          this.error.set(Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save');
        },
      });
  }

  test() {
    if (!this.client._id) return;
    // Make sure we test the current form values, not stale ones
    this.testing.set(true);
    this.testResult.set(null);
    this.clientsSvc
      .update(this.client._id, {
        gscSiteUrl: this.form.gscSiteUrl?.trim() || undefined,
        ga4PropertyId: this.form.ga4PropertyId?.trim() || undefined,
        merchantCenterId: this.form.merchantCenterId?.trim() || undefined,
      })
      .subscribe({
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
