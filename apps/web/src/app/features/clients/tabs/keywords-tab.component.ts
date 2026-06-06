import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Keyword, KeywordIntent } from '@seo/shared';
import { KeywordsService } from '../../../core/keywords.service';

@Component({
  selector: 'app-client-keywords-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="card text-center">
          <div class="text-xs text-slate-500">Total</div>
          <div class="text-2xl font-bold text-navy-700">{{ summary().total }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-slate-500">Top 3</div>
          <div class="text-2xl font-bold text-emerald-600">{{ summary().top3 }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-slate-500">Top 10</div>
          <div class="text-2xl font-bold text-teal-600">{{ summary().top10 }}</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-slate-500">Avg position</div>
          <div class="text-2xl font-bold text-navy-700">
            {{ summary().avgPosition !== null ? (summary().avgPosition | number: '1.1-1') : '—' }}
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="font-semibold text-navy-700 mb-3">+ New keyword</h3>
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newKw.text" placeholder="Keyword" />
          <input class="input md:col-span-2" [(ngModel)]="newKw.targetUrl" placeholder="/target-url" />
          <input class="input" type="number" [(ngModel)]="newKw.volume" placeholder="Volume" />
          <input class="input" type="number" [(ngModel)]="newKw.difficulty" placeholder="KD %" />
          <select class="input" [(ngModel)]="newKw.intent">
            <option value="">Intent</option>
            @for (i of intents; track i) {
              <option [value]="i">{{ i }}</option>
            }
          </select>
          <input class="input" [(ngModel)]="newKw.group" placeholder="Group (e.g. local)" />
        </div>
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newKw.text">Create keyword</button>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-4 py-2 text-left">Keyword</th>
              <th class="px-4 py-2 text-left">Group</th>
              <th class="px-4 py-2 text-right">Vol.</th>
              <th class="px-4 py-2 text-right">KD</th>
              <th class="px-4 py-2 text-right">Current pos.</th>
              <th class="px-4 py-2 text-right">Previous</th>
              <th class="px-4 py-2 text-right">Δ</th>
              <th class="px-4 py-2 text-right">New pos.</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (k of keywords(); track k._id) {
              <tr class="border-b border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-2">
                  <div class="font-medium text-navy-700">{{ k.text }}</div>
                  @if (k.targetUrl) {
                    <div class="text-xs text-slate-400">{{ k.targetUrl }}</div>
                  }
                </td>
                <td class="px-4 py-2 text-xs text-slate-500">{{ k.group || '—' }}</td>
                <td class="px-4 py-2 text-right">{{ k.volume ?? '—' }}</td>
                <td class="px-4 py-2 text-right">{{ k.difficulty ?? '—' }}</td>
                <td class="px-4 py-2 text-right font-semibold">
                  <span [ngClass]="positionClass(k.currentPosition)">
                    {{ k.currentPosition ?? '—' }}
                  </span>
                </td>
                <td class="px-4 py-2 text-right text-slate-400">{{ k.previousPosition ?? '—' }}</td>
                <td class="px-4 py-2 text-right text-xs" [ngClass]="deltaClass(k)">
                  {{ delta(k) }}
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <input type="number" class="w-16 text-xs border rounded px-1 py-0.5 text-right"
                           #posInput placeholder="—" />
                    <button class="text-xs text-navy-700 hover:underline"
                            (click)="record(k, posInput.value); posInput.value=''">
                      ✓
                    </button>
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <button class="text-red-500 hover:text-red-700" (click)="remove(k)">×</button>
                </td>
              </tr>
            }
            @if (!keywords().length) {
              <tr>
                <td colspan="9" class="px-4 py-8 text-center text-slate-400 italic">
                  No keywords registered. Add the first one above.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ClientKeywordsTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  private svc = inject(KeywordsService);

  keywords = signal<Keyword[]>([]);
  summary = signal<{ total: number; ranked: number; top3: number; top10: number; avgPosition: number | null }>({
    total: 0,
    ranked: 0,
    top3: 0,
    top10: 0,
    avgPosition: null,
  });
  intents: KeywordIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];

  newKw: Partial<Keyword> = { text: '', targetUrl: '', volume: undefined, difficulty: undefined, intent: undefined, group: '' };

  ngOnChanges() {
    this.load();
  }

  load() {
    this.svc.byClient(this.clientId).subscribe((k) => this.keywords.set(k));
    this.svc.summary(this.clientId).subscribe((s) => this.summary.set(s));
  }

  add() {
    if (!this.newKw.text?.trim()) return;
    this.svc.create({ ...this.newKw, clientId: this.clientId } as Partial<Keyword>).subscribe(() => {
      this.newKw = { text: '', targetUrl: '', volume: undefined, difficulty: undefined, intent: undefined, group: '' };
      this.load();
    });
  }

  record(k: Keyword, value: string) {
    const pos = Number(value);
    if (!k._id || !pos || Number.isNaN(pos)) return;
    this.svc.recordPosition(k._id, { position: pos }).subscribe(() => this.load());
  }

  remove(k: Keyword) {
    if (!k._id) return;
    this.svc.remove(k._id).subscribe(() => this.load());
  }

  positionClass(pos?: number) {
    if (!pos) return 'text-slate-400';
    if (pos <= 3) return 'text-emerald-600';
    if (pos <= 10) return 'text-teal-600';
    if (pos <= 20) return 'text-amber-600';
    return 'text-slate-700';
  }

  delta(k: Keyword): string {
    if (k.currentPosition === undefined || k.previousPosition === undefined) return '—';
    const diff = k.previousPosition - k.currentPosition;
    if (diff === 0) return '0';
    return diff > 0 ? `▲ ${diff}` : `▼ ${Math.abs(diff)}`;
  }

  deltaClass(k: Keyword): string {
    if (k.currentPosition === undefined || k.previousPosition === undefined) return 'text-slate-400';
    const diff = k.previousPosition - k.currentPosition;
    if (diff > 0) return 'text-emerald-600 font-semibold';
    if (diff < 0) return 'text-red-500 font-semibold';
    return 'text-slate-400';
  }
}
