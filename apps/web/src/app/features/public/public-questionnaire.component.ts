import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  QUESTIONNAIRE_KIND_LABELS,
  Questionnaire,
} from '@seo/shared';
import { QuestionnairesService } from '../../core/questionnaires.service';
import { QUESTIONNAIRE_TEMPLATES } from '../questionnaires/questionnaire-templates';

/**
 * Public token-gated client intake form at /q/:token (Sales Slice 4.5).
 * Renders the questions dictated by the questionnaire's kind
 * (seo/ppc/website/combo). On submit, POSTs the answers dict.
 */
@Component({
  selector: 'app-public-questionnaire',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-ink-50 py-10 px-4">
      <div class="max-w-2xl mx-auto">
        <div class="flex items-center gap-2 mb-6">
          <div class="w-9 h-9 rounded-md bg-brand-500 text-white flex items-center justify-center font-bold">IT</div>
          <div class="text-sm font-bold text-ink-900">Internal Tools</div>
          <span class="text-[10px] uppercase text-ink-500 ml-2">Media Spearhead</span>
        </div>

        @if (loading()) {
          <div class="card text-center py-12 text-sm text-ink-400 italic">Loading questionnaire…</div>
        } @else if (loadError()) {
          <div class="card text-center py-10 text-sm text-danger-500">{{ loadError() }}</div>
        } @else if (submitted()) {
          <div class="card p-8 text-center border-positive-500 border-l-4 bg-positive-100/30">
            <div class="text-2xl mb-2">✓</div>
            <h2 class="text-lg font-bold text-positive-500 mb-1">Thank you!</h2>
            <p class="text-sm text-ink-700">
              Your answers have been recorded. Media Spearhead will be in touch soon.
            </p>
          </div>
        } @else if (questionnaire(); as q) {
          <div class="card p-6 mb-4">
            <div class="text-[10px] uppercase font-bold text-brand-500 mb-1">
              {{ kindLabels[q.kind] }}
            </div>
            <h1 class="text-2xl font-bold text-ink-900 mb-1">
              Onboarding for {{ q.businessName }}
            </h1>
            <p class="text-sm text-ink-500">
              A few questions so the team can hit the ground running. Answers
              save when you click Submit at the bottom.
            </p>
          </div>

          <form (ngSubmit)="submit()">
            @for (section of sections(); track section.title) {
              <div class="card p-5 mb-3">
                <h2 class="text-sm uppercase tracking-wider font-bold text-ink-500 mb-3">
                  {{ section.title }}
                </h2>
                <div class="space-y-3">
                  @for (f of section.fields; track f.id) {
                    <div>
                      <label class="label">
                        {{ f.label }}
                        @if (f.required) { <span class="text-danger-500">*</span> }
                      </label>
                      @if (f.type === 'longtext') {
                        <textarea class="input text-sm" rows="3"
                                  [(ngModel)]="answers[f.id]"
                                  [name]="f.id"></textarea>
                      } @else if (f.type === 'yesno') {
                        <select class="input text-sm"
                                [(ngModel)]="answers[f.id]"
                                [name]="f.id">
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      } @else if (f.type === 'select') {
                        <select class="input text-sm"
                                [(ngModel)]="answers[f.id]"
                                [name]="f.id">
                          <option value="">—</option>
                          @for (opt of (f.options || []); track opt) {
                            <option [value]="opt">{{ opt }}</option>
                          }
                        </select>
                      } @else {
                        <input class="input text-sm"
                               [type]="f.type === 'url' ? 'url' : 'text'"
                               [(ngModel)]="answers[f.id]"
                               [name]="f.id" />
                      }
                      @if (f.hint) {
                        <p class="text-[11px] text-ink-500 mt-0.5">{{ f.hint }}</p>
                      }
                    </div>
                  }
                </div>
              </div>
            }

            @if (submitError()) {
              <div class="card text-xs text-danger-500 mb-3">⚠ {{ submitError() }}</div>
            }

            <button type="submit" class="btn-primary w-full text-sm"
                    [disabled]="saving()">
              {{ saving() ? 'Submitting…' : 'Submit answers' }}
            </button>

            <div class="text-center text-[10px] text-ink-400 mt-6">
              Media Spearhead · Internal Tools · Onboarding
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class PublicQuestionnaireComponent implements OnInit {
  private svc = inject(QuestionnairesService);
  private route = inject(ActivatedRoute);

  readonly kindLabels = QUESTIONNAIRE_KIND_LABELS;

  questionnaire = signal<Questionnaire | null>(null);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  saving = signal<boolean>(false);
  submitError = signal<string | null>(null);
  submitted = signal<boolean>(false);

  answers: Record<string, unknown> = {};

  sections = () => {
    const q = this.questionnaire();
    return q ? QUESTIONNAIRE_TEMPLATES[q.kind] : [];
  };

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.loading.set(false);
      this.loadError.set('Missing questionnaire token.');
      return;
    }
    this.svc.publicView(token).subscribe({
      next: (q) => {
        this.questionnaire.set(q);
        this.answers = { ...(q.answers || {}) };
        if (q.status === 'submitted') this.submitted.set(true);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(
          err?.error?.message || 'Questionnaire not found or expired.',
        );
      },
    });
  }

  submit() {
    const q = this.questionnaire();
    const token = this.route.snapshot.paramMap.get('token');
    if (!q || !token) return;
    this.saving.set(true);
    this.submitError.set(null);
    this.svc.publicSubmit(token, this.answers).subscribe({
      next: () => {
        this.saving.set(false);
        this.submitted.set(true);
      },
      error: (err) => {
        this.saving.set(false);
        this.submitError.set(
          err?.error?.message || 'Could not submit answers.',
        );
      },
    });
  }
}
