import { CommonModule, DatePipe } from '@angular/common';
import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomainToolsService, DomainLookupResult } from '../../core/domain-tools.service';

@Component({
  selector: 'app-domain-info-button',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <button type="button"
            [class]="buttonClass"
            (click)="open()"
            title="Domain info — hosting, registrar, DNS">
      🌐 {{ label }}
    </button>



    @if (modalOpen()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="close()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
             (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-ink-100 flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h2 class="text-lg font-bold text-ink-900 truncate">🌐 Domain info</h2>
              @if (domain() && (result() || loading())) {
                <p class="text-xs text-ink-500 mt-0.5 truncate">{{ domain() }}</p>
              } @else {
                <p class="text-xs text-ink-500 mt-0.5 truncate">
                  Look up hosting, registrar, DNS, and email host for any domain.
                </p>
              }
            </div>
            <button type="button"
                    (click)="close()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-ink-100">×</button>
          </div>

          <div class="px-6 py-5 overflow-y-auto flex-1 space-y-5">
            <!-- Standalone input (only shown when no URL was passed) -->
            @if (!url && !result() && !loading()) {
              <form (submit)="$event.preventDefault(); submitDomain()" class="space-y-2">
                <label class="label">Domain</label>
                <div class="flex gap-2">
                  <input class="input flex-1"
                         [(ngModel)]="domainInput"
                         name="domain"
                         placeholder="example.com"
                         autocomplete="off"
                         autofocus />
                  <button type="submit"
                          class="btn-primary text-xs"
                          [disabled]="!domainInput.trim()">
                    Get info →
                  </button>
                </div>
                <p class="text-[11px] text-ink-400">
                  Paste a URL or a bare domain — we strip the protocol and path automatically.
                </p>
              </form>
            }

            @if (loading()) {
              <div class="text-center py-12 text-sm text-ink-400">
                <div class="inline-block animate-spin mr-2">⏳</div>
                Looking up domain info…
              </div>
            } @else if (error()) {
              <div class="rounded-md bg-danger-100 border border-danger-200 text-danger-700 text-sm px-3 py-2">
                {{ error() }}
              </div>
            } @else if (result(); as r) {
              <!-- Hosting -->
              <section>
                <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-1.5">Hosting provider</div>
                @if (r.hosting?.org || r.hosting?.holder) {
                  <div class="font-semibold text-ink-900 text-base">
                    {{ r.hosting?.org || r.hosting?.holder }}
                  </div>
                  <div class="text-xs text-ink-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    @if (r.hosting?.asn) { <span>{{ r.hosting?.asn }}</span> }
                    @if (r.hosting?.country) { <span>{{ r.hosting?.country }}</span> }
                  </div>
                } @else {
                  <div class="text-sm text-ink-400 italic">Could not determine</div>
                }
              </section>

              <!-- Registrar -->
              <section>
                <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-1.5">Domain registrar</div>
                @if (r.registrar?.name) {
                  <div class="font-semibold text-ink-900 text-base">{{ r.registrar?.name }}</div>
                  @if (r.registrar?.url) {
                    <a [href]="r.registrar?.url" target="_blank" rel="noopener"
                       class="text-xs text-sky-600 hover:underline mt-0.5 inline-block">
                      {{ r.registrar?.url }} ↗
                    </a>
                  }
                } @else {
                  <div class="text-sm text-ink-400 italic">Not available (some TLDs hide this)</div>
                }
              </section>

              <!-- Dates -->
              @if (r.registeredAt || r.expiresAt || r.updatedAt) {
                <section class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  @if (r.registeredAt) {
                    <div>
                      <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-0.5">Registered</div>
                      <div class="text-ink-900 font-semibold">{{ r.registeredAt | date: 'mediumDate' }}</div>
                    </div>
                  }
                  @if (r.expiresAt) {
                    <div>
                      <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-0.5">Expires</div>
                      <div class="font-semibold" [ngClass]="expiryClass(r.expiresAt)">
                        {{ r.expiresAt | date: 'mediumDate' }}
                      </div>
                      <div class="text-[10px] text-ink-500 mt-0.5">
                        {{ daysUntil(r.expiresAt) }} days
                      </div>
                    </div>
                  }
                  @if (r.updatedAt) {
                    <div>
                      <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-0.5">Last updated</div>
                      <div class="text-ink-700">{{ r.updatedAt | date: 'mediumDate' }}</div>
                    </div>
                  }
                </section>
              }

              <!-- IP / reverse -->
              @if (r.ip) {
                <section>
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-1.5">IP address</div>
                  <div class="font-mono text-sm text-ink-900">{{ r.ip }}</div>
                  @if (r.reverseDns) {
                    <div class="text-xs text-ink-500 mt-0.5 font-mono">PTR: {{ r.reverseDns }}</div>
                  }
                  @if (r.ips && r.ips.length > 1) {
                    <div class="text-[11px] text-ink-400 mt-0.5">
                      Additional IPs: {{ r.ips.slice(1).join(', ') }}
                    </div>
                  }
                </section>
              }

              <!-- Nameservers -->
              @if (r.nameServers?.length) {
                <section>
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-1.5">
                    Nameservers
                    @if (r.dnsHostHint) {
                      <span class="ml-1 normal-case tracking-normal font-normal text-ink-500">— likely {{ r.dnsHostHint }}</span>
                    }
                  </div>
                  <ul class="space-y-0.5 font-mono text-xs text-ink-700">
                    @for (ns of r.nameServers; track ns) {
                      <li>{{ ns }}</li>
                    }
                  </ul>
                </section>
              }

              <!-- MX records -->
              @if (r.mxRecords?.length) {
                <section>
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-400 mb-1.5">
                    MX records
                    @if (r.emailHostHint) {
                      <span class="ml-1 normal-case tracking-normal font-normal text-ink-500">— likely {{ r.emailHostHint }}</span>
                    }
                  </div>
                  <ul class="space-y-0.5 font-mono text-xs text-ink-700">
                    @for (mx of r.mxRecords; track mx.exchange) {
                      <li><span class="text-ink-400">{{ mx.priority }}</span> {{ mx.exchange }}</li>
                    }
                  </ul>
                </section>
              }

              @if (r.errors?.length) {
                <section class="text-[11px] text-ink-400 border-t border-ink-100 pt-3">
                  <div class="font-semibold text-ink-500 mb-1">Notes</div>
                  <ul class="list-disc pl-4 space-y-0.5">
                    @for (err of r.errors; track err) {
                      <li>{{ err }}</li>
                    }
                  </ul>
                </section>
              }
            }
          </div>

          <div class="px-6 py-3 border-t border-ink-100 flex justify-between items-center text-xs">
            @if (result()) {
              <button type="button"
                      class="text-ink-500 hover:text-ink-900"
                      [disabled]="loading()"
                      (click)="reset()">
                {{ url ? '⟳ Re-run lookup' : '← New lookup' }}
              </button>
            } @else {
              <span></span>
            }
            <button class="btn-secondary text-xs" (click)="close()">Close</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DomainInfoButtonComponent {
  @Input() url?: string;
  @Input() label = 'Domain info';
  @Input() buttonClass =
    'text-xs text-ink-500 hover:text-ink-900 hover:bg-ink-100 rounded px-1.5 py-0.5 inline-flex items-center gap-1 transition';

  private svc = inject(DomainToolsService);

  modalOpen = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<DomainLookupResult | null>(null);
  domainInput = '';
  private resolvedDomain = signal<string>('');

  domain(): string {
    if (this.url) {
      try {
        return new URL(this.url).hostname.replace(/^www\./, '');
      } catch {
        return this.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
      }
    }
    return this.resolvedDomain();
  }

  open() {
    this.modalOpen.set(true);
    if (this.url && !this.result()) {
      this.runLookup(this.domain());
    }
  }

  close() {
    if (this.loading()) return;
    this.modalOpen.set(false);
    // Reset standalone state so reopening starts fresh
    if (!this.url) {
      this.result.set(null);
      this.error.set(null);
      this.domainInput = '';
      this.resolvedDomain.set('');
    }
  }

  reset() {
    if (this.url) {
      this.result.set(null);
      this.runLookup(this.domain());
    } else {
      this.result.set(null);
      this.error.set(null);
      this.resolvedDomain.set('');
    }
  }

  submitDomain() {
    const raw = this.domainInput.trim();
    if (!raw) return;
    const d = this.normalize(raw);
    this.resolvedDomain.set(d);
    this.runLookup(d);
  }

  private normalize(input: string): string {
    return input.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();
  }

  private runLookup(d: string) {
    if (!d) return;
    this.loading.set(true);
    this.error.set(null);
    this.svc.lookup(d).subscribe({
      next: (r) => {
        this.result.set(r);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not perform domain lookup.',
        );
      },
    });
  }

  daysUntil(iso: string): number {
    const d = new Date(iso).getTime();
    return Math.round((d - Date.now()) / (1000 * 60 * 60 * 24));
  }

  expiryClass(iso: string): string {
    const days = this.daysUntil(iso);
    if (days < 0) return 'text-danger-500';
    if (days < 30) return 'text-danger-500';
    if (days < 90) return 'text-warning-500';
    return 'text-ink-900';
  }
}
