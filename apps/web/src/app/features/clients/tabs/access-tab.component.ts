import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Client,
  ClientCredential,
  CREDENTIAL_CATEGORY_LABELS,
  CredentialCategory,
} from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';

type CredentialDraft = ClientCredential & { _show?: boolean };

const CATEGORY_ORDER: CredentialCategory[] = [
  'website',
  'booking',
  'social',
  'email',
  'other',
];

@Component({
  selector: 'app-client-access-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <!-- Credentials -->
      <div class="card">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 class="text-base font-semibold text-ink-900">Credentials</h2>
            <p class="text-xs text-ink-500 mt-1">
              Logins for website, booking systems and other platforms shared by
              the client.
            </p>
          </div>
          <button
            class="btn-primary"
            (click)="openCredential()"
            type="button"
          >
            + Credential
          </button>
        </div>

        @if (!credentials().length) {
          <p class="text-sm text-ink-400 italic">
            No credentials registered yet.
          </p>
        }

        @for (cat of categoryOrder; track cat) {
          @if (groupedCredentials()[cat]?.length) {
            <div class="mt-5 first:mt-0">
              <div class="flex items-center gap-2 mb-2">
                <h3
                  class="text-xs font-semibold uppercase tracking-wide text-ink-500"
                >
                  {{ categoryLabels[cat] }}
                </h3>
                <span
                  class="text-[10px] text-ink-400 bg-ink-100 rounded-full px-1.5 py-0.5"
                >
                  {{ groupedCredentials()[cat]?.length }}
                </span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                @for (c of groupedCredentials()[cat]; track $index) {
                  <article
                    class="border border-ink-200 rounded-lg p-3 hover:border-ink-300 transition-colors bg-white"
                  >
                    <div class="flex items-start justify-between gap-2 mb-2">
                      <div class="min-w-0">
                        <h4
                          class="font-semibold text-ink-900 text-sm truncate"
                        >
                          {{ c.label }}
                        </h4>
                        @if (c.url) {
                          <a
                            [href]="c.url"
                            target="_blank"
                            rel="noopener"
                            class="text-xs text-sky-500 hover:underline truncate block"
                          >
                            {{ c.url }} ↗
                          </a>
                        }
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          class="text-ink-400 hover:text-ink-900 text-xs px-1"
                          (click)="openCredential(c)"
                          title="Edit"
                        >
                          ✏
                        </button>
                        <button
                          type="button"
                          class="text-ink-400 hover:text-danger-500 text-base px-1 leading-none"
                          (click)="removeCredential(c)"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    @if (c.username) {
                      <div class="flex items-center gap-2 text-xs mb-1.5">
                        <span class="text-ink-500 w-16 shrink-0">User</span>
                        <span class="font-mono text-ink-700 truncate flex-1">{{
                          c.username
                        }}</span>
                        <button
                          type="button"
                          class="text-ink-400 hover:text-ink-900"
                          (click)="copy(c.username!, 'user')"
                          title="Copy"
                        >
                          📋
                        </button>
                      </div>
                    }

                    @if (c.password) {
                      <div class="flex items-center gap-2 text-xs mb-1.5">
                        <span class="text-ink-500 w-16 shrink-0">Pass</span>
                        <span class="font-mono text-ink-700 truncate flex-1">{{
                          c._show ? c.password : '••••••••'
                        }}</span>
                        <button
                          type="button"
                          class="text-ink-400 hover:text-ink-900"
                          (click)="togglePassword(c)"
                          [title]="c._show ? 'Hide' : 'Show'"
                        >
                          {{ c._show ? '🙈' : '👁' }}
                        </button>
                        <button
                          type="button"
                          class="text-ink-400 hover:text-ink-900"
                          (click)="copy(c.password!, 'pass')"
                          title="Copy"
                        >
                          📋
                        </button>
                      </div>
                    }

                    @if (c.notes) {
                      <p
                        class="text-xs text-ink-500 mt-2 pt-2 border-t border-ink-100 whitespace-pre-line break-words"
                      >
                        {{ c.notes }}
                      </p>
                    }
                  </article>
                }
              </div>
            </div>
          }
        }

        @if (copyToast()) {
          <div
            class="fixed bottom-6 right-6 bg-ink-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg z-[10000]"
          >
            {{ copyToast() }}
          </div>
        }
      </div>
    </div>

    <!-- Credential modal -->
    @if (modalOpen()) {
      <div
        class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
        (click)="closeModal()"
      >
        <div
          class="bg-white rounded-xl shadow-xl w-full max-w-lg p-6"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start justify-between mb-4">
            <h2 class="text-lg font-bold text-ink-900">
              {{ editing()?._id ? 'Edit credential' : 'New credential' }}
            </h2>
            <button
              type="button"
              (click)="closeModal()"
              class="text-ink-400 hover:text-ink-900 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div class="space-y-3 text-sm">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="label">Label *</label>
                <input
                  class="input"
                  [(ngModel)]="form.label"
                  placeholder="e.g. WordPress admin"
                />
              </div>
              <div>
                <label class="label">Category</label>
                <select class="input" [(ngModel)]="form.category">
                  @for (cat of categoryOrder; track cat) {
                    <option [value]="cat">{{ categoryLabels[cat] }}</option>
                  }
                </select>
              </div>
            </div>
            <div>
              <label class="label">URL</label>
              <input
                class="input"
                [(ngModel)]="form.url"
                placeholder="https://..."
              />
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="label">Username / Email</label>
                <input class="input" [(ngModel)]="form.username" />
              </div>
              <div>
                <label class="label">Password</label>
                <input
                  class="input font-mono"
                  [type]="modalShowPassword() ? 'text' : 'password'"
                  [(ngModel)]="form.password"
                />
                <label
                  class="text-xs text-ink-500 mt-1 inline-flex items-center gap-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    [checked]="modalShowPassword()"
                    (change)="modalShowPassword.set(!modalShowPassword())"
                  />
                  Show
                </label>
              </div>
            </div>
            <div>
              <label class="label">Notes</label>
              <textarea
                class="input"
                rows="3"
                [(ngModel)]="form.notes"
                placeholder="2FA codes, security questions, etc."
              ></textarea>
            </div>

            @if (formError()) {
              <div class="text-xs text-danger-500">{{ formError() }}</div>
            }
          </div>

          <div
            class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100"
          >
            <button class="btn-secondary" (click)="closeModal()">Cancel</button>
            <button
              class="btn-primary"
              (click)="saveCredential()"
              [disabled]="saving()"
            >
              {{ saving() ? 'Saving…' : 'Save credential' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientAccessTab {
  private svc = inject(ClientsService);
  @Output() changed = new EventEmitter<void>();

  categoryOrder = CATEGORY_ORDER;
  categoryLabels = CREDENTIAL_CATEGORY_LABELS;

  credentials = signal<CredentialDraft[]>([]);
  copyToast = signal<string | null>(null);

  modalOpen = signal(false);
  editing = signal<CredentialDraft | null>(null);
  modalShowPassword = signal(false);
  saving = signal(false);
  formError = signal<string | null>(null);
  form: ClientCredential = this.emptyForm();

  private clientId?: string;

  @Input() set client(c: Client) {
    this.clientId = c._id;
    this.credentials.set(
      (c.credentials || []).map((x) => ({ ...x, _show: false })),
    );
  }

  groupedCredentials(): Record<CredentialCategory, CredentialDraft[]> {
    const out = {
      website: [] as CredentialDraft[],
      booking: [] as CredentialDraft[],
      social: [] as CredentialDraft[],
      email: [] as CredentialDraft[],
      other: [] as CredentialDraft[],
    };
    for (const c of this.credentials()) {
      (out[c.category] || out.other).push(c);
    }
    return out;
  }

  openCredential(c?: CredentialDraft) {
    this.formError.set(null);
    this.modalShowPassword.set(false);
    if (c) {
      this.editing.set(c);
      this.form = {
        _id: c._id,
        label: c.label,
        category: c.category,
        url: c.url || '',
        username: c.username || '',
        password: c.password || '',
        notes: c.notes || '',
      };
    } else {
      this.editing.set(null);
      this.form = this.emptyForm();
    }
    this.modalOpen.set(true);
  }

  closeModal() {
    if (this.saving()) return;
    this.modalOpen.set(false);
  }

  saveCredential() {
    const label = this.form.label?.trim();
    if (!label) {
      this.formError.set('Label is required.');
      return;
    }
    if (!this.clientId) return;
    this.formError.set(null);
    this.saving.set(true);

    const current = this.credentials();
    let next: CredentialDraft[];
    const editing = this.editing();
    const payload: ClientCredential = {
      label,
      category: this.form.category,
      url: this.form.url?.trim() || undefined,
      username: this.form.username?.trim() || undefined,
      password: this.form.password || undefined,
      notes: this.form.notes?.trim() || undefined,
    };
    if (editing?._id) {
      next = current.map((c) =>
        c._id === editing._id ? { ...payload, _id: editing._id, _show: false } : c,
      );
    } else {
      next = [...current, { ...payload, _show: false }];
    }

    this.svc
      .update(this.clientId, { credentials: next.map(({ _show, ...rest }) => rest) })
      .subscribe({
        next: (u) => {
          this.credentials.set(
            (u.credentials || []).map((x) => ({ ...x, _show: false })),
          );
          this.saving.set(false);
          this.modalOpen.set(false);
          this.changed.emit();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message;
          this.formError.set(
            Array.isArray(msg)
              ? msg.join(', ')
              : msg || 'Could not save the credential.',
          );
        },
      });
  }

  removeCredential(c: CredentialDraft) {
    if (!this.clientId) return;
    if (!confirm(`Delete credential "${c.label}"?`)) return;
    const next = this.credentials().filter((x) => x !== c);
    this.svc
      .update(this.clientId, {
        credentials: next.map(({ _show, ...rest }) => rest),
      })
      .subscribe((u) => {
        this.credentials.set(
          (u.credentials || []).map((x) => ({ ...x, _show: false })),
        );
        this.changed.emit();
      });
  }

  togglePassword(c: CredentialDraft) {
    this.credentials.update((arr) =>
      arr.map((x) => (x === c ? { ...x, _show: !x._show } : x)),
    );
  }

  copy(value: string, kind: 'user' | 'pass') {
    navigator.clipboard?.writeText(value).then(() => {
      this.copyToast.set(kind === 'user' ? 'Username copied' : 'Password copied');
      setTimeout(() => this.copyToast.set(null), 1500);
    });
  }

  private emptyForm(): ClientCredential {
    return {
      label: '',
      category: 'website',
      url: '',
      username: '',
      password: '',
      notes: '',
    };
  }
}
