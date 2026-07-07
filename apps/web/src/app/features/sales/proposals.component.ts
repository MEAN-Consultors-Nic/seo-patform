import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  PROPOSAL_STATUS_LABELS,
  Proposal,
  ProposalCadence,
  ProposalItem,
  ProposalStatus,
  computeProposalTotals,
} from '@seo/shared';
import { ProposalsService } from '../../core/proposals.service';

interface EditableItem extends ProposalItem {
  _uid: string;
}
interface EditableProposal {
  _id?: string;
  title: string;
  businessName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  items: EditableItem[];
  intro?: string;
  terms?: string;
  notes?: string;
  status: ProposalStatus;
}

@Component({
  selector: 'app-sales-proposals',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="page-container">
      <header class="page-header">
        <div>
          <h1 class="page-title">Proposals</h1>
          <p class="page-subtitle">
            Draft, send, and track sales proposals. Each send provisions a
            token-gated public link the client can view and sign.
          </p>
        </div>
        <button class="btn-primary" (click)="openNew()">+ New proposal</button>
      </header>

      @if (loading()) {
        <div class="card text-center py-10 text-sm text-ink-400 italic">Loading proposals…</div>
      } @else if (loadError()) {
        <div class="card text-xs text-danger-500">{{ loadError() }}</div>
      } @else if (rows().length === 0) {
        <div class="card text-center py-10 text-sm text-ink-500">
          No proposals yet. Draft one to get started.
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-ink-100 text-[10px] uppercase tracking-wider text-ink-500 bg-ink-50">
                <th class="text-left px-4 py-2 font-semibold">Title / Client</th>
                <th class="text-left px-3 py-2 font-semibold">Status</th>
                <th class="text-right px-3 py-2 font-semibold">Monthly</th>
                <th class="text-right px-3 py-2 font-semibold">One-time</th>
                <th class="text-left px-3 py-2 font-semibold">Updated</th>
                <th class="text-right px-4 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (p of rows(); track p._id) {
                <tr class="border-b border-ink-100 hover:bg-ink-50 cursor-pointer"
                    (click)="openEdit(p)">
                  <td class="px-4 py-2">
                    <div class="font-semibold text-ink-900 truncate">{{ p.title }}</div>
                    <div class="text-[11px] text-ink-500 truncate">{{ p.businessName }}</div>
                  </td>
                  <td class="px-3 py-2">
                    <span [class]="statusBadgeClass(p.status)"
                          class="text-[10px] uppercase font-bold px-2 py-0.5 rounded">
                      {{ statusLabels[p.status] }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-right text-xs font-semibold text-ink-900">
                    \${{ totalMonthly(p) | number: '1.0-0' }}
                  </td>
                  <td class="px-3 py-2 text-right text-xs text-ink-500">
                    \${{ totalOneTime(p) | number: '1.0-0' }}
                  </td>
                  <td class="px-3 py-2 text-[11px] text-ink-500 whitespace-nowrap">
                    {{ p.updatedAt | date: 'short' }}
                  </td>
                  <td class="px-4 py-2 text-right text-[11px] text-brand-500">Edit →</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (editing(); as e) {
        <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
             (click)="closeEditor()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
               (click)="$event.stopPropagation()">
            <div class="p-5 border-b border-ink-100 flex items-center justify-between">
              <h3 class="text-lg font-bold">
                {{ e._id ? 'Proposal · ' + e.title : 'New proposal' }}
              </h3>
              <button class="text-ink-400 hover:text-ink-900 text-2xl leading-none"
                      (click)="closeEditor()">×</button>
            </div>

            <div class="p-5 space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2">
                  <label class="label">Title</label>
                  <input class="input" [(ngModel)]="e.title"
                         placeholder="SEO · Growth plan for Acme" />
                </div>
                <div>
                  <label class="label">Business name</label>
                  <input class="input" [(ngModel)]="e.businessName" />
                </div>
                <div>
                  <label class="label">Contact name</label>
                  <input class="input" [(ngModel)]="e.contactName" />
                </div>
                <div>
                  <label class="label">Email</label>
                  <input class="input" type="email" [(ngModel)]="e.email" />
                </div>
                <div>
                  <label class="label">Phone</label>
                  <input class="input" [(ngModel)]="e.phone" />
                </div>
                <div class="col-span-2">
                  <label class="label">Website</label>
                  <input class="input" [(ngModel)]="e.website" placeholder="https://…" />
                </div>
              </div>

              <div class="pt-3 border-t border-ink-100">
                <div class="flex items-center justify-between mb-2">
                  <div>
                    <h4 class="font-bold text-ink-900 text-sm">Line items</h4>
                    <p class="text-[11px] text-ink-500">
                      Cadence controls how the totals roll up: one-time,
                      monthly recurring, or annual.
                    </p>
                  </div>
                  <button class="btn-secondary text-[11px]" (click)="addItem(e)">+ Add item</button>
                </div>
                @if (e.items.length === 0) {
                  <div class="text-center py-4 text-[11px] text-ink-400 italic border border-dashed border-ink-200 rounded">
                    No items yet — click Add item.
                  </div>
                } @else {
                  <div class="space-y-2">
                    @for (it of e.items; track it._uid; let i = $index) {
                      <div class="border border-ink-200 rounded p-3 bg-ink-50/40">
                        <div class="grid grid-cols-12 gap-2 items-end">
                          <div class="col-span-4">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Name</label>
                            <input class="input text-xs" [(ngModel)]="it.name"
                                   placeholder="SEO retainer" />
                          </div>
                          <div class="col-span-2">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Cadence</label>
                            <select class="input text-xs" [(ngModel)]="it.cadence">
                              <option value="one-time">One-time</option>
                              <option value="monthly">Monthly</option>
                              <option value="annual">Annual</option>
                            </select>
                          </div>
                          <div class="col-span-2">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Qty</label>
                            <input class="input text-xs" type="number" min="0" step="1"
                                   [(ngModel)]="it.quantity" />
                          </div>
                          <div class="col-span-3">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Unit price ($)</label>
                            <input class="input text-xs" type="number" min="0" step="10"
                                   [(ngModel)]="it.unitPrice" />
                          </div>
                          <div class="col-span-1 text-right">
                            <button class="text-danger-500 text-lg leading-none"
                                    (click)="removeItem(e, i)" title="Remove">×</button>
                          </div>
                          <div class="col-span-12">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Description (optional)</label>
                            <input class="input text-xs" [(ngModel)]="it.description" />
                          </div>
                          <div class="col-span-12">
                            <label class="text-[10px] font-semibold uppercase text-ink-500">Payment link (optional)</label>
                            <input class="input text-xs" [(ngModel)]="it.paymentLinkUrl"
                                   placeholder="https://buy.stripe.com/..." />
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                }

                <!-- Totals bar -->
                <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div class="card p-2">
                    <div class="text-[10px] uppercase font-semibold text-ink-500">One-time</div>
                    <div class="text-sm font-bold">\${{ totals(e).oneTime | number: '1.0-0' }}</div>
                  </div>
                  <div class="card p-2">
                    <div class="text-[10px] uppercase font-semibold text-ink-500">Monthly</div>
                    <div class="text-sm font-bold">\${{ totals(e).monthly | number: '1.0-0' }}</div>
                  </div>
                  <div class="card p-2">
                    <div class="text-[10px] uppercase font-semibold text-ink-500">Annual</div>
                    <div class="text-sm font-bold">\${{ totals(e).annual | number: '1.0-0' }}</div>
                  </div>
                </div>
              </div>

              <div class="pt-3 border-t border-ink-100 grid grid-cols-1 gap-3">
                <div>
                  <label class="label">Intro (optional)</label>
                  <textarea class="input" rows="2" [(ngModel)]="e.intro"
                            placeholder="Hi Acme team — here's the proposal we discussed…"></textarea>
                </div>
                <div>
                  <label class="label">Terms (optional)</label>
                  <textarea class="input" rows="2" [(ngModel)]="e.terms"
                            placeholder="Month-to-month, 30-day cancellation…"></textarea>
                </div>
                <div>
                  <label class="label">Internal notes (optional)</label>
                  <textarea class="input" rows="2" [(ngModel)]="e.notes"
                            placeholder="Notes visible only to your team."></textarea>
                </div>
              </div>

              @if (saveError()) {
                <div class="text-xs text-danger-500">⚠ {{ saveError() }}</div>
              }
            </div>

            <div class="p-5 border-t border-ink-100 flex justify-between gap-2">
              <div class="flex gap-2">
                @if (e._id) {
                  <button class="btn-secondary text-xs text-danger-500 border-danger-200 hover:bg-danger-100"
                          (click)="remove()">Delete</button>
                }
              </div>
              <div class="flex gap-2">
                <button class="btn-secondary text-xs" (click)="closeEditor()">Cancel</button>
                <button class="btn-primary text-xs" [disabled]="saving()" (click)="save()">
                  {{ saving() ? 'Saving…' : (e._id ? 'Save changes' : 'Create draft') }}
                </button>
                @if (e._id) {
                  <button class="btn-primary text-xs" (click)="openSend(e)"
                          [disabled]="e.status === 'draft' && !hasItems(e)">
                    Send…
                  </button>
                }
              </div>
            </div>
          </div>
        </div>
      }

      @if (sendingProposal(); as sp) {
        <div class="fixed inset-0 bg-ink-900/60 z-[10000] flex items-center justify-center p-4"
             (click)="cancelSend()">
          <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-5"
               (click)="$event.stopPropagation()">
            <h3 class="text-lg font-bold mb-3">Send proposal</h3>
            <div class="space-y-3">
              <div>
                <label class="label">To</label>
                <input class="input" type="email" [(ngModel)]="sendPayload.to" />
              </div>
              <div>
                <label class="label">Subject (optional)</label>
                <input class="input" [(ngModel)]="sendPayload.subject" />
              </div>
              <div>
                <label class="label">Personal message (optional)</label>
                <textarea class="input" rows="3" [(ngModel)]="sendPayload.message"
                          placeholder="Wanted to follow up on our chat this morning."></textarea>
              </div>
              @if (sendError()) {
                <div class="text-xs text-danger-500">⚠ {{ sendError() }}</div>
              }
            </div>
            <div class="pt-4 border-t border-ink-100 mt-4 flex justify-end gap-2">
              <button class="btn-secondary text-xs" (click)="cancelSend()">Cancel</button>
              <button class="btn-primary text-xs" [disabled]="sending()" (click)="doSend()">
                {{ sending() ? 'Sending…' : 'Send now' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class SalesProposalsComponent implements OnInit {
  private svc = inject(ProposalsService);

  readonly statusLabels = PROPOSAL_STATUS_LABELS;

  rows = signal<Proposal[]>([]);
  loading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  editing = signal<EditableProposal | null>(null);
  saving = signal<boolean>(false);
  saveError = signal<string | null>(null);

  sendingProposal = signal<EditableProposal | null>(null);
  sendPayload = { to: '', subject: '', message: '' };
  sending = signal<boolean>(false);
  sendError = signal<string | null>(null);

  ngOnInit() {
    this.reload();
  }

  private reload() {
    this.loading.set(true);
    this.loadError.set(null);
    this.svc.list().subscribe({
      next: (list) => {
        this.rows.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message || 'Could not load proposals.');
      },
    });
  }

  openNew() {
    this.saveError.set(null);
    this.editing.set({
      title: '',
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      website: '',
      items: [],
      intro: '',
      terms: '',
      notes: '',
      status: 'draft',
    });
  }

  openEdit(p: Proposal) {
    this.saveError.set(null);
    this.editing.set({
      _id: p._id,
      title: p.title,
      businessName: p.businessName,
      contactName: p.contactName || '',
      email: p.email || '',
      phone: p.phone || '',
      website: p.website || '',
      items: (p.items || []).map((it) => ({
        ...it,
        _uid: crypto.randomUUID(),
      })),
      intro: p.intro || '',
      terms: p.terms || '',
      notes: p.notes || '',
      status: p.status,
    });
  }

  closeEditor() {
    if (this.saving()) return;
    this.editing.set(null);
    this.saveError.set(null);
  }

  addItem(e: EditableProposal) {
    e.items.push({
      _uid: crypto.randomUUID(),
      name: '',
      cadence: 'monthly',
      quantity: 1,
      unitPrice: 0,
    });
    this.editing.set({ ...e });
  }

  removeItem(e: EditableProposal, i: number) {
    e.items.splice(i, 1);
    this.editing.set({ ...e });
  }

  save() {
    const e = this.editing();
    if (!e) return;
    if (!e.title.trim()) {
      this.saveError.set('Title is required.');
      return;
    }
    if (!e.businessName.trim()) {
      this.saveError.set('Business name is required.');
      return;
    }
    const items = e.items.map((it) => ({
      name: it.name.trim(),
      description: it.description?.trim() || undefined,
      cadence: it.cadence as ProposalCadence,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      paymentLinkUrl: it.paymentLinkUrl?.trim() || undefined,
    }));
    if (items.some((it) => !it.name)) {
      this.saveError.set('Every line item needs a name.');
      return;
    }
    const payload: Partial<Proposal> = {
      title: e.title.trim(),
      businessName: e.businessName.trim(),
      contactName: e.contactName?.trim() || undefined,
      email: e.email?.trim() || undefined,
      phone: e.phone?.trim() || undefined,
      website: e.website?.trim() || undefined,
      items,
      intro: e.intro?.trim() || undefined,
      terms: e.terms?.trim() || undefined,
      notes: e.notes?.trim() || undefined,
    };
    this.saving.set(true);
    this.saveError.set(null);
    const req$ = e._id
      ? this.svc.update(e._id, payload)
      : this.svc.create(payload);
    req$.subscribe({
      next: (saved) => {
        this.saving.set(false);
        // For new proposals stay in the editor with the saved _id so
        // the operator can immediately click Send.
        if (!e._id) this.editing.set({ ...e, _id: saved._id });
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        const m = err?.error?.message;
        this.saveError.set(Array.isArray(m) ? m.join(', ') : m || 'Save failed.');
      },
    });
  }

  remove() {
    const e = this.editing();
    if (!e?._id) return;
    if (!confirm(`Delete proposal "${e.title}"? This cannot be undone.`))
      return;
    this.svc.remove(e._id).subscribe({
      next: () => {
        this.editing.set(null);
        this.reload();
      },
      error: (err) => alert(err?.error?.message || 'Delete failed.'),
    });
  }

  openSend(e: EditableProposal) {
    this.sendPayload = {
      to: e.email || '',
      subject: `${e.title} — proposal`,
      message: '',
    };
    this.sendError.set(null);
    this.sendingProposal.set(e);
  }

  cancelSend() {
    if (this.sending()) return;
    this.sendingProposal.set(null);
    this.sendError.set(null);
  }

  doSend() {
    const e = this.sendingProposal();
    if (!e?._id) return;
    if (!this.sendPayload.to.trim()) {
      this.sendError.set('Recipient email is required.');
      return;
    }
    this.sending.set(true);
    this.sendError.set(null);
    this.svc
      .send(e._id, {
        to: this.sendPayload.to.trim(),
        subject: this.sendPayload.subject.trim() || undefined,
        message: this.sendPayload.message.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.sendingProposal.set(null);
          this.editing.set(null);
          this.reload();
        },
        error: (err) => {
          this.sending.set(false);
          const m = err?.error?.message;
          this.sendError.set(Array.isArray(m) ? m.join(', ') : m || 'Send failed.');
        },
      });
  }

  hasItems(e: EditableProposal) {
    return e.items.length > 0;
  }

  totals(e: EditableProposal) {
    return computeProposalTotals(
      e.items.map((it) => ({
        name: it.name,
        cadence: it.cadence,
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
      })),
    );
  }

  totalMonthly(p: Proposal) {
    return computeProposalTotals(p.items || []).monthly;
  }
  totalOneTime(p: Proposal) {
    return computeProposalTotals(p.items || []).oneTime;
  }

  statusBadgeClass(status: ProposalStatus): string {
    switch (status) {
      case 'draft':
        return 'bg-ink-100 text-ink-500';
      case 'sent':
        return 'bg-sky-100 text-sky-700';
      case 'viewed':
        return 'bg-amber-50 text-amber-600';
      case 'signed':
        return 'bg-positive-100 text-positive-500';
      case 'declined':
      case 'expired':
        return 'bg-danger-100 text-danger-500';
    }
  }
}
