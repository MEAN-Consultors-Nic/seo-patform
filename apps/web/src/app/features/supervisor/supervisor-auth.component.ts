import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupervisorService } from '../../core/supervisor.service';

@Component({
  selector: 'app-supervisor-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center px-4 bg-ink-50">
      <div class="w-full max-w-sm">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-md bg-brand-500 text-white text-xl font-bold mb-3">
            S
          </div>
          <h1 class="text-xl font-bold text-ink-900">Supervisor portal</h1>
          <p class="text-sm text-ink-500 mt-1">Enter the access PIN to continue.</p>
        </div>
        <div class="card p-6">
          <label class="label">Access PIN</label>
          <input
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="input text-center text-2xl tracking-[0.4em] font-mono"
            placeholder="••••••"
            maxlength="8"
            [(ngModel)]="pin"
            (keydown.enter)="submit()" />
          @if (error()) {
            <div class="mt-3 text-xs text-danger-500">{{ error() }}</div>
          }
          <button
            class="btn-primary w-full mt-4"
            [disabled]="submitting() || !pin.trim()"
            (click)="submit()">
            {{ submitting() ? 'Verifying…' : 'Enter' }}
          </button>
        </div>
        <p class="text-[10px] text-ink-400 text-center mt-4">
          Sessions last 12 hours. The PIN is rotated by the team.
        </p>
      </div>
    </div>
  `,
})
export class SupervisorAuthComponent implements OnInit {
  private svc = inject(SupervisorService);
  private router = inject(Router);

  pin = '';
  submitting = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    // Already authenticated? Skip straight to the client picker.
    if (this.svc.isAuthenticated()) {
      this.router.navigate(['/supervisor', 'clients']);
    }
  }

  submit() {
    const value = this.pin.trim();
    if (!value) return;
    this.submitting.set(true);
    this.error.set(null);
    this.svc.authenticate(value).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/supervisor', 'clients']);
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message || 'Invalid PIN.');
      },
    });
  }
}
