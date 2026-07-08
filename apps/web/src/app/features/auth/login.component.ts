import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
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
          <h2 class="text-lg font-semibold text-ink-900 mb-1">Sign in</h2>
          <p class="text-sm text-ink-500 mb-5">Enter your credentials to continue</p>

          <form (ngSubmit)="submit()" class="space-y-4">
            <div>
              <label class="label" for="email">Email</label>
              <input
                id="email"
                type="email"
                class="input"
                [(ngModel)]="email"
                name="email"
                placeholder="you@company.com"
                autocomplete="username"
                required />
            </div>

            <div>
              <label class="label" for="password">Password</label>
              <input
                id="password"
                type="password"
                class="input"
                [(ngModel)]="password"
                name="password"
                placeholder="••••••••"
                autocomplete="current-password"
                required />
            </div>

            @if (error()) {
              <div class="rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
                {{ error() }}
              </div>
            }

            <button type="submit" class="btn-primary w-full" [disabled]="loading()">
              {{ loading() ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>
        </div>

        <p class="text-center text-xs text-ink-500 mt-6">
          <a routerLink="/forgot-password" class="text-brand-500 hover:underline font-medium">
            Forgot your password?
          </a>
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  submit() {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        // Fresh invites land on /onboarding; existing users have the flag
        // backfilled to true so they go straight to the dashboard.
        this.router.navigate([
          res.user.onboardingCompleted === false ? '/onboarding' : '/dashboard',
        ]);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Invalid credentials');
      },
    });
  }
}
