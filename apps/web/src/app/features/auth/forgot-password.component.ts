import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/**
 * Kick-off page for the forgot-password flow. The API response is
 * intentionally the same shape whether or not the email exists, so
 * this component always shows the same confirmation state after
 * submit — matching the backend's anti-enumeration behavior.
 */
@Component({
  selector: 'app-forgot-password',
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
          @if (sent()) {
            <h2 class="text-lg font-semibold text-ink-900 mb-1">Check your inbox</h2>
            <p class="text-sm text-ink-500 mb-4">
              If <strong class="text-ink-900">{{ submittedEmail() }}</strong> matches
              an account, we've emailed a link to reset the password. It expires
              in a couple of hours.
            </p>
            <a routerLink="/login" class="btn-secondary w-full block text-center">
              Back to sign in
            </a>
          } @else {
            <h2 class="text-lg font-semibold text-ink-900 mb-1">Forgot password</h2>
            <p class="text-sm text-ink-500 mb-5">
              Enter your account email and we'll send a link to reset the
              password.
            </p>

            <form (ngSubmit)="submit()" class="space-y-4">
              <div>
                <label class="label" for="email">Email</label>
                <input id="email" type="email" class="input"
                       [(ngModel)]="email" name="email"
                       placeholder="you@company.com"
                       autocomplete="username"
                       required />
              </div>

              @if (error()) {
                <div class="rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
                  {{ error() }}
                </div>
              }

              <button type="submit" class="btn-primary w-full"
                      [disabled]="working() || !email">
                {{ working() ? 'Sending…' : 'Send reset link' }}
              </button>
            </form>

            <p class="text-center text-xs text-ink-500 mt-4">
              <a routerLink="/login" class="hover:underline">← Back to sign in</a>
            </p>
          }
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private auth = inject(AuthService);

  email = '';
  working = signal(false);
  error = signal<string | null>(null);
  sent = signal(false);
  submittedEmail = signal('');

  submit() {
    if (!this.email) return;
    this.working.set(true);
    this.error.set(null);
    this.auth.forgotPassword(this.email).subscribe({
      next: () => {
        this.working.set(false);
        this.submittedEmail.set(this.email);
        this.sent.set(true);
      },
      error: (err) => {
        this.working.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not send.',
        );
      },
    });
  }
}
