import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GoogleConnectionStatus } from '@seo/shared';
import { AuthService } from '../../core/auth.service';
import { GoogleIntegrationsService } from '../../core/google-integrations.service';

type Step = 'welcome' | 'google' | 'ads' | 'done';

/**
 * First-run wizard. Users land here right after claiming their invite.
 * All steps are skippable — the wizard's job is to guide, not gate.
 * Completing (or skipping to the end) marks onboardingCompleted=true
 * on the user so subsequent logins bypass this page.
 *
 * We hit the Google status endpoint on load AND after returning from
 * an OAuth redirect so the "Connect Google" / "Connect Google Ads"
 * buttons flip to "Connected" automatically.
 */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-ink-50 py-10 px-4">
      <div class="max-w-2xl mx-auto">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-brand-500 text-white text-xl font-bold mb-3">
            IT
          </div>
          <h1 class="text-2xl font-bold text-ink-900">Welcome, {{ userName() }}</h1>
          <p class="text-sm text-ink-500 mt-1">
            Let's set up your integrations. Takes about a minute.
          </p>
        </div>

        <!-- Step tracker -->
        <div class="flex items-center gap-2 justify-center mb-6 text-[11px] font-semibold uppercase tracking-wider">
          @for (s of steps; track s.key; let i = $index) {
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                   [class]="stepDotClass(s.key)">
                {{ i + 1 }}
              </div>
              <span [class]="stepLabelClass(s.key)">{{ s.label }}</span>
              @if (!$last) {
                <span class="text-ink-300">·</span>
              }
            </div>
          }
        </div>

        <div class="card">
          @switch (step()) {
            @case ('welcome') {
              <h2 class="text-xl font-bold text-ink-900 mb-2">You're in.</h2>
              <p class="text-sm text-ink-600 leading-relaxed">
                Media Spearhead's platform pulls data from your Google
                accounts to auto-fill reports and dashboards. The next steps
                connect your Google account (for Search Console, Analytics,
                and Business Profile) and Google Ads.
              </p>
              <p class="text-sm text-ink-500 mt-3">
                You can skip any step and come back later from your profile.
              </p>
              <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
                <button class="btn-ghost text-ink-500" (click)="finish()"
                        [disabled]="working()">
                  Skip for now
                </button>
                <button class="btn-primary" (click)="next()">
                  Get started →
                </button>
              </div>
            }

            @case ('google') {
              <div class="flex items-start gap-3 mb-3">
                <div class="w-11 h-11 rounded-md bg-sky-50 border border-sky-200 flex items-center justify-center text-xl">🔎</div>
                <div>
                  <h2 class="text-lg font-bold text-ink-900">Connect Google</h2>
                  <p class="text-xs text-ink-500 mt-0.5">
                    Grants access to Search Console, Analytics 4, and Business
                    Profile in one step.
                  </p>
                </div>
              </div>
              <p class="text-sm text-ink-600 leading-relaxed">
                Sign in with the Google account that has access to your
                clients' properties. The platform pulls data on your behalf
                for every client you're assigned to.
              </p>

              @if (googleStatus()?.gsc?.connected) {
                <div class="rounded-md bg-positive-100/40 border border-positive-500/30 px-3 py-2 mt-4 text-sm text-positive-500 font-semibold">
                  ● Connected as {{ googleStatus()?.gsc?.email }}
                </div>
              }
              @if (errorMsg()) {
                <div class="rounded-md bg-danger-100 border border-danger-500/30 px-3 py-2 mt-4 text-sm text-danger-500">
                  {{ errorMsg() }}
                </div>
              }

              <div class="flex justify-between items-center mt-6 pt-4 border-t border-ink-100">
                <button class="btn-ghost text-ink-500" (click)="back()"
                        [disabled]="working()">
                  ← Back
                </button>
                <div class="flex gap-2">
                  <button class="btn-ghost text-ink-500" (click)="next()"
                          [disabled]="working()">
                    Skip
                  </button>
                  @if (googleStatus()?.gsc?.connected) {
                    <button class="btn-primary" (click)="next()">
                      Continue →
                    </button>
                  } @else {
                    <button class="btn-primary" (click)="connectGoogle()"
                            [disabled]="working()">
                      {{ working() ? 'Opening…' : 'Connect Google' }}
                    </button>
                  }
                </div>
              </div>
            }

            @case ('ads') {
              <div class="flex items-start gap-3 mb-3">
                <div class="w-11 h-11 rounded-md bg-warning-100 border border-warning-500/30 flex items-center justify-center text-xl">📣</div>
                <div>
                  <h2 class="text-lg font-bold text-ink-900">Connect Google Ads</h2>
                  <p class="text-xs text-ink-500 mt-0.5">
                    Needed for PPC campaign data — spend, CPC, conversions.
                  </p>
                </div>
              </div>
              <p class="text-sm text-ink-600 leading-relaxed">
                Uses the same Google account you connected above. If the
                Ads scope isn't already granted, we'll open the consent
                screen so you can approve it.
              </p>
              <p class="text-[11px] text-ink-500 mt-3 leading-relaxed">
                <strong>Note:</strong> live Ads data also requires a
                Developer Token approved by Google. Ask your admin whether
                the platform's developer token is ready — you can still
                connect now; data will flow when the token is approved.
              </p>

              @if (googleStatus()?.googleAds?.connected) {
                <div class="rounded-md bg-positive-100/40 border border-positive-500/30 px-3 py-2 mt-4 text-sm text-positive-500 font-semibold">
                  ● Google Ads connected
                </div>
              } @else if (googleStatus()?.googleAds?.needsReconnect) {
                <div class="rounded-md bg-warning-100/40 border border-warning-500/30 px-3 py-2 mt-4 text-sm text-warning-500">
                  ⟳ Your Google connection needs the Ads scope. Click
                  Connect below.
                </div>
              }
              @if (errorMsg()) {
                <div class="rounded-md bg-danger-100 border border-danger-500/30 px-3 py-2 mt-4 text-sm text-danger-500">
                  {{ errorMsg() }}
                </div>
              }

              <div class="flex justify-between items-center mt-6 pt-4 border-t border-ink-100">
                <button class="btn-ghost text-ink-500" (click)="back()"
                        [disabled]="working()">
                  ← Back
                </button>
                <div class="flex gap-2">
                  <button class="btn-ghost text-ink-500" (click)="next()"
                          [disabled]="working()">
                    Skip
                  </button>
                  @if (googleStatus()?.googleAds?.connected) {
                    <button class="btn-primary" (click)="next()">
                      Continue →
                    </button>
                  } @else {
                    <button class="btn-primary" (click)="connectGoogle()"
                            [disabled]="working()">
                      {{ working() ? 'Opening…' : 'Connect Google Ads' }}
                    </button>
                  }
                </div>
              </div>
            }

            @case ('done') {
              <div class="text-center py-4">
                <div class="text-4xl mb-2">🎉</div>
                <h2 class="text-xl font-bold text-ink-900">You're all set.</h2>
                <p class="text-sm text-ink-500 mt-2 max-w-md mx-auto">
                  You can always revisit your integrations from
                  <strong class="text-ink-900">My Profile</strong> in the
                  sidebar footer.
                </p>
              </div>
              <div class="flex justify-center mt-6 pt-4 border-t border-ink-100">
                <button class="btn-primary" (click)="finish()"
                        [disabled]="working()">
                  {{ working() ? 'Finishing…' : 'Go to dashboard' }}
                </button>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class OnboardingComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private google = inject(GoogleIntegrationsService);

  step = signal<Step>('welcome');
  working = signal(false);
  googleStatus = signal<GoogleConnectionStatus | null>(null);
  errorMsg = signal<string | null>(null);

  readonly steps: { key: Step; label: string }[] = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'google', label: 'Google' },
    { key: 'ads', label: 'Google Ads' },
    { key: 'done', label: 'Done' },
  ];

  userName = computed(() => {
    const name = this.auth.user()?.name || '';
    return name.split(' ')[0] || 'there';
  });

  ngOnInit() {
    this.refreshStatus();
    // Auto-advance if we bounced back from an OAuth redirect with the
    // ?google_connected=1 flag (the OAuth callback lands on /profile —
    // but nothing stops the flag from arriving here too if the user
    // manually navigated back).
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === '1') {
      this.step.set('ads');
    }
  }

  refreshStatus() {
    this.google.status().subscribe({
      next: (s) => this.googleStatus.set(s),
      error: () => this.googleStatus.set(null),
    });
  }

  stepDotClass(key: Step): string {
    if (this.step() === key) return 'bg-brand-500 text-white';
    if (this.isPastStep(key)) return 'bg-positive-500 text-white';
    return 'bg-ink-200 text-ink-500';
  }

  stepLabelClass(key: Step): string {
    if (this.step() === key) return 'text-ink-900';
    if (this.isPastStep(key)) return 'text-positive-500';
    return 'text-ink-400';
  }

  private isPastStep(key: Step): boolean {
    const order = this.steps.findIndex((s) => s.key === key);
    const current = this.steps.findIndex((s) => s.key === this.step());
    return order < current;
  }

  next() {
    const current = this.steps.findIndex((s) => s.key === this.step());
    if (current < this.steps.length - 1) {
      this.step.set(this.steps[current + 1].key);
      if (this.steps[current + 1].key === 'google' || this.steps[current + 1].key === 'ads') {
        this.refreshStatus();
      }
    }
  }

  back() {
    const current = this.steps.findIndex((s) => s.key === this.step());
    if (current > 0) {
      this.step.set(this.steps[current - 1].key);
    }
  }

  connectGoogle() {
    this.working.set(true);
    this.errorMsg.set(null);
    // Return back to onboarding after OAuth so the wizard can pick up.
    this.google.authUrl('/onboarding').subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: (err) => {
        this.working.set(false);
        this.errorMsg.set(err?.error?.message || 'Could not start OAuth.');
      },
    });
  }

  finish() {
    this.working.set(true);
    this.auth.completeOnboarding().subscribe({
      next: () => {
        this.working.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        // Even if the API call fails, don't strand the user — send
        // them to the dashboard and let subsequent /me calls retry
        // the flag update.
        this.working.set(false);
        this.router.navigate(['/dashboard']);
      },
    });
  }
}
