import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import {
  PROPOSAL_STATUS_LABELS,
  Proposal,
  ProposalItem,
  computeProposalTotals,
} from '@seo/shared';
import { API_BASE_URL } from '../../core/api.config';

/**
 * Public, token-gated proposal view (Sales Slice 4.3). Sits at
 * /p/:token; requires a PIN to accept ("sign") the proposal.
 */
@Component({
  selector: 'app-public-proposal',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="min-h-screen bg-ink-50 py-10 px-4">
      <div class="max-w-3xl mx-auto">
        <div class="flex items-center gap-2 mb-6">
          <div class="w-9 h-9 rounded-md bg-brand-500 text-white flex items-center justify-center font-bold">IT</div>
          <div class="text-sm font-bold text-ink-900">Internal Tools</div>
          <span class="text-[10px] uppercase text-ink-500 ml-2">Media Spearhead</span>
        </div>

        @if (loading()) {
          <div class="card text-center py-12 text-sm text-ink-400 italic">Loading proposal…</div>
        } @else if (error()) {
          <div class="card text-center py-10 text-sm text-danger-500">{{ error() }}</div>
        } @else if (proposal(); as p) {
          <div class="card p-6 mb-4">
            <div class="text-[10px] uppercase font-bold text-brand-500 mb-1">PROPOSAL</div>
            <h1 class="text-3xl font-bold text-ink-900 mb-2">{{ p.title }}</h1>
            <div class="text-sm text-ink-500 mb-4">
              For <strong class="text-ink-900">{{ p.businessName }}</strong>
              @if (p.contactName) { · Attn: {{ p.contactName }} }
              · <span class="uppercase font-semibold">{{ statusLabels[p.status] }}</span>
              @if (p.sentAt) { · Sent {{ p.sentAt | date: 'mediumDate' }} }
            </div>
            @if (p.intro) {
              <div class="text-sm text-ink-700 leading-relaxed whitespace-pre-line">{{ p.intro }}</div>
            }
          </div>

          <div class="card p-6 mb-4">
            <h2 class="text-lg font-bold text-ink-900 mb-4">Scope</h2>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-ink-100 text-[10px] uppercase font-bold text-ink-500">
                  <th class="text-left py-2">Item</th>
                  <th class="text-right py-2 w-24">Cadence</th>
                  <th class="text-right py-2 w-16">Qty</th>
                  <th class="text-right py-2 w-28">Unit</th>
                  <th class="text-right py-2 w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                @for (it of p.items; track $index) {
                  <tr class="border-b border-ink-100">
                    <td class="py-3">
                      <div class="font-semibold text-ink-900">{{ it.name }}</div>
                      @if (it.description) {
                        <div class="text-xs text-ink-500 mt-1">{{ it.description }}</div>
                      }
                      @if (it.paymentLinkUrl) {
                        <a [href]="it.paymentLinkUrl" target="_blank"
                           class="text-xs text-brand-500 hover:underline mt-1 inline-block">
                          Payment link →
                        </a>
                      }
                    </td>
                    <td class="text-right text-xs text-ink-500 uppercase">{{ it.cadence }}</td>
                    <td class="text-right text-xs text-ink-500">{{ it.quantity }}</td>
                    <td class="text-right text-xs text-ink-700">
                      \${{ it.unitPrice | number: '1.0-0' }}
                    </td>
                    <td class="text-right text-sm font-semibold text-ink-900">
                      \${{ (it.quantity * it.unitPrice) | number: '1.0-0' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="mt-4 pt-4 border-t border-ink-100 grid grid-cols-3 gap-2">
              <div>
                <div class="text-[10px] uppercase font-bold text-ink-500">One-time</div>
                <div class="text-lg font-black text-ink-900">
                  \${{ totals(p).oneTime | number: '1.0-0' }}
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-bold text-ink-500">Monthly</div>
                <div class="text-lg font-black text-ink-900">
                  \${{ totals(p).monthly | number: '1.0-0' }}
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase font-bold text-ink-500">Annual</div>
                <div class="text-lg font-black text-ink-900">
                  \${{ totals(p).annual | number: '1.0-0' }}
                </div>
              </div>
            </div>
          </div>

          @if (p.terms) {
            <div class="card p-6 mb-4">
              <h2 class="text-lg font-bold text-ink-900 mb-2">Terms</h2>
              <div class="text-xs text-ink-700 whitespace-pre-line leading-relaxed">{{ p.terms }}</div>
            </div>
          }

          @if (p.status === 'signed') {
            <div class="card p-6 text-center border-positive-500 border-l-4 bg-positive-100/30">
              <div class="text-lg font-bold text-positive-500 mb-1">✓ Accepted</div>
              <div class="text-xs text-ink-700">
                Signed {{ p.signedAt | date: 'medium' }}. Media Spearhead will be in touch to kick off.
              </div>
            </div>
          } @else if (p.status === 'declined' || p.status === 'expired') {
            <div class="card p-6 text-center border-danger-500 border-l-4 bg-danger-100/30">
              <div class="text-sm font-bold text-danger-500">
                {{ statusLabels[p.status] }}
              </div>
            </div>
          } @else {
            <div class="card p-6">
              <h2 class="text-lg font-bold text-ink-900 mb-1">Accept this proposal</h2>
              <p class="text-xs text-ink-500 mb-3">
                Enter the access PIN we shared to accept.
              </p>
              <div class="flex flex-col sm:flex-row gap-2">
                <input class="input flex-1 max-w-xs" [(ngModel)]="pin"
                       placeholder="6-digit PIN" maxlength="6" />
                <button class="btn-primary text-sm" [disabled]="signing()" (click)="sign()">
                  {{ signing() ? 'Signing…' : 'Accept &amp; sign' }}
                </button>
              </div>
              @if (signError()) {
                <div class="text-xs text-danger-500 mt-2">⚠ {{ signError() }}</div>
              }
            </div>
          }

          <div class="text-center text-[10px] text-ink-400 mt-8">
            Media Spearhead · Internal Tools · Proposal
          </div>
        }
      </div>
    </div>
  `,
})
export class PublicProposalComponent implements OnInit {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);
  private route = inject(ActivatedRoute);

  readonly statusLabels = PROPOSAL_STATUS_LABELS;

  proposal = signal<Proposal | null>(null);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  signing = signal<boolean>(false);
  signError = signal<string | null>(null);
  pin = '';

  ngOnInit() {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error.set('Missing proposal token.');
      this.loading.set(false);
      return;
    }
    this.http
      .get<Proposal>(`${this.base}/proposals/public/${token}`)
      .subscribe({
        next: (p) => {
          this.proposal.set(p);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            err?.error?.message ||
              'Proposal not found. The link may have expired.',
          );
        },
      });
  }

  sign() {
    const p = this.proposal();
    if (!p) return;
    if (!this.pin.trim()) {
      this.signError.set('Enter the PIN we shared.');
      return;
    }
    const token = this.route.snapshot.paramMap.get('token');
    this.signing.set(true);
    this.signError.set(null);
    this.http
      .post<Proposal>(`${this.base}/proposals/public/${token}/sign`, {
        pin: this.pin.trim(),
      })
      .subscribe({
        next: (updated) => {
          this.proposal.set(updated);
          this.signing.set(false);
        },
        error: (err) => {
          this.signing.set(false);
          this.signError.set(
            err?.error?.message || 'Could not accept the proposal.',
          );
        },
      });
  }

  totals(p: Proposal) {
    return computeProposalTotals(p.items as ProposalItem[]);
  }
}
