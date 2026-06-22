import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { API_BASE_URL } from '../../core/api.config';

interface SupervisorState {
  enabled: boolean;
  hasPin: boolean;
}

/**
 * Admin-only settings page for the /supervisor portal. Lets the admin
 * generate or rotate the PIN, view it once after regeneration, and
 * disable the portal entirely. Reuses /app-settings/supervisor* endpoints.
 */
@Component({
  selector: 'app-supervisor-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  template: `
    <div class="page-container">
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
            Integrations
          </a>
          <a routerLink="/settings/report-layout" routerLinkActive="tab-active" class="tab">
            Report layout
          </a>
          <a routerLink="/settings/supervisor" routerLinkActive="tab-active" class="tab">
            Supervisor
          </a>
        </div>
      </nav>

      <div class="mb-4">
        <h2 class="text-xl font-bold text-ink-900">Supervisor portal</h2>
        <p class="text-sm text-ink-500 max-w-2xl">
          Give a supervisor read-only access to all clients + cycles with a single PIN.
        </p>
      </div>

      <div class="card p-6 max-w-2xl">
        @if (loading()) {
          <div class="text-ink-400 italic text-sm">Loading…</div>
        } @else if (state(); as s) {
          <div class="flex items-center gap-2 mb-4">
            <span
              class="inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-semibold"
              [class.bg-positive-100]="s.enabled"
              [class.text-positive-500]="s.enabled"
              [class.bg-ink-100]="!s.enabled"
              [class.text-ink-500]="!s.enabled">
              <span class="w-1.5 h-1.5 rounded-full"
                    [class.bg-positive-500]="s.enabled"
                    [class.bg-ink-400]="!s.enabled"></span>
              {{ s.enabled ? 'Enabled' : 'Disabled' }}
            </span>
            @if (s.hasPin) {
              <span class="text-xs text-ink-500">· PIN is active</span>
            }
          </div>

          @if (revealedPin(); as p) {
            <div class="rounded-md border border-warning-500/30 bg-warning-100/40 p-3 mb-4">
              <div class="text-[10px] uppercase tracking-wider font-bold text-warning-500 mb-1">
                Current PIN
              </div>
              <div class="font-mono text-2xl tracking-[0.3em] text-ink-900">{{ p }}</div>
              <p class="text-[11px] text-ink-600 mt-2">
                Share this with the supervisor along with the URL:
                <code class="bg-white px-1.5 py-0.5 rounded">{{ supervisorUrl() }}</code>
              </p>
            </div>
          }

          <div class="flex flex-wrap gap-2">
            <button class="btn-primary text-sm"
                    [disabled]="busy()"
                    (click)="regenerate()">
              {{ s.hasPin ? 'Regenerate PIN' : 'Generate PIN' }}
            </button>
            @if (s.hasPin && !revealedPin()) {
              <button class="btn-secondary text-sm"
                      [disabled]="busy()"
                      (click)="reveal()">
                Reveal current PIN
              </button>
            }
            @if (s.enabled) {
              <button class="btn-secondary text-sm text-danger-500"
                      [disabled]="busy()"
                      (click)="disable()">
                Disable portal
              </button>
            }
          </div>

          @if (error()) {
            <div class="mt-3 text-xs text-danger-500">{{ error() }}</div>
          }

          <div class="mt-6 text-xs text-ink-500 leading-relaxed">
            <p class="mb-1.5">
              <strong class="text-ink-700">How it works</strong>
            </p>
            <ul class="list-disc pl-4 space-y-0.5">
              <li>The supervisor opens <code class="bg-ink-100 px-1 rounded">{{ supervisorUrl() }}</code>, enters the PIN, and gets a 12-hour session.</li>
              <li>They can browse every active client and any cycle that has tasks or a saved report.</li>
              <li>Per cycle they see tasks (with status, priority, hours), report KPIs + rich-text sections.</li>
              <li>They can add comments on each task — those comments appear on the team-side task editor too.</li>
              <li>They cannot edit anything else, generate reports, share, or see credentials.</li>
            </ul>
          </div>
        }
      </div>
    </div>
  `,
})
export class SupervisorSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  state = signal<SupervisorState | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal<string | null>(null);
  revealedPin = signal<string | null>(null);

  supervisorUrl(): string {
    return `${window.location.origin}/supervisor`;
  }

  ngOnInit() {
    this.refresh();
  }

  private refresh() {
    this.http
      .get<SupervisorState>(`${this.base}/app-settings/supervisor`)
      .subscribe({
        next: (s) => {
          this.state.set(s);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Failed to load settings');
        },
      });
  }

  regenerate() {
    this.busy.set(true);
    this.error.set(null);
    this.http
      .post<{ pin: string }>(
        `${this.base}/app-settings/supervisor/regenerate-pin`,
        {},
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.revealedPin.set(res.pin);
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message || 'Could not regenerate PIN');
        },
      });
  }

  reveal() {
    this.busy.set(true);
    this.error.set(null);
    this.http
      .get<{ pin: string | null }>(
        `${this.base}/app-settings/supervisor/reveal-pin`,
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.revealedPin.set(res.pin);
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message || 'Could not reveal PIN');
        },
      });
  }

  disable() {
    if (!confirm('Disable the supervisor portal? The PIN will be cleared.')) return;
    this.busy.set(true);
    this.error.set(null);
    this.http
      .delete<{ disabled: boolean }>(`${this.base}/app-settings/supervisor`)
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.revealedPin.set(null);
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message || 'Could not disable portal');
        },
      });
  }
}
