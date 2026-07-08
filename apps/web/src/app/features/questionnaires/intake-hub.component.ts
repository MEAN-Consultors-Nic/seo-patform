import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  QUESTIONNAIRE_KIND_LABELS,
  Questionnaire,
  QuestionnaireKind,
} from '@seo/shared';
import { QuestionnairesService } from '../../core/questionnaires.service';
import {
  QUESTIONNAIRE_TEMPLATES,
  QuestionnaireField,
} from './questionnaire-templates';

interface NewInviteForm {
  kind: QuestionnaireKind;
  businessName: string;
  invitedEmail: string;
}

/**
 * Intake Hub (Sales Slice 4.5). Internal-only workspace for creating
 * client-facing questionnaire invites (SEO / PPC / Website / Combo)
 * and reviewing every submission that comes back through the
 * public /q/:token forms.
 */
@Component({
  selector: 'app-intake-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="page-container max-w-6xl">
      <header class="page-header">
        <div>
          <h1 class="page-title">Intake Hub</h1>
          <p class="page-subtitle">
            Client-facing questionnaires — invite a lead to fill one, and
            review submissions as they come in.
          </p>
        </div>
        <button class="btn-primary" (click)="openInvite()">
          + Invite new
        </button>
      </header>

      <!-- Filters -->
      <div class="mb-3 flex flex-wrap gap-2">
        <button class="text-xs px-3 py-1 rounded-md border"
                [class.bg-ink-900]="!kindFilter()"
                [class.text-white]="!kindFilter()"
                [class.border-ink-900]="!kindFilter()"
                [class.text-ink-500]="kindFilter()"
                [class.border-ink-200]="kindFilter()"
                (click)="kindFilter.set(undefined)">
          All
        </button>
        @for (k of kindOptions; track k) {
          <button class="text-xs px-3 py-1 rounded-md border"
                  [class.bg-ink-900]="kindFilter() === k"
                  [class.text-white]="kindFilter() === k"
                  [class.border-ink-900]="kindFilter() === k"
                  [class.text-ink-500]="kindFilter() !== k"
                  [class.border-ink-200]="kindFilter() !== k"
                  (click)="kindFilter.set(k)">
            {{ kindLabels[k] }}
          </button>
        }
        <div class="text-xs text-ink-500 ml-auto self-center">
          {{ filteredRows().length }} record{{ filteredRows().length === 1 ? '' : 's' }}
          · {{ pendingCount() }} pending · {{ submittedCount() }} submitted
        </div>
      </div>

      @if (loading()) {
        <div class="card text-center py-10 text-sm text-ink-400 italic">Loading intake…</div>
      } @else if (loadError()) {
        <div class="card text-xs text-danger-500">{{ loadError() }}</div>
      } @else if (filteredRows().length === 0) {
        <div class="card text-center py-10 text-sm text-ink-500">
          No questionnaires yet — click <strong>Invite new</strong> to get started.
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50">
                <th class="text-left px-4 py-2 font-semibold">Business</th>
                <th class="text-left px-3 py-2 font-semibold">Kind</th>
                <th class="text-left px-3 py-2 font-semibold">Invited</th>
                <th class="text-left px-3 py-2 font-semibold">Status</th>
                <th class="text-left px-3 py-2 font-semibold">Submitted</th>
                <th class="text-right px-4 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (q of filteredRows(); track q._id) {
                <tr class="border-b border-ink-100 hover:bg-ink-50 cursor-pointer"
                    (click)="openDetail(q)">
                  <td class="px-4 py-2">
                    <div class="font-semibold text-ink-900 truncate">{{ q.businessName }}</div>
                    @if (q.invitedEmail) {
                      <div class="text-[11px] text-ink-500 truncate">{{ q.invitedEmail }}</div>
                    }
                  </td>
                  <td class="px-3 py-2 text-[10px] uppercase font-bold text-ink-500">
                    {{ kindLabels[q.kind] }}
                  </td>
                  <td class="px-3 py-2 text-[11px] text-ink-500">
                    {{ q.createdAt | date: 'mediumDate' }}
                  </td>
                  <td class="px-3 py-2">
                    @if (q.status === 'submitted') {
                      <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-positive-100 text-positive-500">Submitted</span>
                    } @else {
                      <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-600">Pending</span>
                    }
                  </td>
                  <td class="px-3 py-2 text-[11px] text-ink-500">
                    {{ q.submittedAt ? (q.submittedAt | date: 'mediumDate') : '—' }}
                  </td>
                  <td class="px-4 py-2 text-right text-[11px] text-brand-500">Open →</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Invite modal -->
      @if (inviting()) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="cancelInvite()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
               (click)="$event.stopPropagation()">
            <h3 class="text-lg font-bold mb-3">Invite a client to fill a questionnaire</h3>
            <div class="space-y-3">
              <div>
                <label class="label">Kind</label>
                <select class="input text-sm" [(ngModel)]="inviteForm.kind">
                  @for (k of kindOptions; track k) {
                    <option [value]="k">{{ kindLabels[k] }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Business name</label>
                <input class="input text-sm" [(ngModel)]="inviteForm.businessName" />
              </div>
              <div>
                <label class="label">Invited email (optional)</label>
                <input class="input text-sm" type="email" [(ngModel)]="inviteForm.invitedEmail" />
              </div>
              @if (inviteError()) {
                <div class="text-xs text-danger-500">⚠ {{ inviteError() }}</div>
              }
              @if (createdQuestionnaire(); as cq) {
                <div class="border border-positive-500 border-l-4 bg-positive-100/30 p-3 rounded">
                  <div class="text-xs font-bold text-positive-500 mb-1">
                    ✓ Invite created
                  </div>
                  <div class="text-[11px] text-ink-700 mb-1">
                    Share this link with {{ cq.invitedEmail || cq.businessName }}:
                  </div>
                  <input class="input text-xs font-mono" readonly [value]="shareUrl(cq)" />
                  <button class="text-[11px] text-brand-500 hover:underline mt-1"
                          (click)="copyLink(cq)">
                    {{ copied() ? '✓ Copied' : 'Copy link' }}
                  </button>
                </div>
              }
            </div>
            <div class="pt-4 border-t border-ink-100 mt-4 flex justify-end gap-2">
              <button class="btn-secondary text-xs" (click)="cancelInvite()">Close</button>
              @if (!createdQuestionnaire()) {
                <button class="btn-primary text-xs" [disabled]="creating()" (click)="createInvite()">
                  {{ creating() ? 'Creating…' : 'Create invite' }}
                </button>
              }
            </div>
          </div>
        </div>
      }

      <!-- Detail modal -->
      @if (viewing(); as v) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeDetail()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <div class="p-5 border-b border-ink-100 flex items-center justify-between">
              <div>
                <div class="text-[10px] uppercase font-bold text-brand-500">
                  {{ kindLabels[v.kind] }}
                </div>
                <h3 class="text-lg font-bold">{{ v.businessName }}</h3>
                <div class="text-[11px] text-ink-500">
                  Invited {{ v.createdAt | date: 'medium' }}
                  @if (v.invitedEmail) { · {{ v.invitedEmail }} }
                </div>
              </div>
              <button class="text-ink-400 hover:text-ink-900 text-2xl leading-none"
                      (click)="closeDetail()">×</button>
            </div>
            <div class="p-5">
              @if (v.status === 'pending') {
                <div class="card p-3 mb-3 border-amber-500 border-l-4 bg-amber-50/50">
                  <div class="text-xs text-amber-600 font-bold mb-1">Not submitted yet</div>
                  <div class="text-[11px] text-ink-700">
                    Share this link:
                    <input class="input text-xs font-mono mt-1" readonly [value]="shareUrl(v)" />
                  </div>
                </div>
              } @else {
                <div class="text-[11px] text-ink-500 mb-3">
                  Submitted {{ v.submittedAt | date: 'medium' }}
                </div>
                @for (section of sectionsFor(v); track section.title) {
                  <div class="mb-4">
                    <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-2">
                      {{ section.title }}
                    </div>
                    <div class="space-y-2">
                      @for (f of section.fields; track f.id) {
                        <div class="border-b border-ink-100 pb-2">
                          <div class="text-xs font-semibold text-ink-700">{{ f.label }}</div>
                          <div class="text-sm text-ink-900 whitespace-pre-line">
                            {{ answerFor(v, f.id) || '—' }}
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }
              }
            </div>
            <div class="p-5 border-t border-ink-100 flex justify-between gap-2">
              <button class="btn-secondary text-xs text-danger-500 border-danger-200 hover:bg-danger-100"
                      (click)="removeQuestionnaire(v)">
                Delete
              </button>
              <button class="btn-secondary text-xs" (click)="closeDetail()">Close</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class IntakeHubComponent implements OnInit {
  private svc = inject(QuestionnairesService);

  readonly kindOptions: QuestionnaireKind[] = ['seo', 'ppc', 'website', 'combo'];
  readonly kindLabels = QUESTIONNAIRE_KIND_LABELS;

  data = signal<Questionnaire[]>([]);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  kindFilter = signal<QuestionnaireKind | undefined>(undefined);

  inviting = signal<boolean>(false);
  inviteForm: NewInviteForm = {
    kind: 'seo',
    businessName: '',
    invitedEmail: '',
  };
  inviteError = signal<string | null>(null);
  creating = signal<boolean>(false);
  createdQuestionnaire = signal<Questionnaire | null>(null);
  copied = signal<boolean>(false);

  viewing = signal<Questionnaire | null>(null);

  filteredRows = computed(() => {
    const k = this.kindFilter();
    const list = this.data();
    return k ? list.filter((q) => q.kind === k) : list;
  });

  pendingCount = computed(
    () => this.filteredRows().filter((q) => q.status === 'pending').length,
  );
  submittedCount = computed(
    () => this.filteredRows().filter((q) => q.status === 'submitted').length,
  );

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.loadError.set(null);
    this.svc.list().subscribe({
      next: (list) => {
        this.data.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(
          err?.error?.message || 'Could not load questionnaires.',
        );
      },
    });
  }

  openInvite() {
    this.inviteForm = { kind: 'seo', businessName: '', invitedEmail: '' };
    this.inviteError.set(null);
    this.createdQuestionnaire.set(null);
    this.copied.set(false);
    this.inviting.set(true);
  }

  cancelInvite() {
    this.inviting.set(false);
    // Refresh so a newly-created invite shows up if the user closes
    // without acknowledging.
    if (this.createdQuestionnaire()) this.reload();
  }

  createInvite() {
    if (!this.inviteForm.businessName.trim()) {
      this.inviteError.set('Business name is required.');
      return;
    }
    this.creating.set(true);
    this.inviteError.set(null);
    this.svc
      .create({
        kind: this.inviteForm.kind,
        businessName: this.inviteForm.businessName.trim(),
        invitedEmail: this.inviteForm.invitedEmail.trim() || undefined,
      })
      .subscribe({
        next: (q) => {
          this.creating.set(false);
          this.createdQuestionnaire.set(q);
        },
        error: (err) => {
          this.creating.set(false);
          const m = err?.error?.message;
          this.inviteError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Create failed.',
          );
        },
      });
  }

  shareUrl(q: Questionnaire): string {
    const origin = window.location.origin;
    return `${origin}/q/${q.shareToken || ''}`;
  }

  copyLink(q: Questionnaire) {
    navigator.clipboard.writeText(this.shareUrl(q)).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  openDetail(q: Questionnaire) {
    this.viewing.set(q);
  }

  closeDetail() {
    this.viewing.set(null);
  }

  sectionsFor(q: Questionnaire) {
    return QUESTIONNAIRE_TEMPLATES[q.kind] || [];
  }

  answerFor(q: Questionnaire, fieldId: string): string {
    const v = q.answers?.[fieldId];
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v;
    return String(v);
  }

  removeQuestionnaire(q: Questionnaire) {
    if (!q._id) return;
    if (!confirm(`Delete this questionnaire for "${q.businessName}"?`)) return;
    this.svc.remove(q._id).subscribe({
      next: () => {
        this.viewing.set(null);
        this.reload();
      },
      error: (err) => alert(err?.error?.message || 'Delete failed.'),
    });
  }

  // Silences unused-import warning; the field is referenced from the
  // template via the questionnaire-templates map.
  private _typeGuard(_f: QuestionnaireField) {
    return _f;
  }
}
