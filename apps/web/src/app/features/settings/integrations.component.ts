import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { GoogleConnectionStatus } from '@seo/shared';
import { GoogleIntegrationsService } from '../../core/google-integrations.service';

@Component({
  selector: 'app-integrations-settings',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, DatePipe],
  template: `
    <div class="page-container max-w-3xl">
      <header class="page-header">
        <div>
          <h1 class="page-title">Settings</h1>
        </div>
      </header>

      <nav class="tab-bar mb-6">
        <div class="tab-bar-scroll flex-1 min-w-0">
          <a routerLink="/settings/working-hours" routerLinkActive="tab-active" class="tab">
            Working hours
          </a>
          <a routerLink="/settings/integrations" routerLinkActive="tab-active" class="tab">
            My Integrations
          </a>
          <a routerLink="/settings/report-layout" routerLinkActive="tab-active" class="tab">
            Report layout
          </a>
          <a routerLink="/settings/packages" routerLinkActive="tab-active" class="tab">
            Packages
          </a>
          <a routerLink="/settings/onboarding" routerLinkActive="tab-active" class="tab">
            Onboarding
          </a>
          <a routerLink="/settings/activity-log" routerLinkActive="tab-active" class="tab">Activity Log</a>
        </div>
      </nav>

      <div class="mb-4">
        <h2 class="text-xl font-bold text-ink-900">My Integrations</h2>
        <p class="text-sm text-ink-500 max-w-2xl">
          Each user connects their own Google account. When the platform
          pulls Search Console, Analytics, or Business Profile data for a
          client, it authenticates as the strategist assigned to that
          client — so you only need to grant access once to see the
          properties you already manage.
        </p>
      </div>

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
                  Used to pull impressions, clicks, CTR, and average position for each client's
                  verified site. Connect with your Google account — the platform will use it
                  for every client where you are the assigned strategist.
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
                  Pulls organic sessions and conversions for each client. Uses
                  the same OAuth connection as Search Console — make sure your
                  Google account has Viewer access on each client's GA4
                  property.
                </p>
              </div>
            </div>
            @if (s.ga4.connected) {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-positive-100 text-positive-500">
                ● Connected
              </span>
            } @else {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-ink-100 text-ink-500">
                ○ Disconnected
              </span>
            }
          </div>

          <div class="mt-4 pt-4 border-t border-ink-100 text-xs">
            @if (s.ga4.connected) {
              <div class="text-ink-700">
                Using <strong class="text-ink-900">{{ s.ga4.email || '(unknown)' }}</strong>
                via the Google Search Console connection.
              </div>
              <div class="text-ink-500 mt-1">
                For each client property, add this user as a <strong>Viewer</strong> in
                GA4 Admin → Property access management.
              </div>
            } @else {
              <div class="text-ink-500">
                Connect Google Search Console above. Both APIs share the same
                OAuth credentials, so a single connect enables GA4 too.
              </div>
            }
          </div>
        </div>

        <!-- Google Business Profile -->
        <div class="card mb-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-md bg-positive-100 border border-positive-500/30 flex items-center justify-center text-lg">📍</div>
              <div>
                <h2 class="text-base font-semibold text-ink-900">Google Business Profile</h2>
                <p class="text-xs text-ink-500 mt-0.5 max-w-md">
                  Pulls searches, calls, directions, website clicks, and
                  reviews for clients with a local presence. Uses the same
                  OAuth connection as Search Console.
                </p>
              </div>
            </div>
            @if (s.gbp?.connected) {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-positive-100 text-positive-500">
                ● Connected
              </span>
            } @else if (s.gbp?.needsReconnect) {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-warning-100 text-warning-500">
                ⟳ Needs reconnect
              </span>
            } @else {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-ink-100 text-ink-500">
                ○ Disconnected
              </span>
            }
          </div>

          <div class="mt-4 pt-4 border-t border-ink-100 text-xs space-y-2">
            @if (s.gbp?.connected) {
              <div class="text-ink-700">
                Using <strong class="text-ink-900">{{ s.gbp?.email || '(unknown)' }}</strong>
                via the Google Search Console connection.
              </div>
              <div class="text-ink-500">
                Configure the <strong>GBP account</strong> and <strong>location</strong>
                per client in the client's Integrations tab.
              </div>
            } @else if (s.gbp?.needsReconnect) {
              <div class="text-warning-500">
                ⚠ Your existing Google token doesn't include the GBP scope.
                Click <strong>Reconnect</strong> above to grant access — Google
                will reuse the same account.
              </div>
            } @else {
              <div class="text-ink-500">
                Connect Google Search Console above. The same OAuth grants
                GBP access too.
              </div>
            }
            <div class="rounded-md bg-warning-100/60 border border-warning-500/30 px-3 py-2 text-[11px] text-ink-700">
              ⚠ <strong>Important:</strong> Google requires a one-time API
              access approval before GBP queries return data. In your Cloud
              Console, enable the
              <em>Business Profile Performance API</em>,
              <em>My Business Account Management API</em>, and
              <em>My Business Business Information API</em>, then submit the
              <a href="https://support.google.com/business/contact/api_default"
                 target="_blank" rel="noopener"
                 class="text-brand-500 underline">Application for Basic API Access</a>.
              Until approved, quota is 0 QPM and calls return 403.
            </div>
          </div>
        </div>

        <!-- Next steps -->
        <div class="card">
          <h2 class="text-sm font-semibold text-ink-900 mb-2">Next steps</h2>
          <ol class="text-xs text-ink-600 space-y-1.5 list-decimal pl-5">
            <li>Connect Google above (one time — enables both GSC and GA4).</li>
            <li>For each client, make sure your Google account has access to their GSC site and GA4 property as a Viewer.</li>
            <li>Set the <strong>GA4 Property ID</strong> and <strong>GSC site URL</strong> per client in
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

}
