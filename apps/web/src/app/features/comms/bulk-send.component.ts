import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { API_BASE_URL } from '../../core/api.config';

interface BulkRosterClient {
  _id: string;
  name: string;
  url?: string;
  logoUrl?: string;
  lastEmail: {
    lastSentAt?: string;
    lastSubject?: string;
    lastKind?: string;
    count?: number;
  } | null;
}

/**
 * Bulk-send workspace (Comms Slice 3.4). Lists the strategist's
 * accessible clients ordered by "who hasn't been contacted in the
 * longest", so a strategist can drill into each one, land on the
 * Emails tab pre-filled, and burn through the roster in one sitting.
 */
@Component({
  selector: 'app-bulk-send',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink],
  template: `
    <div class="page-container max-w-5xl">
      <header class="page-header">
        <div>
          <h1 class="page-title">Bulk send</h1>
          <p class="page-subtitle">
            Roster ordered by days since your last email — send from oldest
            first. Clicking a client opens their Emails tab with the composer
            ready.
          </p>
        </div>
      </header>

      <div class="mb-3 flex items-center gap-2">
        <input class="input text-sm max-w-xs"
               [(ngModel)]="filterText"
               placeholder="Filter by client name…" />
        <div class="text-xs text-ink-500 ml-auto">
          {{ rows().length }} client{{ rows().length === 1 ? '' : 's' }}
          · {{ neverContacted() }} never contacted
        </div>
      </div>

      @if (loading()) {
        <div class="card text-center py-10 text-sm text-ink-400 italic">Loading…</div>
      } @else if (error()) {
        <div class="card text-xs text-danger-500">{{ error() }}</div>
      } @else if (rows().length === 0) {
        <div class="card text-center py-10 text-sm text-ink-500">
          No clients in your scope. Ask an admin to assign clients to you.
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50">
                <th class="text-left px-4 py-2 font-semibold">Client</th>
                <th class="text-left px-3 py-2 font-semibold">Last email</th>
                <th class="text-left px-3 py-2 font-semibold">Days ago</th>
                <th class="text-left px-3 py-2 font-semibold">Kind</th>
                <th class="text-right px-4 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (c of rows(); track c._id) {
                <tr class="border-b border-ink-100 hover:bg-ink-50">
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-2">
                      @if (c.logoUrl) {
                        <img [src]="c.logoUrl" [alt]="c.name"
                             class="w-6 h-6 rounded object-contain bg-white border border-ink-100" />
                      } @else {
                        <div class="w-6 h-6 rounded bg-ink-100 flex items-center justify-center text-[10px] font-bold text-ink-500">
                          {{ c.name.charAt(0) }}
                        </div>
                      }
                      <span class="font-semibold text-ink-900 truncate">{{ c.name }}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-xs text-ink-500">
                    @if (c.lastEmail?.lastSentAt) {
                      {{ c.lastEmail?.lastSentAt | date: 'mediumDate' }}
                    } @else {
                      <span class="text-danger-500 font-semibold">Never</span>
                    }
                  </td>
                  <td class="px-3 py-2 text-xs" [class.text-danger-500]="isStale(c)">
                    {{ daysAgoLabel(c) }}
                  </td>
                  <td class="px-3 py-2 text-[10px] uppercase font-bold text-ink-500">
                    {{ c.lastEmail?.lastKind || '—' }}
                  </td>
                  <td class="px-4 py-2 text-right">
                    <a class="btn-primary text-[11px] no-underline"
                       [routerLink]="['/clients', c._id]" [queryParams]="{ tab: 'emails' }">
                      Compose
                    </a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class BulkSendComponent implements OnInit {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  data = signal<BulkRosterClient[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  filterText = '';

  rows = computed<BulkRosterClient[]>(() => {
    const term = this.filterText.trim().toLowerCase();
    const list = this.data().filter(
      (c) => !term || c.name.toLowerCase().includes(term),
    );
    // Sort: never-contacted first, then oldest last-sent first.
    return [...list].sort((a, b) => {
      const at = a.lastEmail?.lastSentAt
        ? new Date(a.lastEmail.lastSentAt).getTime()
        : 0;
      const bt = b.lastEmail?.lastSentAt
        ? new Date(b.lastEmail.lastSentAt).getTime()
        : 0;
      return at - bt;
    });
  });

  neverContacted = computed(
    () => this.data().filter((c) => !c.lastEmail?.lastSentAt).length,
  );

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.error.set(null);
    this.http
      .get<{ clients: BulkRosterClient[] }>(`${this.base}/comms/bulk-roster`)
      .subscribe({
        next: (r) => {
          this.data.set(r.clients);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Could not load roster.');
        },
      });
  }

  daysAgoLabel(c: BulkRosterClient): string {
    if (!c.lastEmail?.lastSentAt) return '—';
    const diff = Date.now() - new Date(c.lastEmail.lastSentAt).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days`;
  }

  isStale(c: BulkRosterClient): boolean {
    if (!c.lastEmail?.lastSentAt) return true;
    const days =
      (Date.now() - new Date(c.lastEmail.lastSentAt).getTime()) / 86400000;
    return days >= 30;
  }
}
