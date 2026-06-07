import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { QuillEditorComponent } from 'ngx-quill';
import { Client, Cycle, Report, Task } from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { CyclesService } from '../../core/cycles.service';
import { ReportsService } from '../../core/reports.service';
import { TasksService } from '../../core/tasks.service';
import { SanitizerService } from '../../core/sanitizer.service';

interface KpiGroup {
  label: string;
  description: string;
  fields: Array<{ key: string; label: string; suffix?: string }>;
}

@Component({
  selector: 'app-report-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillEditorComponent, RouterLink],
  template: `
    <div class="page-container max-w-6xl">
      <!-- Sticky action bar -->
      <header class="sticky top-0 -mx-8 -mt-6 px-8 py-4 bg-ink-50/95 backdrop-blur z-30 mb-6 border-b border-ink-200">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="min-w-0">
              <h1 class="text-xl font-bold text-ink-900 leading-tight truncate">
                Bi-weekly report
                @if (selectedClientName(); as name) {
                  <span class="text-brand-500">· {{ name }}</span>
                }
              </h1>
              <p class="text-xs text-ink-500 mt-0.5">
                @if (selectedCycleLabel(); as cl) {
                  Cycle <strong>{{ cl }}</strong>
                } @else {
                  Select a client and cycle to start
                }
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <button class="btn-secondary" (click)="autoCompose()" [disabled]="!ready() || saving()" title="Generate base content from tasks">
              ⚡ Auto-compose
            </button>
            <button class="btn-primary" (click)="save()" [disabled]="!ready() || saving()">
              @if (saving()) { Saving… } @else { 💾 Save }
            </button>
            <button class="btn-secondary" (click)="viewPdf()" [disabled]="!ready() || downloading()">
              {{ downloading() ? '…' : '👁 View PDF' }}
            </button>
            <button class="btn-secondary" (click)="downloadPdf()" [disabled]="!ready() || downloading()">
              ⬇
            </button>
            <button class="btn-primary" (click)="share()" [disabled]="!ready() || sharing()">
              {{ sharing() ? '…' : '🔗 Share' }}
            </button>
          </div>
        </div>

        @if (saveMessage()) {
          <div class="mt-3 rounded-md bg-positive-100 border border-positive-500/20 px-3 py-2 text-sm text-positive-500">
            ✓ {{ saveMessage() }}
          </div>
        }
        @if (pdfError()) {
          <div class="mt-3 rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
            {{ pdfError() }}
          </div>
        }
      </header>

      <!-- Selectors -->
      <div class="card mb-6 relative">
        @if (loadingReport()) {
          <div class="absolute top-0 left-0 right-0">
            <div class="loading-bar"></div>
          </div>
        }
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label">Client</label>
            <select class="input" [ngModel]="clientId()" (ngModelChange)="onClientChange($event)"
                    [disabled]="loadingReport()">
              <option value="">Select client</option>
              @for (c of clients(); track c._id) {
                <option [value]="c._id">{{ c.name }} (Tier {{ c.tier }})</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Cycle</label>
            <select class="input" [ngModel]="cycleId()" (ngModelChange)="onCycleChange($event)"
                    [disabled]="loadingReport()">
              <option value="">Select cycle</option>
              @for (c of cycles(); track c._id) {
                <option [value]="c._id">{{ c.label }} ({{ c.status }})</option>
              }
            </select>
          </div>
        </div>
        @if (loadingReport()) {
          <div class="flex items-center gap-2 mt-3 text-xs text-ink-500">
            <span class="spinner"></span>
            <span>Loading client report…</span>
          </div>
        }
      </div>

      <!-- Share banner -->
      @if (shareToken()) {
        <div class="card mb-6 bg-ink-900 text-white border-ink-900">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div class="text-[10px] uppercase tracking-wider font-bold text-brand-300">
              🔗 Public link active · 🔒 PIN protected
            </div>
            <button (click)="revokeShare()" class="text-xs text-danger-100 hover:text-white opacity-70 hover:opacity-100">
              Revoke access
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              #shareInput
              type="text"
              readonly
              [value]="shareUrl()"
              class="bg-ink-700 text-white text-sm rounded px-3 py-2 flex-1 min-w-0 font-mono border border-white/10"
              (click)="shareInput.select()" />
            <button class="btn-primary" (click)="copyShareUrl(shareInput)">
              {{ copied() ? '✓ Copied' : 'Copy' }}
            </button>
            <a [href]="shareUrl()" target="_blank" class="btn-secondary"
               title="Open the public report. Logged-in owners and managers skip the PIN gate.">
              👁 Preview ↗
            </a>
            <button class="btn-primary" (click)="openSendModal()">
              ✉ Send to client
            </button>
          </div>

          <!-- PIN banner -->
          @if (sharePin(); as pin) {
            <div class="mt-4 p-4 bg-brand-500/10 border border-brand-500/30 rounded-md">
              <div class="flex items-start gap-3">
                <div class="text-brand-300 text-lg leading-none mt-0.5">🔐</div>
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-brand-300 mb-1">
                    Save this PIN — it will not be shown again
                  </div>
                  <div class="flex items-center gap-2 mt-2">
                    <code class="text-2xl font-black tracking-[0.4em] text-white bg-ink-700 px-4 py-2 rounded border border-white/10">
                      {{ pin }}
                    </code>
                    <button (click)="copyPin(pin)" class="btn-secondary btn-sm">
                      {{ pinCopied() ? '✓ Copied' : 'Copy PIN' }}
                    </button>
                    <button (click)="dismissPin()" class="text-xs text-white/50 hover:text-white px-2">
                      I saved it ✓
                    </button>
                  </div>
                  <p class="text-[10px] text-white/60 mt-2 leading-relaxed">
                    Share this PIN with the client securely. The client will be required to enter it before viewing the report.
                  </p>
                </div>
              </div>
            </div>
          } @else {
            <div class="mt-3 flex items-center justify-between gap-3 text-xs text-white/60">
              <span>The client needs the 6-digit PIN to unlock this report.</span>
              <button (click)="resetPin()"
                      [disabled]="resettingPin()"
                      class="text-brand-300 hover:text-white underline disabled:opacity-50">
                {{ resettingPin() ? 'Generating…' : 'Reset PIN' }}
              </button>
            </div>
          }
        </div>
      }

      @if (ready()) {
        <div class="space-y-6 transition-opacity"
             [class.opacity-50]="loadingReport()"
             [class.pointer-events-none]="loadingReport()">

          <!-- 1. Introduction / Executive Summary -->
          <section class="card">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                  <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">01</span>
                  Introduction
                </h2>
                <p class="text-xs text-ink-500 mt-1">
                  Brief message for the client. Appears at the top of the report. Use the toolbar for bold, italic, lists and clickable links.
                </p>
              </div>
            </div>
            <quill-editor
              [(ngModel)]="summaryText"
              format="html"
              placeholder="During this period we focused on…"></quill-editor>
          </section>

          <!-- 2. KPIs grouped -->
          <section class="card">
            <div class="mb-4">
              <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">02</span>
                Period metrics
              </h2>
              <p class="text-xs text-ink-500 mt-1">
                KPIs with a previous period are compared automatically and show a green/red arrow.
              </p>
            </div>

            @for (group of kpiGroups; track group.label) {
              <div class="mb-5">
                <div class="flex items-baseline justify-between mb-2 pb-1 border-b border-ink-100">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-ink-700">{{ group.label }}</h3>
                  <span class="text-[10px] text-ink-400">{{ group.description }}</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  @for (k of group.fields; track k.key) {
                    <div>
                      <label class="label">{{ k.label }}</label>
                      <div class="relative">
                        <input type="number"
                               class="input"
                               [name]="'kpi_' + k.key"
                               [(ngModel)]="kpis[k.key]"
                               step="any"
                               placeholder="—" />
                        @if (k.suffix) {
                          <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">{{ k.suffix }}</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </section>

          <!-- 3 & 4. Side by side — auto-derived from tasks (read-only preview) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section class="card">
              <div class="flex items-start justify-between mb-3 gap-3">
                <div>
                  <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                    <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">03</span>
                    Actions taken
                  </h2>
                  <p class="text-xs text-ink-500 mt-1">
                    Tasks marked as completed in this cycle. Auto-derived from the Tasks tab.
                  </p>
                </div>
                <a [routerLink]="['/clients', clientId()]"
                   class="text-[10px] text-brand-500 hover:text-brand-700 whitespace-nowrap font-semibold uppercase tracking-wider">
                  Edit in Tasks →
                </a>
              </div>
              @if (completedTasks().length) {
                <div class="space-y-2">
                  @for (t of completedTasks(); track t._id) {
                    <div class="flex items-start gap-2 p-2.5 bg-ink-50 rounded-md border border-ink-100">
                      <span class="text-positive-500 text-sm flex-shrink-0 mt-0.5">✓</span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 rounded"
                                [ngClass]="categoryBadgeClass(t.category)">{{ t.category }}</span>
                          @if (t.attachments?.length) {
                            <span class="text-[10px] text-ink-400">📎 {{ t.attachments?.length }}</span>
                          }
                        </div>
                        <div class="text-sm font-medium text-ink-900">{{ t.title }}</div>
                        @if (t.description) {
                          <div class="rich-content text-xs text-ink-500 mt-0.5"
                               [innerHTML]="sanitize(t.description)"></div>
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="text-center py-8 text-sm text-ink-400 italic border-2 border-dashed border-ink-200 rounded-lg">
                  No completed tasks yet.<br />
                  <a [routerLink]="['/clients', clientId()]" class="text-brand-500 hover:underline">Go to Tasks →</a>
                </div>
              }
            </section>

            <section class="card">
              <div class="flex items-start justify-between mb-3 gap-3">
                <div>
                  <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                    <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">04</span>
                    Next period plan
                  </h2>
                  <p class="text-xs text-ink-500 mt-1">
                    Tasks still pending. They carry over to the next cycle as the plan.
                  </p>
                </div>
                <a [routerLink]="['/clients', clientId()]"
                   class="text-[10px] text-brand-500 hover:text-brand-700 whitespace-nowrap font-semibold uppercase tracking-wider">
                  Edit in Tasks →
                </a>
              </div>
              @if (pendingTasks().length) {
                <div class="space-y-2">
                  @for (t of pendingTasks(); track t._id) {
                    <div class="flex items-start gap-2 p-2.5 bg-ink-50 rounded-md border border-ink-100">
                      <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                            [ngClass]="priorityBadgeClass(t.priority)">
                        {{ priorityShort(t.priority) }}
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 rounded"
                                [ngClass]="categoryBadgeClass(t.category)">{{ t.category }}</span>
                        </div>
                        <div class="text-sm font-medium text-ink-900">{{ t.title }}</div>
                        @if (t.description) {
                          <div class="rich-content text-xs text-ink-500 mt-0.5"
                               [innerHTML]="sanitize(t.description)"></div>
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="text-center py-8 text-sm text-ink-400 italic border-2 border-dashed border-ink-200 rounded-lg">
                  No pending tasks.<br />
                  <a [routerLink]="['/clients', clientId()]" class="text-brand-500 hover:underline">Plan in Tasks →</a>
                </div>
              }
            </section>
          </div>

          <!-- 5. Pending from client -->
          <section class="card">
            <div class="mb-3">
              <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">05</span>
                Pending from client
                <span class="text-xs text-ink-400 font-normal">(optional)</span>
              </h2>
              <p class="text-xs text-ink-500 mt-1">
                Things you need from the client: access, approvals, content…
              </p>
            </div>
            <quill-editor [(ngModel)]="clientBlockers" format="html"
                          placeholder="Example: Waiting for approval of the new home copy…"></quill-editor>
          </section>

          <!-- 6. Final Considerations -->
          <section class="card">
            <div class="mb-3">
              <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">06</span>
                Final considerations
              </h2>
              <p class="text-xs text-ink-500 mt-1">
                Wrap up the report on a professional note — takeaways, strategic recommendations, gratitude, next-quarter outlook.
              </p>
            </div>
            <quill-editor [(ngModel)]="finalConsiderations" format="html"
                          placeholder="To wrap up this period, we want to highlight…"></quill-editor>
          </section>
        </div>
      } @else {
        <div class="card text-center py-16">
          <div class="text-4xl mb-3">📄</div>
          <h2 class="text-lg font-semibold text-ink-900">Select a client and cycle</h2>
          <p class="text-sm text-ink-500 mt-1">to start editing the bi-weekly report</p>
        </div>
      }
    </div>

    <!-- SEND TO CLIENT MODAL -->
    @if (showSendModal()) {
      <div class="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4"
           (click)="closeSendModal()">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg" (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-ink-200 flex items-center justify-between">
            <h2 class="text-lg font-bold text-ink-900">Send report notification</h2>
            <button (click)="closeSendModal()" class="text-ink-400 hover:text-ink-700 text-xl leading-none">×</button>
          </div>

          <div class="px-6 py-5 space-y-4">
            <!-- Warning -->
            <div class="bg-warning-100 border border-warning-200 rounded-md px-4 py-3 text-xs text-warning-900 leading-relaxed">
              <strong>A new PIN will be generated and included in the email.</strong>
              Any PIN you may have shared manually will stop working immediately.
            </div>

            <!-- Client contacts -->
            <div>
              <label class="label">Recipients (from client contacts)</label>
              @if (selectedClient()?.contacts?.length) {
                <div class="space-y-2">
                  @for (c of selectedClient()?.contacts || []; track c.email) {
                    @if (c.email) {
                      <label class="flex items-center gap-3 p-2.5 rounded-md border border-ink-200 hover:bg-ink-50 cursor-pointer">
                        <input type="checkbox"
                               [checked]="contactSelection[c.email]"
                               (change)="toggleContact(c.email, $event)" />
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-semibold text-ink-900">{{ c.name }}</div>
                          <div class="text-xs text-ink-500 truncate">{{ c.email }}{{ c.role ? ' · ' + c.role : '' }}</div>
                        </div>
                      </label>
                    }
                  }
                </div>
              } @else {
                <div class="text-xs text-ink-500 italic px-3 py-4 bg-ink-50 rounded-md border border-ink-200">
                  No contacts found for this client. Add them in the client settings or use the field below.
                </div>
              }
            </div>

            <!-- Custom recipients -->
            <div>
              <label class="label">Additional recipients (comma-separated)</label>
              <input class="input"
                     type="text"
                     [(ngModel)]="customRecipients"
                     placeholder="another@example.com, second@example.com" />
            </div>

            @if (sendError()) {
              <div class="text-xs text-danger-500">{{ sendError() }}</div>
            }
            @if (sendSuccess()) {
              <div class="text-xs text-positive-500 font-semibold">{{ sendSuccess() }}</div>
            }
          </div>

          <div class="px-6 py-4 border-t border-ink-200 flex items-center justify-between gap-2">
            <div class="text-xs text-ink-500">
              {{ resolvedRecipientCount() }} recipient(s)
            </div>
            <div class="flex gap-2">
              <button class="btn-secondary" (click)="closeSendModal()">Cancel</button>
              <button class="btn-primary" (click)="sendNotification()" [disabled]="sending() || resolvedRecipientCount() === 0">
                {{ sending() ? 'Sending…' : 'Send email' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ReportEditorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private clientsSvc = inject(ClientsService);
  private cyclesSvc = inject(CyclesService);
  private reportsSvc = inject(ReportsService);
  private tasksSvc = inject(TasksService);
  private sanitizer = inject(SanitizerService);

  sanitize(html: string | undefined | null) {
    return this.sanitizer.trustRichHtml(html);
  }

  clients = signal<Client[]>([]);
  cycles = signal<Cycle[]>([]);
  clientId = signal<string>('');
  cycleId = signal<string>('');
  report = signal<Report | null>(null);
  downloading = signal(false);
  pdfError = signal<string | null>(null);
  saving = signal(false);
  saveMessage = signal<string | null>(null);
  loadingReport = signal(false);
  sharing = signal(false);
  shareToken = signal<string | null>(null);
  sharePin = signal<string | null>(null);
  pinCopied = signal(false);
  resettingPin = signal(false);
  copied = signal(false);

  // Send-notification modal state
  showSendModal = signal(false);
  sending = signal(false);
  sendError = signal<string | null>(null);
  sendSuccess = signal<string | null>(null);
  contactSelection: Record<string, boolean> = {};
  customRecipients = '';

  selectedClient = computed(() => {
    const id = this.clientId();
    return this.clients().find((c) => c._id === id) || null;
  });

  selectedClientName = computed(() => this.selectedClient()?.name || '');

  selectedCycleLabel = computed(() => {
    const id = this.cycleId();
    return this.cycles().find((c) => c._id === id)?.label || '';
  });

  shareUrl = (): string => {
    const t = this.shareToken();
    if (!t) return '';
    return `${window.location.origin}/r/${t}`;
  };

  summaryText = '';
  findings = '';
  nextPeriodPlan = '';
  clientBlockers = '';
  finalConsiderations = '';
  kpis: Record<string, number | null> = {};

  cycleTasks = signal<Task[]>([]);
  completedTasks = computed(() =>
    this.cycleTasks().filter((t) => t.status === 'completed'),
  );
  pendingTasks = computed(() => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return this.cycleTasks()
      .filter((t) => t.status !== 'completed')
      .sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
  });

  priorityShort(p: string): string {
    if (p === 'high') return 'High';
    if (p === 'medium') return 'Med';
    return 'Low';
  }

  priorityBadgeClass(p: string): string {
    if (p === 'high') return 'bg-danger-100 text-danger-500';
    if (p === 'medium') return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-500';
  }

  categoryBadgeClass(cat: string): string {
    const map: Record<string, string> = {
      technical: 'bg-ink-100 text-ink-900',
      onpage: 'bg-sky-50 text-sky-600',
      content: 'bg-brand-50 text-brand-700',
      offpage: 'bg-warning-100 text-warning-500',
      'local-gbp': 'bg-positive-100 text-positive-500',
      monitoring: 'bg-ink-100 text-ink-700',
      reporting: 'bg-purple-100 text-purple-700',
    };
    return map[cat] || 'bg-ink-100 text-ink-700';
  }

  kpiGroups: KpiGroup[] = [
    {
      label: 'Organic traffic',
      description: 'Google Analytics 4',
      fields: [
        { key: 'organicSessions', label: 'Organic sessions' },
        { key: 'conversions', label: 'Conversions' },
      ],
    },
    {
      label: 'Search Console',
      description: 'GSC',
      fields: [
        { key: 'impressions', label: 'Impressions' },
        { key: 'clicks', label: 'Clicks' },
        { key: 'ctr', label: 'CTR', suffix: '%' },
        { key: 'avgPosition', label: 'Avg position' },
        { key: 'indexedPages', label: 'Indexed pages' },
      ],
    },
    {
      label: 'Google Business Profile',
      description: 'Only for clients with local presence',
      fields: [
        { key: 'gbpSearches', label: 'Searches' },
        { key: 'gbpCalls', label: 'Calls' },
        { key: 'gbpDirections', label: 'Directions' },
        { key: 'gbpWebsiteClicks', label: 'Website clicks' },
        { key: 'gbpReviews', label: 'New reviews' },
      ],
    },
  ];

  ngOnInit() {
    this.clientsSvc.list().subscribe((cs) => this.clients.set(cs));
    this.cyclesSvc.list().subscribe((cs) => this.cycles.set(cs));
    const cid = this.route.snapshot.queryParamMap.get('clientId');
    if (cid) this.clientId.set(cid);
    this.cyclesSvc.current().subscribe({
      next: (c) => { if (c._id) this.cycleId.set(c._id); this.tryLoad(); },
      error: () => null,
    });
  }

  ready(): boolean {
    return !!(this.clientId() && this.cycleId());
  }

  onClientChange(v: string) { this.clientId.set(v); this.tryLoad(); }
  onCycleChange(v: string) { this.cycleId.set(v); this.tryLoad(); }

  tryLoad() {
    if (!this.ready()) return;
    this.loadingReport.set(true);
    this.saveMessage.set(null);
    this.pdfError.set(null);
    this.reportsSvc.byCycle(this.clientId(), this.cycleId()).subscribe({
      next: (r) => {
        this.report.set(r);
        this.populate(r);
        this.loadingReport.set(false);
      },
      error: () => this.loadingReport.set(false),
    });
    // Load tasks for this cycle (preview for sections 03 & 04)
    this.tasksSvc
      .list({ clientId: this.clientId(), cycleId: this.cycleId() })
      .subscribe((tasks) => this.cycleTasks.set(tasks));
  }

  populate(r: Report | null) {
    // Backwards compat: handle legacy array data
    const raw = r?.executiveSummary as unknown;
    if (Array.isArray(raw)) this.summaryText = raw.join(' ');
    else this.summaryText = (raw as string) || '';
    this.findings = r?.findings || '';
    this.nextPeriodPlan = r?.nextPeriodPlan || '';
    this.clientBlockers = r?.clientBlockers || '';
    this.finalConsiderations = r?.finalConsiderations || '';
    this.kpis = { ...(r?.kpis || {}) };
    this.shareToken.set(r?.shareToken || null);
    this.sharePin.set(null);
    this.pinCopied.set(false);
    this.copied.set(false);
  }

  async share() {
    if (!this.ready()) return;
    this.sharing.set(true);
    const ok = await this.ensureReportSaved();
    if (!ok) {
      this.sharing.set(false);
      this.pdfError.set('Could not save the report before sharing.');
      return;
    }
    this.reportsSvc.share(this.clientId(), this.cycleId()).subscribe({
      next: (res) => {
        this.shareToken.set(res.shareToken);
        if (res.pin) {
          // Newly generated PIN — show ONCE.
          this.sharePin.set(res.pin);
          this.pinCopied.set(false);
        }
        this.sharing.set(false);
      },
      error: (err) => {
        this.sharing.set(false);
        this.pdfError.set(err?.error?.message || 'Error generating the link');
      },
    });
  }

  copyShareUrl(input: HTMLInputElement) {
    input.select();
    const url = this.shareUrl();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    } else {
      document.execCommand('copy');
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  revokeShare() {
    if (!confirm('Are you sure? The current link will stop working.')) return;
    this.reportsSvc.revokeShare(this.clientId(), this.cycleId()).subscribe(() => {
      this.shareToken.set(null);
      this.sharePin.set(null);
    });
  }

  copyPin(pin: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pin).then(() => {
        this.pinCopied.set(true);
        setTimeout(() => this.pinCopied.set(false), 2000);
      });
    }
  }

  dismissPin() {
    this.sharePin.set(null);
    this.pinCopied.set(false);
  }

  resetPin() {
    if (!confirm('Generate a new PIN? The previous PIN will stop working immediately.')) return;
    this.resettingPin.set(true);
    this.reportsSvc.resetSharePin(this.clientId(), this.cycleId()).subscribe({
      next: (res) => {
        this.sharePin.set(res.pin);
        this.pinCopied.set(false);
        this.resettingPin.set(false);
      },
      error: () => this.resettingPin.set(false),
    });
  }

  openSendModal() {
    const client = this.selectedClient();
    this.contactSelection = {};
    if (client?.contacts) {
      for (const c of client.contacts) {
        if (c.email) this.contactSelection[c.email] = true;
      }
    }
    this.customRecipients = '';
    this.sendError.set(null);
    this.sendSuccess.set(null);
    this.showSendModal.set(true);
  }

  closeSendModal() {
    if (this.sending()) return;
    this.showSendModal.set(false);
  }

  toggleContact(email: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.contactSelection = { ...this.contactSelection, [email]: checked };
  }

  private resolveRecipients(): string[] {
    const selected = Object.entries(this.contactSelection)
      .filter(([, on]) => on)
      .map(([email]) => email);
    const custom = this.customRecipients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set([...selected, ...custom]));
  }

  resolvedRecipientCount(): number {
    return this.resolveRecipients().length;
  }

  sendNotification() {
    const recipients = this.resolveRecipients();
    if (!recipients.length) return;
    this.sending.set(true);
    this.sendError.set(null);
    this.sendSuccess.set(null);
    this.reportsSvc
      .sendNotification(this.clientId(), this.cycleId(), recipients)
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          // Clear any previously-shown PIN — it's been replaced; the new PIN
          // is only in the email now.
          this.sharePin.set(null);
          this.sendSuccess.set(
            `Sent to ${res.sentTo.length} recipient(s). New PIN delivered in the email.`,
          );
          setTimeout(() => {
            this.showSendModal.set(false);
            this.sendSuccess.set(null);
          }, 2200);
        },
        error: (err) => {
          this.sending.set(false);
          this.sendError.set(
            err?.error?.message || 'Could not send the email. Check SMTP config.',
          );
        },
      });
  }

  private cleanKpis(): Report['kpis'] {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.kpis)) {
      if (typeof v === 'number' && !Number.isNaN(v)) cleaned[k] = v;
    }
    return cleaned as Report['kpis'];
  }

  save() {
    if (!this.ready()) return;
    this.saving.set(true);
    this.saveMessage.set(null);
    this.pdfError.set(null);
    this.reportsSvc
      .upsert({
        clientId: this.clientId(),
        cycleId: this.cycleId(),
        executiveSummary: this.summaryText.trim(),
        findings: this.findings,
        nextPeriodPlan: this.nextPeriodPlan,
        clientBlockers: this.clientBlockers,
        finalConsiderations: this.finalConsiderations,
        kpis: this.cleanKpis(),
      })
      .subscribe({
        next: (r) => {
          this.report.set(r);
          this.populate(r);
          this.saving.set(false);
          const kpiCount = Object.keys(r.kpis || {}).length;
          this.saveMessage.set(
            `Report saved · ${kpiCount} KPI${kpiCount === 1 ? '' : 's'} recorded`,
          );
          setTimeout(() => this.saveMessage.set(null), 4000);
        },
        error: (err) => {
          this.saving.set(false);
          this.pdfError.set(err?.error?.message || 'Error saving the report');
        },
      });
  }

  autoCompose() {
    if (!this.ready()) return;
    this.reportsSvc.autoCompose(this.clientId(), this.cycleId()).subscribe((r) => {
      this.report.set(r);
      this.populate(r);
    });
  }

  async ensureReportSaved(): Promise<boolean> {
    if (this.report()) return true;
    return new Promise((resolve) => {
      this.reportsSvc
        .upsert({
          clientId: this.clientId(),
          cycleId: this.cycleId(),
          executiveSummary: this.summaryText.trim(),
          findings: this.findings,
          nextPeriodPlan: this.nextPeriodPlan,
          clientBlockers: this.clientBlockers,
          kpis: this.cleanKpis(),
        })
        .subscribe({
          next: (r) => {
            this.report.set(r);
            resolve(true);
          },
          error: () => resolve(false),
        });
    });
  }

  async viewPdf() {
    if (!this.ready()) return;
    this.pdfError.set(null);
    const popup = window.open('about:blank', '_blank');
    this.downloading.set(true);

    const saved = await this.ensureReportSaved();
    if (!saved) {
      this.downloading.set(false);
      this.pdfError.set('Could not save the report before generating the PDF.');
      if (popup) popup.close();
      return;
    }

    this.reportsSvc.pdfBlob(this.clientId(), this.cycleId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (popup) popup.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.downloading.set(false);
      },
      error: (err) => {
        this.downloading.set(false);
        if (popup) popup.close();
        this.pdfError.set(err?.error?.message || 'Error generating the PDF');
      },
    });
  }

  async downloadPdf() {
    if (!this.ready()) return;
    this.pdfError.set(null);
    this.downloading.set(true);

    const saved = await this.ensureReportSaved();
    if (!saved) {
      this.downloading.set(false);
      this.pdfError.set('Could not save the report before downloading.');
      return;
    }

    this.reportsSvc.pdfBlob(this.clientId(), this.cycleId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const clientName = this.clients().find((c) => c._id === this.clientId())?.name || 'report';
        const cycleLabel = this.cycles().find((c) => c._id === this.cycleId())?.label || '';
        a.download = `${clientName}-${cycleLabel}.pdf`.replace(/\s+/g, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        this.downloading.set(false);
      },
      error: (err) => {
        this.downloading.set(false);
        this.pdfError.set(err?.error?.message || 'Error downloading the PDF');
      },
    });
  }
}
