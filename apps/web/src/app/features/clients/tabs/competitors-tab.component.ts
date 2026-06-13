import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Competitor } from '@seo/shared';
import { CompetitorsService } from '../../../core/competitors.service';

@Component({
  selector: 'app-client-competitors-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="card">
        <h3 class="font-semibold text-navy-700 mb-3">+ Competitor</h3>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newC.name" placeholder="Name" />
          <input class="input md:col-span-2" [(ngModel)]="newC.url" placeholder="https://..." />
          <input class="input" type="number" [(ngModel)]="newC.domainRating" placeholder="DR" />
        </div>
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newC.name || !newC.url">Create competitor</button>
      </div>

      <div class="card overflow-x-auto p-0">
        <table class="w-full text-sm min-w-[640px]">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-4 py-2 text-left">Competitor</th>
              <th class="px-4 py-2 text-left">URL</th>
              <th class="px-4 py-2 text-right">DR</th>
              <th class="px-4 py-2 text-right">Est. traffic</th>
              <th class="px-4 py-2 text-left">Notes</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (c of competitors(); track c._id) {
              <tr class="border-b border-slate-100">
                <td class="px-4 py-2 font-medium text-navy-700">{{ c.name }}</td>
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
                <td class="px-4 py-2 text-right">
                  <button class="text-red-500 hover:text-red-700" (click)="remove(c)">×</button>
                </td>
              </tr>
            }
            @if (!competitors().length) {
              <tr>
                <td colspan="6" class="px-4 py-8 text-center text-slate-400 italic">
                  No competitors registered.
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

  competitors = signal<Competitor[]>([]);
  newC: Partial<Competitor> = { name: '', url: '', domainRating: undefined };
  private debounce: Record<string, ReturnType<typeof setTimeout>> = {};

  ngOnChanges() {
    this.load();
  }

  load() {
    this.svc.byClient(this.clientId).subscribe((c) => this.competitors.set(c));
  }

  add() {
    if (!this.newC.name || !this.newC.url) return;
    this.svc.create({ ...this.newC, clientId: this.clientId } as Partial<Competitor>).subscribe(() => {
      this.newC = { name: '', url: '', domainRating: undefined };
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

  remove(c: Competitor) {
    if (!c._id) return;
    this.svc.remove(c._id).subscribe(() => this.load());
  }
}
