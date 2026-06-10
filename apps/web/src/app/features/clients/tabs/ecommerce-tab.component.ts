import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client } from '@seo/shared';
import {
  Ga4EcommerceMetrics,
  GoogleIntegrationsService,
} from '../../../core/google-integrations.service';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Preset = 'last7' | 'last28' | 'last90' | 'custom';

@Component({
  selector: 'app-client-ecommerce-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="space-y-4">
      <!-- Header card -->
      <div class="card">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-ink-900">🛒 Ecommerce performance</h2>
            <p class="text-xs text-ink-500 mt-0.5 max-w-2xl">
              Revenue, transactions, and conversion metrics from organic search
              — pulled live from this client's GA4 property. Requires the GA4
              property to be tracking <code class="bg-ink-100 px-1 rounded">purchase</code> events.
            </p>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <select class="input input-sm" [ngModel]="preset()" (ngModelChange)="setPreset($event)">
              <option value="last7">Last 7 days</option>
              <option value="last28">Last 28 days</option>
              <option value="last90">Last 90 days</option>
              <option value="custom">Custom</option>
            </select>
            @if (preset() === 'custom') {
              <input type="date" class="input input-sm" [(ngModel)]="from" />
              <input type="date" class="input input-sm" [(ngModel)]="to" />
            }
            <button class="btn-primary text-xs"
                    (click)="load()"
                    [disabled]="loading()">
              {{ loading() ? 'Loading…' : '⚡ Refresh' }}
            </button>
          </div>
        </div>
        @if (error()) {
          <div class="mt-3 text-xs text-danger-500">{{ error() }}</div>
        }
        @if (!client.ga4PropertyId) {
          <div class="mt-3 text-xs text-warning-500">
            ⚠ GA4 property ID is not set for this client. Open the
            <strong>Integrations</strong> tab to configure it.
          </div>
        }
      </div>

      @if (loading()) {
        <div class="card text-center py-12 text-sm text-ink-400">
          <div class="inline-block animate-spin mr-2">⏳</div>
          Pulling ecommerce data…
        </div>
      } @else if (data(); as d) {
        <!-- Headline KPIs -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="card !p-4">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-1">
              Organic revenue
            </div>
            <div class="text-2xl font-black text-ink-900">
              {{ d.currency || '' }}{{ d.organicRevenue | number: '1.0-2' }}
            </div>
            <div class="text-[11px] text-ink-400 mt-1">
              of {{ d.currency || '' }}{{ d.totalRevenue | number: '1.0-0' }} total
              · {{ organicSharePct(d) | number: '1.0-1' }}%
            </div>
          </div>
          <div class="card !p-4">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-1">
              Organic transactions
            </div>
            <div class="text-2xl font-black text-ink-900">
              {{ d.organicTransactions | number }}
            </div>
            <div class="text-[11px] text-ink-400 mt-1">from organic sessions</div>
          </div>
          <div class="card !p-4">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-1">
              Avg order value
            </div>
            <div class="text-2xl font-black text-ink-900">
              {{ d.currency || '' }}{{ d.organicAov | number: '1.2-2' }}
            </div>
            <div class="text-[11px] text-ink-400 mt-1">per organic transaction</div>
          </div>
          <div class="card !p-4">
            <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-1">
              Conversion rate
            </div>
            <div class="text-2xl font-black text-ink-900">
              {{ d.organicConversionRate | number: '1.2-2' }}%
            </div>
            <div class="text-[11px] text-ink-400 mt-1">
              {{ d.organicSessions | number }} organic sessions
            </div>
          </div>
        </div>

        <!-- Top landing pages by revenue -->
        <div class="card">
          <div class="flex items-baseline justify-between mb-3">
            <h3 class="text-sm font-semibold text-ink-900">
              Top organic landing pages by revenue
            </h3>
            <span class="text-[11px] text-ink-400">{{ d.topLandingPages.length }} pages</span>
          </div>
          @if (d.topLandingPages.length === 0) {
            <div class="text-sm text-ink-400 italic py-4 text-center">
              No purchase events attributed to organic in this period.
            </div>
          } @else {
            <table class="w-full text-sm">
              <thead class="border-b border-ink-100">
                <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500">
                  <th class="py-2 pr-2 font-bold">Landing page</th>
                  <th class="py-2 px-2 font-bold text-right">Sessions</th>
                  <th class="py-2 px-2 font-bold text-right">Transactions</th>
                  <th class="py-2 pl-2 font-bold text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                @for (p of d.topLandingPages; track p.landingPage) {
                  <tr class="border-b border-ink-100 last:border-0">
                    <td class="py-2 pr-2 font-mono text-xs text-ink-700 truncate max-w-[400px]"
                        [title]="p.landingPage">{{ p.landingPage }}</td>
                    <td class="py-2 px-2 text-right text-ink-700">{{ p.sessions | number }}</td>
                    <td class="py-2 px-2 text-right font-semibold text-ink-900">{{ p.transactions | number }}</td>
                    <td class="py-2 pl-2 text-right font-semibold text-ink-900">
                      {{ d.currency || '' }}{{ p.revenue | number: '1.0-2' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>

        <!-- Top products -->
        @if (d.topProducts.length > 0) {
          <div class="card">
            <div class="flex items-baseline justify-between mb-3">
              <h3 class="text-sm font-semibold text-ink-900">
                Top products purchased (organic)
              </h3>
              <span class="text-[11px] text-ink-400">{{ d.topProducts.length }} items</span>
            </div>
            <table class="w-full text-sm">
              <thead class="border-b border-ink-100">
                <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500">
                  <th class="py-2 pr-2 font-bold">Item</th>
                  <th class="py-2 px-2 font-bold text-right">Quantity</th>
                  <th class="py-2 pl-2 font-bold text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                @for (p of d.topProducts; track p.itemName) {
                  <tr class="border-b border-ink-100 last:border-0">
                    <td class="py-2 pr-2 text-ink-700">{{ p.itemName }}</td>
                    <td class="py-2 px-2 text-right text-ink-700">{{ p.quantity | number }}</td>
                    <td class="py-2 pl-2 text-right font-semibold text-ink-900">
                      {{ d.currency || '' }}{{ p.revenue | number: '1.0-2' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <p class="text-[11px] text-ink-400 text-center">
          Range {{ d.rangeFrom }} → {{ d.rangeTo }}
          @if (d.currency) { · currency: {{ d.currency }} }
        </p>
      } @else {
        <div class="card text-center py-10 text-ink-400 italic text-sm">
          Click <strong>Refresh</strong> to pull ecommerce data from GA4.
        </div>
      }
    </div>
  `,
})
export class ClientEcommerceTab implements OnChanges {
  @Input({ required: true }) client!: Client;

  private google = inject(GoogleIntegrationsService);

  preset = signal<Preset>('last28');
  from = daysAgoIso(28);
  to = todayIso();
  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<Ga4EcommerceMetrics | null>(null);

  ngOnChanges() {
    this.data.set(null);
    this.error.set(null);
  }

  setPreset(p: Preset) {
    this.preset.set(p);
    if (p === 'last7') {
      this.from = daysAgoIso(7);
      this.to = todayIso();
    } else if (p === 'last28') {
      this.from = daysAgoIso(28);
      this.to = todayIso();
    } else if (p === 'last90') {
      this.from = daysAgoIso(90);
      this.to = todayIso();
    }
  }

  load() {
    if (!this.client?._id) return;
    if (!this.client.ga4PropertyId) {
      this.error.set('GA4 property ID is not set for this client.');
      return;
    }
    if (!this.from || !this.to) {
      this.error.set('Pick a from and to date.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.google.ga4Ecommerce(this.client._id, this.from, this.to).subscribe({
      next: (r) => {
        this.data.set(r);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message;
        this.error.set(
          Array.isArray(msg) ? msg.join(', ') : msg || 'Could not load ecommerce data.',
        );
      },
    });
  }

  organicSharePct(d: Ga4EcommerceMetrics): number {
    if (!d.totalRevenue) return 0;
    return (d.organicRevenue / d.totalRevenue) * 100;
  }
}
