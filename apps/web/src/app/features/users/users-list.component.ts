import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { USER_ROLE_LABELS, User, UserRole } from '@seo/shared';
import { AuthService } from '../../core/auth.service';
import { UsersService } from '../../core/users.service';

type FormMode = 'create' | 'edit' | 'reset' | null;

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Users</h1>
          <p class="page-subtitle">Manage who has access to the platform.</p>
        </div>
        <button class="btn-primary" (click)="openCreate()">+ New user</button>
      </header>

      <div class="card-flush">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th class="w-32">Role</th>
              <th class="w-20">Status</th>
              <th class="w-32">Joined</th>
              <th class="w-40 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users(); track u._id) {
              <tr>
                <td class="font-semibold text-ink-900">{{ u.name }}</td>
                <td class="text-ink-600">{{ u.email }}</td>
                <td>
                  <span class="badge" [ngClass]="roleBadgeClass(u.role)">{{ roleLabel(u.role) }}</span>
                </td>
                <td>
                  @if (u.active) {
                    <span class="badge-success">Active</span>
                  } @else {
                    <span class="badge-neutral">Disabled</span>
                  }
                </td>
                <td class="text-xs text-ink-500">{{ u.createdAt | date: 'mediumDate' }}</td>
                <td class="text-right">
                  <div class="inline-flex gap-1">
                    <button class="btn-ghost btn-sm" (click)="openEdit(u)">Edit</button>
                    <button class="btn-ghost btn-sm" (click)="openReset(u)">Reset PW</button>
                    @if (u._id !== auth.user()?._id) {
                      <button class="btn-ghost btn-sm text-danger-500" (click)="remove(u)">Delete</button>
                    }
                  </div>
                </td>
              </tr>
            }
            @if (!users().length && !loading()) {
              <tr><td colspan="6" class="py-10 text-center text-ink-400 italic">No users yet.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Modal -->
      @if (mode()) {
        <div class="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4"
             (click)="closeModal()">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
            <h2 class="text-lg font-bold text-ink-900 mb-4">
              @switch (mode()) {
                @case ('create') { New user }
                @case ('edit') { Edit user }
                @case ('reset') { Reset password }
              }
            </h2>

            @if (mode() === 'create' || mode() === 'edit') {
              <div class="space-y-3">
                <div>
                  <label class="label">Name</label>
                  <input class="input" [(ngModel)]="form.name" />
                </div>
                @if (mode() === 'create') {
                  <div>
                    <label class="label">Email</label>
                    <input class="input" type="email" [(ngModel)]="form.email" />
                  </div>
                  <div>
                    <label class="label">Initial password</label>
                    <input class="input" type="text" [(ngModel)]="form.password" />
                    <div class="text-xs text-ink-400 mt-1">Min. 8 characters. Share securely.</div>
                  </div>
                }
                <div>
                  <label class="label">Role</label>
                  <select class="input" [(ngModel)]="form.role">
                    <option value="root">Root</option>
                    <option value="seo-manager">SEO Manager</option>
                    <option value="seo-strategist">SEO Strategist</option>
                  </select>
                </div>
                @if (mode() === 'edit') {
                  <div class="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="active-toggle" [(ngModel)]="form.active" />
                    <label for="active-toggle" class="text-sm text-ink-700">Active (can log in)</label>
                  </div>
                }
              </div>
            } @else {
              <div>
                <label class="label">New password</label>
                <input class="input" type="text" [(ngModel)]="form.password" />
                <div class="text-xs text-ink-400 mt-1">Share securely with the user.</div>
              </div>
            }

            @if (error()) {
              <div class="mt-3 text-xs text-danger-500">{{ error() }}</div>
            }

            <div class="flex justify-end gap-2 mt-6">
              <button class="btn-secondary" (click)="closeModal()">Cancel</button>
              <button class="btn-primary" (click)="submit()" [disabled]="submitting()">
                {{ submitting() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class UsersListComponent implements OnInit {
  private usersSvc = inject(UsersService);
  protected auth = inject(AuthService);

  users = signal<User[]>([]);
  loading = signal(true);
  mode = signal<FormMode>(null);
  submitting = signal(false);
  error = signal<string | null>(null);
  editingId: string | null = null;

  form = {
    name: '',
    email: '',
    password: '',
    role: 'seo-strategist' as UserRole,
    active: true,
  };

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.usersSvc.list().subscribe({
      next: (list) => {
        this.users.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  roleLabel(role: UserRole) {
    return USER_ROLE_LABELS[role];
  }

  roleBadgeClass(role: UserRole) {
    if (role === 'root') return 'bg-ink-900 text-white';
    if (role === 'seo-manager') return 'bg-brand-100 text-brand-700';
    return 'bg-sky-100 text-sky-700';
  }

  openCreate() {
    this.editingId = null;
    this.form = { name: '', email: '', password: '', role: 'seo-strategist', active: true };
    this.error.set(null);
    this.mode.set('create');
  }

  openEdit(u: User) {
    this.editingId = u._id!;
    this.form = {
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      active: u.active,
    };
    this.error.set(null);
    this.mode.set('edit');
  }

  openReset(u: User) {
    this.editingId = u._id!;
    this.form = { ...this.form, password: '' };
    this.error.set(null);
    this.mode.set('reset');
  }

  closeModal() {
    this.mode.set(null);
    this.submitting.set(false);
    this.error.set(null);
  }

  submit() {
    this.submitting.set(true);
    this.error.set(null);
    const mode = this.mode();
    const done = () => {
      this.submitting.set(false);
      this.closeModal();
      this.load();
    };
    const onErr = (err: unknown) => {
      this.submitting.set(false);
      const msg =
        (err as { error?: { message?: string } })?.error?.message ?? 'Request failed';
      this.error.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
    };

    if (mode === 'create') {
      this.usersSvc
        .create({
          email: this.form.email,
          name: this.form.name,
          password: this.form.password,
          role: this.form.role,
          active: this.form.active,
        })
        .subscribe({ next: done, error: onErr });
    } else if (mode === 'edit' && this.editingId) {
      this.usersSvc
        .update(this.editingId, {
          name: this.form.name,
          role: this.form.role,
          active: this.form.active,
        })
        .subscribe({ next: done, error: onErr });
    } else if (mode === 'reset' && this.editingId) {
      this.usersSvc
        .resetPassword(this.editingId, this.form.password)
        .subscribe({ next: done, error: onErr });
    }
  }

  remove(u: User) {
    if (!u._id) return;
    if (!confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    this.usersSvc.remove(u._id).subscribe({
      next: () => this.load(),
      error: (err) => alert(err?.error?.message || 'Failed to delete'),
    });
  }
}
