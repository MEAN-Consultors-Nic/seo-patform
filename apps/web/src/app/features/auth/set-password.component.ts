import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, TokenPeekResult } from '../../core/auth.service';

/**
 * Serves both the initial-invite flow (purpose='invite') and the
 * forgot-password flow (purpose='password_reset'). The backend peek
 * response tells us which one this is, so we can tune the copy without
 * a second route.
 */
@Component({
  selector: 'app-set-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-ink-50 px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-brand-500 text-white text-xl font-bold mb-3">
            IT
          </div>
          <h1 class="text-2xl font-bold text-ink-900">Internal Tools</h1>
          <p class="text-sm text-ink-500 mt-1">Media Spearhead</p>
        </div>

        <div class="card">
          @if (checking()) {
            <div class="py-6 text-center text-sm text-ink-500 italic">
              Checking your link…
            </div>
          } @else if (!peek()?.valid) {
            <h2 class="text-lg font-semibold text-ink-900 mb-1">Link expired</h2>
            <p class="text-sm text-ink-500 mb-4">
              This link is no longer valid. Ask your administrator to resend
              your invite, or request a new password reset.
            </p>
            <a routerLink="/forgot-password" class="btn-primary w-full block text-center">
              Request a new link
            </a>
            <a routerLink="/login" class="block text-center text-xs text-ink-500 mt-4 hover:underline">
              Back to sign in
            </a>
          } @else {
            <h2 class="text-lg font-semibold text-ink-900 mb-1">{{ heading() }}</h2>
            <p class="text-sm text-ink-500 mb-5">
              @if (peek()?.email; as em) {
                For <strong class="text-ink-900">{{ em }}</strong>.
              }
              Choose a strong password — at least 8 characters.
            </p>

            <form (ngSubmit)="submit()" class="space-y-4">
              <div>
                <label class="label" for="pw">New password</label>
                <input id="pw" type="password" class="input"
                       [(ngModel)]="password" name="password"
                       autocomplete="new-password"
                       required minlength="8" />
              </div>
              <div>
                <label class="label" for="pw2">Confirm password</label>
                <input id="pw2" type="password" class="input"
                       [(ngModel)]="confirm" name="confirm"
                       autocomplete="new-password"
                       required minlength="8" />
              </div>

              @if (error()) {
                <div class="rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
                  {{ error() }}
                </div>
              }

              <button type="submit" class="btn-primary w-full"
                      [disabled]="working() || !canSubmit()">
                {{ working() ? 'Saving…' : ctaLabel() }}
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class SetPasswordComponent implements OnInit {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  password = '';
  confirm = '';
  checking = signal(true);
  working = signal(false);
  error = signal<string | null>(null);
  peek = signal<TokenPeekResult | null>(null);

  private token = '';

  heading = computed(() =>
    this.peek()?.purpose === 'password_reset'
      ? 'Reset your password'
      : 'Set your password',
  );

  ctaLabel = computed(() =>
    this.peek()?.purpose === 'password_reset' ? 'Update password' : 'Activate account',
  );

  canSubmit(): boolean {
    return (
      this.password.length >= 8 &&
      this.confirm.length >= 8 &&
      this.password === this.confirm
    );
  }

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.peek.set({ valid: false });
      this.checking.set(false);
      return;
    }
    this.auth.peekToken(this.token).subscribe({
      next: (res) => {
        this.peek.set(res);
        this.checking.set(false);
      },
      error: () => {
        this.peek.set({ valid: false });
        this.checking.set(false);
      },
    });
  }

  submit() {
    this.error.set(null);
    if (this.password.length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }
    if (this.password !== this.confirm) {
      this.error.set("Passwords don't match.");
      return;
    }
    this.working.set(true);
    this.auth.setPasswordWithToken(this.token, this.password).subscribe({
      next: (res) => {
        this.working.set(false);
        this.router.navigate([
          res.user.onboardingCompleted === false ? '/onboarding' : '/dashboard',
        ]);
      },
      error: (err) => {
        this.working.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not save.',
        );
      },
    });
  }
}
