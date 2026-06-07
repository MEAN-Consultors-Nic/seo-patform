import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GoogleConnectionStatus } from '@seo/shared';
import { GoogleIntegrationsService } from '../../core/google-integrations.service';

@Component({
  selector: 'app-integrations-settings',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  template: `
    <div class="page-container max-w-3xl">
      <a routerLink="/settings/working-hours" class="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
        ← Back to working hours
      </a>

      <header class="page-header mt-3">
        <div>
          <h1 class="page-title">Integrations</h1>
          <p class="page-subtitle">
            Connect Google Search Console and Google Analytics to auto-fill report KPIs.
          </p>
        </div>
      </header>

      @if (justConnected()) {
        <div class="card mb-4 border-l-4 border-positive-500 bg-positive-100/30">
          <div class="text-sm font-semibold text-positive-500">
            ✓ Google Search Console connected.
          </div>
          <p class="text-xs text-ink-600 mt-1">
            The platform can now pull search analytics for any client whose GSC
            site URL is configured.
          </p>
        </div>
      }
      @if (errorMsg()) {
        <div class="card mb-4 border-l-4 border-danger-500 bg-danger-100/30 text-sm text-danger-500">
          {{ errorMsg() }}
        </div>
      }

      @if (status(); as s) {
        <!-- Google Search Console -->
        <div class="card mb-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-md bg-sky-50 border border-sky-200 flex items-center justify-center text-lg">🔎</div>
              <div>
                <h2 class="text-base font-semibold text-ink-900">Google Search Console</h2>
                <p class="text-xs text-ink-500 mt-0.5 max-w-md">
                  Used to pull impressions, clicks, CTR and average position for each client's
                  verified site. Connect once with the account that has access to all your
                  client GSC properties.
                </p>
              </div>
            </div>
            @if (s.gsc.connected) {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-positive-100 text-positive-500">
                ● Connected
              </span>
            } @else {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-ink-100 text-ink-500">
                ○ Disconnected
              </span>
            }
          </div>

          <div class="mt-4 pt-4 border-t border-ink-100 flex items-center justify-between">
            <div>
              @if (s.gsc.connected) {
                <div class="text-xs text-ink-700">
                  Authorized as <strong class="text-ink-900">{{ s.gsc.email || '(unknown)' }}</strong>
                </div>
                @if (s.gsc.connectedAt) {
                  <div class="text-[10px] text-ink-400 mt-0.5">
                    Connected {{ s.gsc.connectedAt | date: 'medium' }}
                  </div>
                }
              } @else {
                <div class="text-xs text-ink-500">
                  Not connected yet.
                </div>
              }
            </div>
            <div class="flex gap-2">
              @if (s.gsc.connected) {
                <button class="btn-secondary" (click)="connect()" [disabled]="working()">
                  Reconnect
                </button>
                <button class="btn-ghost text-danger-500" (click)="disconnect()" [disabled]="working()">
                  Disconnect
                </button>
              } @else {
                <button class="btn-primary" (click)="connect()" [disabled]="working()">
                  {{ working() ? 'Opening…' : 'Connect Google account' }}
                </button>
              }
            </div>
          </div>
        </div>

        <!-- Google Analytics -->
        <div class="card mb-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-md bg-warning-100 border border-warning-500/30 flex items-center justify-center text-lg">📊</div>
              <div>
                <h2 class="text-base font-semibold text-ink-900">Google Analytics 4</h2>
                <p class="text-xs text-ink-500 mt-0.5 max-w-md">
                  Pulls organic sessions and conversions for each client.
                  Uses a service account — each client must grant <em>Viewer</em>
                  access in GA4 Admin → Property Access Management.
                </p>
              </div>
            </div>
            @if (s.ga4.configured) {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-positive-100 text-positive-500">
                ● Configured
              </span>
            } @else {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-danger-100 text-danger-500">
                ⚠ Not configured
              </span>
            }
          </div>

          @if (s.ga4.serviceAccountEmail) {
            <div class="mt-4 pt-4 border-t border-ink-100">
              <div class="text-xs text-ink-500 mb-1">
                Add this email as a <strong>Viewer</strong> in GA4 for every client:
              </div>
              <div class="flex items-center gap-2">
                <code class="flex-1 bg-ink-100 rounded px-3 py-2 text-xs font-mono text-ink-900 truncate">
                  {{ s.ga4.serviceAccountEmail }}
                </code>
                <button class="btn-secondary"
                        (click)="copyEmail(s.ga4.serviceAccountEmail)">
                  {{ copied() ? '✓ Copied' : 'Copy' }}
                </button>
              </div>
            </div>
          } @else {
            <div class="mt-4 pt-4 border-t border-ink-100 text-xs text-warning-500">
              GOOGLE_APPLICATION_CREDENTIALS_JSON is not set on the API.
              Configure it in Heroku.
            </div>
          }
        </div>

        <!-- Next steps -->
        <div class="card">
          <h2 class="text-sm font-semibold text-ink-900 mb-2">Next steps</h2>
          <ol class="text-xs text-ink-600 space-y-1.5 list-decimal pl-5">
            <li>Connect Google Search Console above (one time).</li>
            <li>Share the GA4 service account email with each client and ask them to grant Viewer access.</li>
            <li>For each client, set the <strong>GA4 Property ID</strong> and <strong>GSC site URL</strong> in
              <a routerLink="/clients" class="text-brand-500 hover:underline">Clients → Integrations tab</a>.</li>
            <li>Open a report and use <strong>"Pull KPIs from Google"</strong> to fill the metrics automatically.</li>
          </ol>
        </div>
      } @else if (loading()) {
        <div class="card text-center py-10 text-ink-400 italic text-sm">Loading…</div>
      }
    </div>
  `,
})
export class IntegrationsSettingsComponent implements OnInit {
  private svc = inject(GoogleIntegrationsService);
  private route = inject(ActivatedRoute);

  status = signal<GoogleConnectionStatus | null>(null);
  loading = signal(true);
  working = signal(false);
  copied = signal(false);
  justConnected = signal(false);
  errorMsg = signal<string | null>(null);

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('google_connected') === '1') {
      this.justConnected.set(true);
      setTimeout(() => this.justConnected.set(false), 5000);
    }
    const err = params.get('google_error');
    if (err) {
      this.errorMsg.set(`Google returned an error: ${err}`);
    }
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.svc.status().subscribe({
      next: (s) => {
        this.status.set(s);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMsg.set(err?.error?.message || 'Could not load status.');
        this.loading.set(false);
      },
    });
  }

  connect() {
    this.working.set(true);
    this.errorMsg.set(null);
    this.svc.authUrl('/settings/integrations').subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: (err) => {
        this.working.set(false);
        this.errorMsg.set(err?.error?.message || 'Could not start OAuth.');
      },
    });
  }

  disconnect() {
    if (!confirm('Disconnect Google Search Console? Reports will no longer be able to pull GSC data.')) return;
    this.working.set(true);
    this.svc.disconnect().subscribe({
      next: () => {
        this.working.set(false);
        this.refresh();
      },
      error: () => {
        this.working.set(false);
      },
    });
  }

  copyEmail(email?: string) {
    if (!email) return;
    navigator.clipboard?.writeText(email).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
