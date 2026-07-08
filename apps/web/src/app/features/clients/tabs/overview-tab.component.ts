import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed } from '@angular/core';
import {
  CLIENT_SERVICE_LABELS,
  Client,
  ClientServiceLine,
} from '@seo/shared';

/**
 * Cross-service Overview tab. Deliberately kept modest: shows the
 * client's basic health signal, package / service lines, primary
 * contact snapshot, and quick links. Each service module (SEO, PPC,
 * Web) has its own deeper dashboards — this is only the landing card.
 */
@Component({
  selector: 'app-client-overview-tab',
  standalone: true,
  imports: [CommonModule, DatePipe],
  template: `
    <div class="space-y-4">
      <!-- Health signal + package -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Health
          </div>
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2.5 h-2.5 rounded-full" [class]="dotClass()"></span>
            <span class="text-lg font-bold" [class]="statusTextClass()">
              {{ statusLabel() }}
            </span>
          </div>
          <div class="text-xs text-ink-500 mt-1">
            {{ healthDetail() }}
          </div>
        </div>
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Package · cycle
          </div>
          <div class="text-lg font-bold text-ink-900 mt-1">
            {{ client.package?.name || client.tier || '—' }}
          </div>
          <div class="text-xs text-ink-500 mt-1">
            {{ client.hoursPerCycle || 0 }} h / cycle
          </div>
        </div>
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Service lines
          </div>
          <div class="flex flex-wrap gap-1 mt-1.5">
            @if (serviceLines().length) {
              @for (s of serviceLines(); track s) {
                <span
                  class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded"
                  [class]="chipClass(s)"
                >
                  {{ labels[s] }}
                </span>
              }
            } @else {
              <span class="text-xs text-ink-400 italic">
                No service lines set
              </span>
            }
          </div>
        </div>
      </div>

      <!-- Primary contact + quick links -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
            Primary contact
          </div>
          @if (primaryContact(); as pc) {
            <div class="text-sm font-semibold text-ink-900">{{ pc.name || '—' }}</div>
            @if (pc.role) {
              <div class="text-xs text-ink-500">{{ pc.role }}</div>
            }
            @if (pc.email) {
              <a [href]="'mailto:' + pc.email"
                 class="text-xs text-sky-500 hover:underline block mt-1">
                {{ pc.email }}
              </a>
            }
          } @else {
            <div class="text-xs text-ink-400 italic">
              No contact on file. Add one under
              <button type="button"
                      class="text-brand-500 hover:underline"
                      (click)="jump('contacts')">
                Setup → Contacts
              </button>.
            </div>
          }
        </div>
        <div class="card p-4">
          <div class="text-[10px] font-semibold uppercase tracking-wider text-ink-500 mb-2">
            Quick links
          </div>
          <div class="flex flex-wrap gap-2">
            @if (client.url) {
              <a [href]="client.url" target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-ink-50 border border-ink-200 hover:bg-ink-100 text-ink-700 transition">
                🌐 Website
              </a>
            }
            @if (client.googleDocId) {
              <a [href]="'https://docs.google.com/document/d/' + client.googleDocId + '/edit'"
                 target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-sky-100 border border-sky-100 hover:bg-sky-200 text-sky-700 transition">
                📄 Working Doc
              </a>
            }
            @if (client.googleSheetId) {
              <a [href]="'https://docs.google.com/spreadsheets/d/' + client.googleSheetId + '/edit'"
                 target="_blank" rel="noopener"
                 class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-positive-100 border border-positive-100 hover:bg-positive-100/70 text-positive-500 transition">
                📊 Sheet
              </a>
            }
            @if (client.endingDate) {
              <span class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-warning-100 border border-warning-100 text-warning-500">
                📅 Ends {{ client.endingDate | date: 'mediumDate' }}
              </span>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ClientOverviewTabComponent {
  @Input({ required: true }) client!: Client;
  @Output() jumpToTab = new EventEmitter<string>();

  readonly labels = CLIENT_SERVICE_LABELS;

  serviceLines = computed<ClientServiceLine[]>(() => {
    return (this.client.serviceLines as ClientServiceLine[]) ?? [];
  });

  primaryContact = computed(() => {
    const c = this.client.contacts?.[0];
    return c || null;
  });

  statusLabel = computed(() => {
    // Overview is read from the roster stats when available; the plain
    // Client doc doesn't carry the health signal, so this defaults to a
    // neutral "Active/Inactive" label unless we get the enriched shape.
    return this.client.active === false ? 'Inactive' : 'Active';
  });

  statusTextClass = computed(() =>
    this.client.active === false ? 'text-ink-500' : 'text-positive-500',
  );

  dotClass = computed(() =>
    this.client.active === false ? 'bg-ink-400' : 'bg-positive-500',
  );

  healthDetail = computed(() =>
    this.client.active === false
      ? 'Paused engagement — no cadence.'
      : 'Roster health signal shown on the Clients list.',
  );

  chipClass(line: ClientServiceLine): string {
    switch (line) {
      case 'seo':
        return 'bg-positive-100 text-positive-500';
      case 'ppc':
        return 'bg-sky-100 text-sky-700';
      case 'website':
        return 'bg-brand-500/10 text-brand-700';
      default:
        return 'bg-ink-100 text-ink-700';
    }
  }

  jump(tab: string) {
    this.jumpToTab.emit(tab);
  }
}
