import { CommonModule, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { API_BASE_URL } from '../../core/api.config';

interface SupervisorRow {
  _id: string;
  name: string;
  active: boolean;
  lastSeenAt?: string;
  createdAt?: string;
}

/**
 * Admin page for managing the supervisor portal. Lists every registered
 * supervisor, lets the admin add new ones, regenerate / reveal PINs, and
 * disable or remove them. Each supervisor has their OWN PIN — there's no
 * single shared credential.
 */
@Component({
  selector: 'app-supervisor-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, DatePipe],
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
            Supervisors
          </a>
        </div>
      </nav>

      <div class="mb-4">
        <h2 class="text-xl font-bold text-ink-900">Supervisors</h2>
        <p class="text-sm text-ink-500 max-w-2xl">
          Each supervisor has their own PIN. Add as many as you need —
          each will sign in to <code class="bg-ink-100 px-1 rounded">{{ portalUrl() }}</code> with their own credential.
        </p>
      </div>

      <!-- Add new supervisor -->
      <div class="card p-4 mb-4 max-w-2xl">
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            class="input flex-1"
            placeholder="Supervisor name (e.g. Maria Lopez)"
            [(ngModel)]="newName"
            (keydown.enter)="add()" />
          <button class="btn-primary text-sm"
                  [disabled]="busy() || !newName.trim()"
                  (click)="add()">
            + Add supervisor
          </button>
        </div>
        @if (error()) {
          <div class="mt-2 text-xs text-danger-500">{{ error() }}</div>
        }
      </div>

      <!-- Newly generated PIN (shown once) -->
      @if (revealed(); as r) {
        <div class="card p-4 mb-4 max-w-2xl border-l-4 border-warning-500 bg-warning-100/40">
          <div class="text-[10px] uppercase tracking-wider font-bold text-warning-500 mb-1">
            New PIN for {{ r.name }}
          </div>
          <div class="font-mono text-2xl tracking-[0.3em] text-ink-900 mb-2">{{ r.pin }}</div>
          <p class="text-[11px] text-ink-600">
            Share this PIN with {{ r.name }} now — it won't be displayed again.
            They sign in at <code class="bg-white px-1 rounded">{{ portalUrl() }}</code>.
          </p>
          <button class="mt-2 text-[11px] text-ink-500 hover:text-ink-900"
                  (click)="revealed.set(null)">
            Dismiss
          </button>
        </div>
      }

      <!-- List -->
      @if (loading()) {
        <div class="card p-6 text-ink-400 italic text-sm">Loading…</div>
      } @else if (!supervisors().length) {
        <div class="card p-6 text-ink-400 italic text-sm">
          No supervisors registered yet. Add one above to get started.
        </div>
      } @else {
        <div class="card divide-y divide-ink-100 max-w-3xl overflow-hidden">
          @for (s of supervisors(); track s._id) {
            <div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  @if (editingId() === s._id) {
                    <input class="input input-sm font-semibold text-ink-900"
                           [(ngModel)]="editingName"
                           (keydown.enter)="commitRename(s)"
                           (keydown.escape)="cancelRename()" />
                  } @else {
                    <span class="font-semibold text-ink-900">{{ s.name }}</span>
                  }
                  <span
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    [class.bg-positive-100]="s.active"
                    [class.text-positive-500]="s.active"
                    [class.bg-ink-100]="!s.active"
                    [class.text-ink-500]="!s.active">
                    {{ s.active ? 'Active' : 'Disabled' }}
                  </span>
                </div>
                <div class="text-[11px] text-ink-500">
                  @if (s.lastSeenAt) {
                    Last seen {{ s.lastSeenAt | date: 'medium' }}
                  } @else {
                    Never signed in
                  }
                  @if (s.createdAt) {
                    · Added {{ s.createdAt | date: 'mediumDate' }}
                  }
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1.5">
                @if (editingId() === s._id) {
                  <button class="btn-primary text-xs"
                          (click)="commitRename(s)">Save</button>
                  <button class="btn-ghost text-xs"
                          (click)="cancelRename()">Cancel</button>
                } @else {
                  <button class="btn-secondary text-xs"
                          (click)="startRename(s)">Rename</button>
                  <button class="btn-secondary text-xs"
                          [disabled]="busy()"
                          (click)="regenerate(s)">Regenerate PIN</button>
                  <button class="btn-secondary text-xs"
                          [disabled]="busy()"
                          (click)="toggleActive(s)">
                    {{ s.active ? 'Disable' : 'Enable' }}
                  </button>
                  <button class="btn-secondary text-xs text-danger-500"
                          [disabled]="busy()"
                          (click)="remove(s)">Delete</button>
                }
              </div>
            </div>
          }
        </div>
      }

      <div class="mt-6 text-xs text-ink-500 leading-relaxed max-w-2xl">
        <p class="mb-1.5"><strong class="text-ink-700">How it works</strong></p>
        <ul class="list-disc pl-4 space-y-0.5">
          <li>Add one supervisor row per person who needs access.</li>
          <li>Generate the PIN once and share it with that person.</li>
          <li>They open <code class="bg-ink-100 px-1 rounded">{{ portalUrl() }}</code>, enter the PIN, and get a 12-hour session.</li>
          <li>Their name appears on any task comment they post.</li>
          <li>Use <strong>Disable</strong> to block access temporarily; <strong>Delete</strong> removes the record entirely (their past comments stay attached).</li>
        </ul>
      </div>
    </div>
  `,
})
export class SupervisorSettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  supervisors = signal<SupervisorRow[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal<string | null>(null);
  newName = '';
  revealed = signal<{ name: string; pin: string } | null>(null);

  editingId = signal<string | null>(null);
  editingName = '';

  portalUrl(): string {
    return `${window.location.origin}/supervisor`;
  }

  ngOnInit() {
    this.refresh();
  }

  private refresh() {
    this.http
      .get<SupervisorRow[]>(`${this.base}/app-settings/supervisors`)
      .subscribe({
        next: (list) => {
          this.supervisors.set(list);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'Failed to load supervisors');
        },
      });
  }

  add() {
    const name = this.newName.trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set(null);
    this.http
      .post<{ _id: string; pin: string }>(
        `${this.base}/app-settings/supervisors`,
        { name },
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.newName = '';
          this.revealed.set({ name, pin: res.pin });
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message || 'Could not add supervisor');
        },
      });
  }

  regenerate(s: SupervisorRow) {
    this.busy.set(true);
    this.error.set(null);
    this.http
      .post<{ pin: string }>(
        `${this.base}/app-settings/supervisors/${s._id}/regenerate-pin`,
        {},
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.revealed.set({ name: s.name, pin: res.pin });
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(
            err?.error?.message || 'Could not regenerate PIN',
          );
        },
      });
  }

  toggleActive(s: SupervisorRow) {
    this.busy.set(true);
    this.http
      .patch<SupervisorRow>(
        `${this.base}/app-settings/supervisors/${s._id}`,
        { active: !s.active },
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message || 'Could not update supervisor');
        },
      });
  }

  startRename(s: SupervisorRow) {
    this.editingId.set(s._id);
    this.editingName = s.name;
  }

  cancelRename() {
    this.editingId.set(null);
    this.editingName = '';
  }

  commitRename(s: SupervisorRow) {
    const name = this.editingName.trim();
    if (!name || name === s.name) {
      this.cancelRename();
      return;
    }
    this.busy.set(true);
    this.http
      .patch<SupervisorRow>(
        `${this.base}/app-settings/supervisors/${s._id}`,
        { name },
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.cancelRename();
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message || 'Could not rename');
        },
      });
  }

  remove(s: SupervisorRow) {
    if (
      !confirm(
        `Delete supervisor "${s.name}"? Their past comments stay attached but they lose access immediately.`,
      )
    )
      return;
    this.busy.set(true);
    this.http
      .delete(`${this.base}/app-settings/supervisors/${s._id}`)
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(err?.error?.message || 'Could not delete');
        },
      });
  }
}
