import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  SupervisorClient,
  SupervisorService,
} from '../../core/supervisor.service';

@Component({
  selector: 'app-supervisor-clients',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-ink-50">
      <header class="bg-white border-b border-ink-200 px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded bg-brand-500 text-white text-xs font-bold">S</span>
          <h1 class="text-sm font-semibold text-ink-900">Supervisor portal</h1>
        </div>
        <button class="text-xs text-ink-500 hover:text-ink-900" (click)="logout()">
          Sign out
        </button>
      </header>

      <main class="max-w-5xl mx-auto px-4 py-6">
        <div class="mb-4">
          <h2 class="text-lg font-bold text-ink-900">Pick a client</h2>
          <p class="text-xs text-ink-500">
            Read-only access. Pick a client to view their cycles, tasks, and reports.
          </p>
        </div>

        @if (loading()) {
          <div class="card py-12 text-center text-ink-400 italic text-sm">Loading…</div>
        } @else if (error()) {
          <div class="card py-8 text-center text-danger-500 text-sm">{{ error() }}</div>
        } @else if (!clients().length) {
          <div class="card py-12 text-center text-ink-400 italic text-sm">
            No active clients available.
          </div>
        } @else {
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            @for (c of clients(); track c._id) {
              <a [routerLink]="['/supervisor', 'clients', c._id]"
                 class="card p-4 hover:shadow-elevated transition group">
                <div class="flex items-center gap-3">
                  @if (c.logoUrl) {
                    <img [src]="c.logoUrl" [alt]="c.name"
                         class="w-10 h-10 rounded-md object-contain bg-white border border-ink-200 flex-shrink-0" />
                  } @else {
                    <div class="w-10 h-10 rounded-md bg-ink-100 border border-ink-200 flex items-center justify-center text-sm font-bold text-ink-500">
                      {{ c.name.charAt(0) }}
                    </div>
                  }
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="font-semibold text-ink-900 truncate group-hover:text-brand-600 transition-colors">
                        {{ c.name }}
                      </h3>
                      <span [class]="'tier-' + c.tier">{{ c.tier }}</span>
                    </div>
                    @if (c.url) {
                      <div class="text-[11px] text-ink-500 truncate">{{ shortUrl(c.url) }}</div>
                    }
                  </div>
                </div>
              </a>
            }
          </div>
        }
      </main>
    </div>
  `,
})
export class SupervisorClientsComponent implements OnInit {
  private svc = inject(SupervisorService);
  private router = inject(Router);

  clients = signal<SupervisorClient[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit() {
    this.svc.listClients().subscribe({
      next: (cs) => {
        this.clients.set(cs);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Failed to load clients');
        if (err.status === 401) {
          this.svc.logout();
          this.router.navigate(['/supervisor']);
        }
      },
    });
  }

  shortUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  logout() {
    this.svc.logout();
    this.router.navigate(['/supervisor']);
  }
}
