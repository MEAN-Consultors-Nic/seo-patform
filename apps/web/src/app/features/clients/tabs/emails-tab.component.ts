import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  Input,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Client } from '@seo/shared';
import {
  CommsService,
  DraftSeoEmailPayload,
  SentEmailRow,
} from '../../../core/comms.service';

interface OptimizationCheck {
  label: string;
  checked: boolean;
}

/**
 * Client detail "Emails" tab — the Optimization Email Studio (Comms
 * Slice 3.3). Compose + preview + send + archive in one screen.
 * The AI drafter surfaces when ANTHROPIC_API_KEY is configured on the
 * server; otherwise the button hides and the composer works manually.
 */
@Component({
  selector: 'app-client-emails-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink],
  template: `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-ink-900">Client Emails</h2>
          <p class="text-xs text-ink-500">
            Send monthly SEO updates + optimization emails through your
            connected Gmail account. Every send is archived below.
          </p>
        </div>
        <button class="btn-primary text-xs" (click)="openCompose()">
          + New email
        </button>
      </div>

      <!-- Composer -->
      @if (composing()) {
        <div class="card p-4 border-brand-500 border-l-4">
          <div class="flex items-center justify-between mb-3">
            <div class="font-bold text-ink-900 text-sm">Compose email</div>
            <button class="text-ink-400 hover:text-ink-900 text-xl leading-none"
                    (click)="closeCompose()">×</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="md:col-span-2">
              <label class="text-[10px] uppercase font-semibold text-ink-500">To</label>
              <input class="input text-sm" [(ngModel)]="form.toText"
                     placeholder="client@company.com, cc@company.com" />
              <p class="text-[10px] text-ink-500 mt-0.5">
                Comma-separated. Prefilled from the client's contacts.
              </p>
            </div>

            <div class="md:col-span-2">
              <label class="text-[10px] uppercase font-semibold text-ink-500">Subject</label>
              <input class="input text-sm" [(ngModel)]="form.subject" />
            </div>

            <!-- KPI snapshot for AI draft -->
            <div class="md:col-span-2 pt-2 border-t border-ink-100">
              <div class="text-[10px] uppercase font-semibold text-ink-500 mb-2">
                Report period + KPI snapshot (for the AI drafter)
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div class="md:col-span-2">
                  <label class="text-[10px] text-ink-500">Period label</label>
                  <input class="input text-xs" [(ngModel)]="form.periodLabel"
                         placeholder="June 2026" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Clicks now</label>
                  <input class="input text-xs" type="number" [(ngModel)]="form.clicksNow" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Clicks prev</label>
                  <input class="input text-xs" type="number" [(ngModel)]="form.clicksPrev" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Impr. now</label>
                  <input class="input text-xs" type="number" [(ngModel)]="form.imprNow" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Impr. prev</label>
                  <input class="input text-xs" type="number" [(ngModel)]="form.imprPrev" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Pos. now</label>
                  <input class="input text-xs" type="number" step="0.1"
                         [(ngModel)]="form.posNow" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Pos. prev</label>
                  <input class="input text-xs" type="number" step="0.1"
                         [(ngModel)]="form.posPrev" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Top-10 now</label>
                  <input class="input text-xs" type="number" [(ngModel)]="form.top10Now" />
                </div>
                <div>
                  <label class="text-[10px] text-ink-500">Top-10 prev</label>
                  <input class="input text-xs" type="number" [(ngModel)]="form.top10Prev" />
                </div>
              </div>
            </div>

            <!-- Optimization checklist -->
            <div class="md:col-span-2 pt-2 border-t border-ink-100">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <div class="text-[10px] uppercase font-semibold text-ink-500">
                    Actions completed this period
                  </div>
                  <p class="text-[10px] text-ink-500">
                    Only ticked items get referenced in the AI-drafted body.
                  </p>
                </div>
                <button class="text-[11px] text-brand-500 hover:underline"
                        (click)="addCustomAction()">+ Add custom</button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
                @for (a of actions(); track $index; let i = $index) {
                  <label class="flex items-center gap-2 text-xs text-ink-700 py-0.5 cursor-pointer">
                    <input type="checkbox" [(ngModel)]="a.checked" />
                    @if (i < defaultActionsCount) {
                      <span>{{ a.label }}</span>
                    } @else {
                      <input class="input text-xs flex-1" [(ngModel)]="a.label" />
                      <button class="text-danger-500 text-sm leading-none"
                              (click)="removeAction(i)">×</button>
                    }
                  </label>
                }
              </div>
            </div>

            <!-- Body -->
            <div class="md:col-span-2 pt-2 border-t border-ink-100">
              <div class="flex items-center justify-between mb-1">
                <label class="text-[10px] uppercase font-semibold text-ink-500">
                  Body (HTML)
                </label>
                @if (aiConfigured()) {
                  <button class="btn-secondary text-[11px]"
                          [disabled]="drafting()"
                          (click)="draftWithAi()">
                    {{ drafting() ? 'Drafting…' : '✨ Draft with AI' }}
                  </button>
                }
              </div>
              <textarea class="input text-xs font-mono" rows="10"
                        [(ngModel)]="form.htmlBody"
                        placeholder="<p>Hi Team,</p><p>Here's your monthly update…</p>"></textarea>
              @if (draftError()) {
                <div class="text-xs text-danger-500 mt-1">{{ draftError() }}</div>
              }
            </div>

            @if (form.htmlBody) {
              <div class="md:col-span-2 pt-2 border-t border-ink-100">
                <div class="text-[10px] uppercase font-semibold text-ink-500 mb-2">Preview</div>
                <div class="bg-white border border-ink-200 rounded-lg p-4"
                     [innerHTML]="form.htmlBody"></div>
              </div>
            }

            @if (sendError()) {
              <div class="md:col-span-2 text-xs text-danger-500">⚠ {{ sendError() }}</div>
            }

            <div class="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-ink-100">
              <button class="btn-secondary text-xs" (click)="closeCompose()">Cancel</button>
              <button class="btn-primary text-xs" [disabled]="sending()" (click)="send()">
                {{ sending() ? 'Sending…' : 'Send email' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Archive -->
      @if (loading()) {
        <div class="card text-center py-6 text-xs text-ink-400 italic">Loading archive…</div>
      } @else if (rows().length === 0) {
        <div class="card text-center py-8 text-xs text-ink-500">
          No emails sent to this client yet.
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50">
                <th class="text-left px-4 py-2 font-semibold">Sent</th>
                <th class="text-left px-3 py-2 font-semibold">Subject</th>
                <th class="text-left px-3 py-2 font-semibold">To</th>
                <th class="text-left px-3 py-2 font-semibold">Kind</th>
                <th class="text-left px-3 py-2 font-semibold">Sender</th>
                <th class="text-left px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r._id) {
                <tr class="border-b border-ink-100 hover:bg-ink-50">
                  <td class="px-4 py-2 text-xs text-ink-500 whitespace-nowrap">
                    {{ r.createdAt | date: 'medium' }}
                  </td>
                  <td class="px-3 py-2 text-xs font-medium text-ink-900 truncate max-w-xs">
                    {{ r.subject }}
                  </td>
                  <td class="px-3 py-2 text-xs text-ink-500 truncate max-w-[180px]">
                    {{ r.to.join(', ') }}
                  </td>
                  <td class="px-3 py-2 text-[10px] uppercase font-bold text-ink-500">
                    {{ r.kind }}
                  </td>
                  <td class="px-3 py-2 text-xs text-ink-500">{{ senderName(r) }}</td>
                  <td class="px-4 py-2 text-xs">
                    @if (r.ok) {
                      <span class="text-positive-500 font-semibold">✓ Sent</span>
                    } @else {
                      <span class="text-danger-500 font-semibold" [title]="r.errorMessage || ''">✗ Failed</span>
                    }
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
export class ClientEmailsTabComponent implements OnInit {
  @Input({ required: true }) clientId!: string;
  @Input() client: Client | null = null;

  private svc = inject(CommsService);

  rows = signal<SentEmailRow[]>([]);
  loading = signal<boolean>(true);
  composing = signal<boolean>(false);
  drafting = signal<boolean>(false);
  sending = signal<boolean>(false);
  draftError = signal<string | null>(null);
  sendError = signal<string | null>(null);
  aiConfigured = signal<boolean>(false);

  // Curated defaults — mirrors the msh-internal-tools opt-email checklist.
  private readonly defaultActions: OptimizationCheck[] = [
    { label: 'Optimized on-page (titles, meta, headings, internal links)', checked: false },
    { label: 'Published new content or refreshed existing pieces', checked: false },
    { label: 'Technical fixes (crawl errors, schema, Core Web Vitals)', checked: false },
    { label: 'Local: GBP posts, reviews, citations', checked: false },
    { label: 'Backlink outreach + acquired new links', checked: false },
    { label: 'Rank tracking review + competitor watch', checked: false },
  ];
  readonly defaultActionsCount = this.defaultActions.length;

  actions = signal<OptimizationCheck[]>(
    this.defaultActions.map((a) => ({ ...a })),
  );

  form = {
    toText: '',
    subject: '',
    periodLabel: '',
    clicksNow: undefined as number | undefined,
    clicksPrev: undefined as number | undefined,
    imprNow: undefined as number | undefined,
    imprPrev: undefined as number | undefined,
    posNow: undefined as number | undefined,
    posPrev: undefined as number | undefined,
    top10Now: undefined as number | undefined,
    top10Prev: undefined as number | undefined,
    htmlBody: '',
  };

  ngOnInit() {
    this.reload();
    this.svc.aiStatus().subscribe({
      next: (s) => this.aiConfigured.set(s.configured),
      error: () => this.aiConfigured.set(false),
    });
  }

  private reload() {
    this.loading.set(true);
    this.svc.listEmails({ clientId: this.clientId, limit: 100 }).subscribe({
      next: (list) => {
        this.rows.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openCompose() {
    this.form = {
      toText: this.defaultRecipients(),
      subject: this.client
        ? `${this.client.name} — SEO update`
        : 'SEO update',
      periodLabel: new Date().toLocaleString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      clicksNow: undefined,
      clicksPrev: undefined,
      imprNow: undefined,
      imprPrev: undefined,
      posNow: undefined,
      posPrev: undefined,
      top10Now: undefined,
      top10Prev: undefined,
      htmlBody: '',
    };
    this.actions.set(this.defaultActions.map((a) => ({ ...a })));
    this.draftError.set(null);
    this.sendError.set(null);
    this.composing.set(true);
  }

  closeCompose() {
    if (this.sending()) return;
    this.composing.set(false);
    this.draftError.set(null);
    this.sendError.set(null);
  }

  addCustomAction() {
    this.actions.update((list) => [
      ...list,
      { label: '', checked: true },
    ]);
  }

  removeAction(i: number) {
    if (i < this.defaultActionsCount) return;
    this.actions.update((list) => list.filter((_, idx) => idx !== i));
  }

  private defaultRecipients(): string {
    const contacts =
      (this.client?.contacts || []).map((c) => c.email).filter(Boolean) as string[];
    return contacts.join(', ');
  }

  private toArray(): string[] {
    return this.form.toText
      .split(/[,\n;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  draftWithAi() {
    if (!this.client) return;
    const actionsCompleted = this.actions()
      .filter((a) => a.checked && a.label.trim())
      .map((a) => a.label.trim());
    if (!actionsCompleted.length) {
      this.draftError.set(
        'Tick at least one completed action so the AI has something to reference.',
      );
      return;
    }
    const payload: DraftSeoEmailPayload = {
      clientName: this.client.name,
      clientDomain: this.client.url,
      periodLabel: this.form.periodLabel || 'this period',
      clicks: {
        current: this.form.clicksNow,
        previous: this.form.clicksPrev,
      },
      impressions: {
        current: this.form.imprNow,
        previous: this.form.imprPrev,
      },
      avgPosition: {
        current: this.form.posNow,
        previous: this.form.posPrev,
      },
      top10: { current: this.form.top10Now, previous: this.form.top10Prev },
      actionsCompleted,
    };
    this.drafting.set(true);
    this.draftError.set(null);
    this.svc.draftSeoEmail(payload).subscribe({
      next: (r) => {
        this.form.subject = r.subject || this.form.subject;
        this.form.htmlBody = r.htmlBody;
        this.drafting.set(false);
      },
      error: (err) => {
        this.drafting.set(false);
        const m = err?.error?.message;
        this.draftError.set(
          Array.isArray(m) ? m.join(', ') : m || 'AI draft failed.',
        );
      },
    });
  }

  send() {
    const to = this.toArray();
    if (!to.length) {
      this.sendError.set('At least one recipient is required.');
      return;
    }
    if (!this.form.subject.trim()) {
      this.sendError.set('Subject is required.');
      return;
    }
    if (!this.form.htmlBody.trim()) {
      this.sendError.set('Body is empty. Draft with AI or write one.');
      return;
    }
    this.sending.set(true);
    this.sendError.set(null);
    this.svc
      .send({
        clientId: this.clientId,
        kind: 'seo-report',
        to,
        subject: this.form.subject.trim(),
        htmlBody: this.form.htmlBody,
      })
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          if (!res.result.ok) {
            this.sendError.set(
              res.result.error || 'Gmail rejected the send.',
            );
            return;
          }
          this.composing.set(false);
          this.reload();
        },
        error: (err) => {
          this.sending.set(false);
          const m = err?.error?.message;
          this.sendError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Send failed.',
          );
        },
      });
  }

  senderName(r: SentEmailRow): string {
    if (r.senderUserId && typeof r.senderUserId === 'object') {
      return r.senderUserId.name || r.senderUserId.email;
    }
    return r.senderEmail || '';
  }
}
