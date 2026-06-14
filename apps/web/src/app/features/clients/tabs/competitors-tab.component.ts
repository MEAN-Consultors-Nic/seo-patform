import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, Competitor, ServiceArea } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { CompetitorsService } from '../../../core/competitors.service';

const GLOBAL_SCOPE = '__global__';

@Component({
  selector: 'app-client-competitors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="card">
        <h3 class="font-semibold text-navy-700 mb-3">+ Competitor</h3>
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newC.name" placeholder="Name" />
          <input class="input md:col-span-2" [(ngModel)]="newC.url" placeholder="https://..." />
          <input class="input" type="number" [(ngModel)]="newC.domainRating" placeholder="DR" />
          @if (serviceAreas().length > 0) {
            <select class="input" [(ngModel)]="newC.serviceAreaName">
              <option value="">🌐 All locations (global)</option>
              @for (a of serviceAreas(); track a.name) {
                <option [value]="a.name">📍 {{ a.name }}</option>
              }
            </select>
          }
        </div>
        @if (serviceAreas().length > 0) {
          <p class="text-[11px] text-ink-500 mt-2">
            Pick a specific location if this competitor only matters for one
            of the client's service areas, or leave on "All locations" to
            track them globally.
          </p>
        }
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newC.name || !newC.url">
          Create competitor
        </button>
      </div>

      <!-- Filter bar -->
      @if (competitors().length > 0) {
        <div class="card !p-3 flex flex-wrap items-end gap-3">
          <div class="min-w-[180px]">
            <label class="label">Filter by scope</label>
            <select class="input input-sm"
                    [ngModel]="scopeFilter()"
                    (ngModelChange)="scopeFilter.set($event)">
              <option value="">All competitors ({{ competitors().length }})</option>
              <option [value]="globalScope">🌐 Global only ({{ globalCount() }})</option>
              @if (serviceAreas().length > 0) {
                <optgroup label="By location">
                  @for (a of serviceAreas(); track a.name) {
                    <option [value]="a.name">
                      📍 {{ a.name }} ({{ countFor(a.name) }})
                    </option>
                  }
                </optgroup>
              }
            </select>
          </div>
          <div class="text-[11px] text-ink-500 ml-auto">
            Showing <strong class="text-ink-900">{{ filteredCompetitors().length }}</strong>
            of {{ competitors().length }}
          </div>
        </div>
      }

      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm min-w-[720px]">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-4 py-2 text-left">Competitor</th>
              <th class="px-4 py-2 text-left">Scope</th>
              <th class="px-4 py-2 text-left">URL</th>
              <th class="px-4 py-2 text-right">DR</th>
              <th class="px-4 py-2 text-right">Est. traffic</th>
              <th class="px-4 py-2 text-left">Notes</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of filteredCompetitors(); track c._id) {
              <tr class="border-b border-slate-100">
                <td class="px-4 py-2 font-medium text-navy-700">{{ c.name }}</td>
                <td class="px-4 py-2 text-xs">
                  @if (c.serviceAreaName) {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 text-brand-600 font-semibold whitespace-nowrap">
                      📍 {{ c.serviceAreaName }}
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ink-100 text-ink-600 font-semibold whitespace-nowrap">
                      🌐 Global
                    </span>
                  }
                </td>
                <td class="px-4 py-2 text-xs">
                  <a [href]="c.url" target="_blank" class="text-navy-500 hover:underline">{{ c.url }}</a>
                </td>
                <td class="px-4 py-2 text-right">
                  <input type="number" class="w-14 text-xs border rounded px-1 py-0.5 text-right"
                         [ngModel]="c.domainRating" (ngModelChange)="patch(c, 'domainRating', $event)" />
                </td>
                <td class="px-4 py-2 text-right">
                  <input type="number" class="w-20 text-xs border rounded px-1 py-0.5 text-right"
                         [ngModel]="c.estimatedTraffic" (ngModelChange)="patch(c, 'estimatedTraffic', $event)" />
                </td>
                <td class="px-4 py-2">
                  <input class="w-full text-xs border rounded px-1 py-0.5"
                         [ngModel]="c.notes" (ngModelChange)="patch(c, 'notes', $event)" />
                </td>
                <td class="px-4 py-2 text-right whitespace-nowrap">
                  @if (serviceAreas().length > 0) {
                    <select class="text-[10px] border border-ink-200 rounded px-1 py-0.5 bg-white mr-1"
                            [ngModel]="c.serviceAreaName || ''"
                            (ngModelChange)="patchScope(c, $event)"
                            title="Change scope">
                      <option value="">🌐 Global</option>
                      @for (a of serviceAreas(); track a.name) {
                        <option [value]="a.name">📍 {{ a.name }}</option>
                      }
                    </select>
                  }
                  <button class="text-red-500 hover:text-red-700" (click)="remove(c)">×</button>
                </td>
              </tr>
            }
            @if (!competitors().length) {
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-slate-400 italic">
                  No competitors registered.
                </td>
              </tr>
            } @else if (filteredCompetitors().length === 0) {
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-slate-400 italic">
                  No competitors match the current scope filter.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ClientCompetitorsTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  private svc = inject(CompetitorsService);
  private clientsSvc = inject(ClientsService);

  globalScope = GLOBAL_SCOPE;
  competitors = signal<Competitor[]>([]);
  client = signal<Client | null>(null);
  scopeFilter = signal<string>('');
  newC: Partial<Competitor> = {
    name: '',
    url: '',
    domainRating: undefined,
    serviceAreaName: '',
  };
  private debounce: Record<string, ReturnType<typeof setTimeout>> = {};

  serviceAreas = computed<ServiceArea[]>(
    () => this.client()?.serviceAreas ?? [],
  );

  globalCount = computed(
    () => this.competitors().filter((c) => !c.serviceAreaName).length,
  );

  countFor(areaName: string): number {
    return this.competitors().filter((c) => c.serviceAreaName === areaName)
      .length;
  }

  filteredCompetitors = computed(() => {
    const scope = this.scopeFilter();
    if (!scope) return this.competitors();
    if (scope === GLOBAL_SCOPE) {
      return this.competitors().filter((c) => !c.serviceAreaName);
    }
    return this.competitors().filter((c) => c.serviceAreaName === scope);
  });

  ngOnChanges() {
    this.load();
  }

  load() {
    this.svc.byClient(this.clientId).subscribe((c) => this.competitors.set(c));
    this.clientsSvc.get(this.clientId).subscribe((c) => this.client.set(c));
  }

  add() {
    if (!this.newC.name || !this.newC.url) return;
    this.svc
      .create({
        ...this.newC,
        clientId: this.clientId,
        serviceAreaName: this.newC.serviceAreaName?.trim() || undefined,
      } as Partial<Competitor>)
      .subscribe(() => {
        this.newC = {
          name: '',
          url: '',
          domainRating: undefined,
          serviceAreaName: '',
        };
        this.load();
      });
  }

  patch(c: Competitor, field: keyof Competitor, value: unknown) {
    if (!c._id) return;
    clearTimeout(this.debounce[c._id]);
    this.debounce[c._id] = setTimeout(() => {
      this.svc.update(c._id!, { [field]: value }).subscribe();
    }, 500);
  }

  patchScope(c: Competitor, value: string) {
    if (!c._id) return;
    // Setting to empty string clears the scope back to global.
    this.svc
      .update(c._id, { serviceAreaName: value || undefined })
      .subscribe(() => this.load());
  }

  remove(c: Competitor) {
    if (!c._id) return;
    this.svc.remove(c._id).subscribe(() => this.load());
  }
}
