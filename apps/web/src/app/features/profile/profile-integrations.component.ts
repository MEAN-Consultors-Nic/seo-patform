import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { GoogleConnectionStatus } from '@seo/shared';
import { AuthService } from '../../core/auth.service';
import { GoogleIntegrationsService } from '../../core/google-integrations.service';
import {
  SpearConnectionResult,
  SpearService,
} from '../../core/spear.service';

/**
 * Personal integrations page. Lives under /profile/* because each user
 * connects their own Google account — nothing here is platform-wide.
 * The tab bar is scoped to Profile so future personal-only pages
 * (password, notifications, API keys) can slot in beside Integrations.
 */
@Component({
  selector: 'app-profile-integrations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe],
  template: `
    <div class="page-container max-w-3xl">
      <header class="page-header">
        <div>
          <div class="text-[10px] font-semibold text-ink-400 uppercase tracking-wider">
            {{ userName() }}
          </div>
          <h1 class="page-title">My Profile</h1>
        </div>
      </header>

      <nav class="tab-bar mb-6">
        <div class="tab-bar-scroll flex-1 min-w-0">
          <a routerLink="/profile/integrations" routerLinkActive="tab-active" class="tab">
            Integrations
          </a>
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

        <!-- Google Ads -->
        <div class="card mb-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-md bg-warning-100 border border-warning-500/30 flex items-center justify-center text-lg">📣</div>
              <div>
                <h2 class="text-base font-semibold text-ink-900">Google Ads</h2>
                <p class="text-xs text-ink-500 mt-0.5 max-w-md">
                  Pulls PPC campaign performance — impressions, spend, CPC,
                  conversions — for each client whose Google Ads account
                  you're linked to. Shares the same OAuth connection as
                  Search Console.
                </p>
              </div>
            </div>
            @if (s.googleAds?.connected) {
              <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-positive-100 text-positive-500">
                ● Connected
              </span>
            } @else if (s.googleAds?.needsReconnect) {
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
            @if (s.googleAds?.connected) {
              <div class="text-ink-700">
                Using <strong class="text-ink-900">{{ s.googleAds?.email || '(unknown)' }}</strong>
                via the Google Search Console connection.
              </div>
            } @else if (s.googleAds?.needsReconnect) {
              <div class="text-warning-500">
                ⚠ Your existing Google token doesn't include the Ads scope.
                Click <strong>Reconnect</strong> at the top of this page to
                grant access — Google will reuse the same account.
              </div>
            } @else {
              <div class="text-ink-500">
                Connect Google Search Console above. The same OAuth grants
                Ads access when the scope is approved.
              </div>
            }
            <div class="rounded-md bg-warning-100/60 border border-warning-500/30 px-3 py-2 text-[11px] text-ink-700">
              ⚠ <strong>Important:</strong> live Ads data also requires an
              approved <em>Developer Token</em> from Google Ads (separate
              from OAuth). Until that token is approved, campaign endpoints
              return 403. You can still connect now — data will flow once
              the token clears review.
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

      <!-- Spear API — org-level, not a personal connection -->
      <div class="card mb-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-md bg-brand-50 border border-brand-200 flex items-center justify-center text-lg">🛰️</div>
            <div>
              <h2 class="text-base font-semibold text-ink-900">Spear API</h2>
              <p class="text-xs text-ink-500 mt-0.5 max-w-md">
                Media Spearhead's internal platform — pipeline, proposals and
                Google Ads. Unlike the cards above this is a server-wide API
                key, not your personal account, so the check below reports
                whether <strong>this server</strong> can reach Spear.
              </p>
            </div>
          </div>
          @if (spearResult(); as r) {
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
                  [class]="spearBadgeClass(r)">
              {{ r.ok ? '● Reachable' : '● ' + spearVerdictLabel(r) }}
            </span>
          } @else {
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-ink-100 text-ink-500">
              ○ Untested
            </span>
          }
        </div>

        <div class="mt-4 pt-4 border-t border-ink-100">
          <div class="flex flex-wrap items-end gap-2">
            <div class="min-w-[220px]">
              <label class="label">Demo request</label>
              <select class="input" [ngModel]="spearProbe()" (ngModelChange)="spearProbe.set($event)">
                <option value="catalog">GET catalog.php — proposal vocabulary</option>
                <option value="describe">POST ads-ops.php · describe — live schema</option>
              </select>
            </div>
            <button class="btn-primary" (click)="testSpear()" [disabled]="spearTesting()">
              {{ spearTesting() ? 'Calling Spear…' : 'Test Spear connection' }}
            </button>
            <p class="text-[11px] text-ink-400 basis-full">
              Both are read-only. One attempt per click, never retried — their
              WAF scores repeat probes, and a challenge will not clear on a
              second try.
            </p>
          </div>

          @if (spearResult(); as r) {
            <div class="mt-4 rounded-lg border p-3"
                 [class.border-positive-500]="r.ok"
                 [class.bg-positive-100]="r.ok"
                 [class.border-danger-500]="!r.ok"
                 [class.bg-danger-100]="!r.ok">
              <div class="text-sm font-semibold"
                   [class.text-positive-600]="r.ok"
                   [class.text-danger-500]="!r.ok">
                {{ r.ok ? '✓' : '✗' }} {{ r.message }}
              </div>

              <div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <div class="text-ink-400 uppercase tracking-wider font-bold">HTTP</div>
                  <div class="text-ink-900 font-mono">{{ r.httpStatus ?? '—' }}</div>
                </div>
                <div>
                  <div class="text-ink-400 uppercase tracking-wider font-bold">Latency</div>
                  <div class="text-ink-900 font-mono">{{ r.latencyMs }} ms</div>
                </div>
                <div>
                  <div class="text-ink-400 uppercase tracking-wider font-bold">Type</div>
                  <div class="text-ink-900 font-mono truncate">{{ r.contentType || '—' }}</div>
                </div>
                <div>
                  <div class="text-ink-400 uppercase tracking-wider font-bold">Verdict</div>
                  <div class="text-ink-900 font-mono">{{ r.verdict }}</div>
                </div>
              </div>

              <div class="text-[11px] text-ink-500 mt-2">{{ r.endpoint }}</div>

              @if (r.detail) {
                <div class="mt-2 text-xs text-ink-700 bg-white/70 rounded p-2 border border-ink-200">
                  {{ r.detail }}
                </div>
              }

              @if (r.sample) {
                <div class="mt-2">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-1">
                    Response from Spear
                  </div>
                  <pre class="text-[11px] font-mono bg-white/70 border border-ink-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">{{ spearSampleJson(r) }}</pre>
                </div>
              }
            </div>
          }
        </div>
      </div>

    </div>
  `,
})
export class ProfileIntegrationsComponent implements OnInit {
  private svc = inject(GoogleIntegrationsService);
  private spear = inject(SpearService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  status = signal<GoogleConnectionStatus | null>(null);
  loading = signal(true);
  working = signal(false);
  justConnected = signal(false);
  errorMsg = signal<string | null>(null);

  userName = () => this.auth.user()?.name || 'You';

  // --- Spear connectivity probe -------------------------------------------
  spearProbe = signal<'catalog' | 'describe'>('catalog');
  spearTesting = signal(false);
  spearResult = signal<SpearConnectionResult | null>(null);

  testSpear() {
    this.spearTesting.set(true);
    this.spearResult.set(null);
    this.spear.testConnection(this.spearProbe()).subscribe({
      next: (r) => {
        this.spearResult.set(r);
        this.spearTesting.set(false);
      },
      // The probe reports failures in its payload rather than throwing, so
      // landing here means our own API was unreachable — worth saying so
      // plainly instead of blaming Spear.
      error: (err) => {
        this.spearTesting.set(false);
        this.spearResult.set({
          ok: false,
          verdict: 'unreachable',
          endpoint: 'the platform API',
          httpStatus: err?.status ?? null,
          contentType: null,
          latencyMs: 0,
          message:
            err?.status === 403
              ? 'This check is limited to admins and above.'
              : 'Could not reach the platform API to run the check.',
          checkedAt: new Date().toISOString(),
        });
      },
    });
  }

  spearBadgeClass(r: SpearConnectionResult): string {
    if (r.ok) return 'bg-positive-100 text-positive-600';
    if (r.verdict === 'waf_challenge') return 'bg-warning-100 text-warning-500';
    return 'bg-danger-100 text-danger-500';
  }

  spearVerdictLabel(r: SpearConnectionResult): string {
    switch (r.verdict) {
      case 'waf_challenge':
        return 'Blocked by WAF';
      case 'auth_rejected':
        return 'Key rejected';
      case 'not_configured':
        return 'No key set';
      case 'server_error':
        return 'Spear error';
      default:
        return 'Unreachable';
    }
  }

  spearSampleJson(r: SpearConnectionResult): string {
    return JSON.stringify(r.sample ?? {}, null, 2);
  }

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
    this.svc.authUrl('/profile/integrations').subscribe({
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
