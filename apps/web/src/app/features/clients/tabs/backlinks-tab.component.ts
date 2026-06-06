import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Backlink, BacklinkStatus, BacklinkType } from '@seo/shared';
import { BacklinksService } from '../../../core/backlinks.service';

@Component({
  selector: 'app-client-backlinks-tab',
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
          <div class="text-xs text-slate-500">Dofollow</div>
          <div class="text-2xl font-bold text-emerald-600">{{ summary().dofollow }}</div>
        </div>
        @for (s of summary().perStatus; track s._id) {
          <div class="card text-center">
            <div class="text-xs text-slate-500 capitalize">{{ s._id }}</div>
            <div class="text-2xl font-bold" [ngClass]="statusColor(s._id)">{{ s.count }}</div>
          </div>
        }
      </div>

      <div class="card">
        <h3 class="font-semibold text-navy-700 mb-3">+ Backlink</h3>
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newBl.sourceUrl" placeholder="Source URL (https://...)" />
          <input class="input md:col-span-2" [(ngModel)]="newBl.targetUrl" placeholder="Target URL on the site" />
          <input class="input" [(ngModel)]="newBl.anchorText" placeholder="Anchor text" />
          <input class="input" type="number" [(ngModel)]="newBl.domainRating" placeholder="DR" />
          <select class="input" [(ngModel)]="newBl.linkType">
            <option value="dofollow">dofollow</option>
            <option value="nofollow">nofollow</option>
          </select>
          <select class="input" [(ngModel)]="newBl.status">
            <option value="live">live</option>
            <option value="pending">pending</option>
            <option value="lost">lost</option>
          </select>
        </div>
        <button class="btn-primary mt-3" (click)="add()"
                [disabled]="!newBl.sourceUrl || !newBl.targetUrl || !newBl.anchorText">
          Create backlink
        </button>
      </div>

      <div class="card overflow-hidden p-0">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              <th class="px-3 py-2 text-left">Source domain</th>
              <th class="px-3 py-2 text-left">Anchor</th>
              <th class="px-3 py-2 text-left">→ Target URL</th>
              <th class="px-3 py-2 text-right">DR</th>
              <th class="px-3 py-2 text-left">Type</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            @for (b of backlinks(); track b._id) {
              <tr class="border-b border-slate-100">
                <td class="px-3 py-2 text-xs">
                  <a [href]="b.sourceUrl" target="_blank" class="text-navy-500 hover:underline font-medium">
                    {{ b.sourceDomain }}
                  </a>
                </td>
                <td class="px-3 py-2 text-xs italic">{{ b.anchorText }}</td>
                <td class="px-3 py-2 text-xs text-slate-500">{{ b.targetUrl }}</td>
                <td class="px-3 py-2 text-right">{{ b.domainRating ?? '—' }}</td>
                <td class="px-3 py-2 text-xs">
                  <span [class]="b.linkType === 'dofollow' ? 'text-emerald-600 font-semibold' : 'text-slate-500'">
                    {{ b.linkType }}
                  </span>
                </td>
                <td class="px-3 py-2 text-xs">
                  <select class="text-xs border rounded px-1 py-0.5" [ngModel]="b.status" (ngModelChange)="updateStatus(b, $event)">
                    <option value="live">live</option>
                    <option value="pending">pending</option>
                    <option value="lost">lost</option>
                  </select>
                </td>
                <td class="px-3 py-2 text-right">
                  <button class="text-red-500 hover:text-red-700" (click)="remove(b)">×</button>
                </td>
              </tr>
            }
            @if (!backlinks().length) {
              <tr>
                <td colspan="7" class="px-4 py-8 text-center text-slate-400 italic">
                  No backlinks registered.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class ClientBacklinksTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  private svc = inject(BacklinksService);

  backlinks = signal<Backlink[]>([]);
  summary = signal<{
    perStatus: Array<{ _id: string; count: number; avgDr: number }>;
    total: number;
    dofollow: number;
  }>({ perStatus: [], total: 0, dofollow: 0 });

  newBl: Partial<Backlink> = {
    sourceUrl: '',
    targetUrl: '',
    anchorText: '',
    domainRating: undefined,
    linkType: 'dofollow' as BacklinkType,
    status: 'live' as BacklinkStatus,
  };

  ngOnChanges() {
    this.load();
  }

  load() {
    this.svc.byClient(this.clientId).subscribe((b) => this.backlinks.set(b));
    this.svc.summary(this.clientId).subscribe((s) => this.summary.set(s));
  }

  add() {
    if (!this.newBl.sourceUrl || !this.newBl.targetUrl || !this.newBl.anchorText) return;
    this.svc.create({ ...this.newBl, clientId: this.clientId } as Partial<Backlink>).subscribe(() => {
      this.newBl = {
        sourceUrl: '',
        targetUrl: '',
        anchorText: '',
        domainRating: undefined,
        linkType: 'dofollow',
        status: 'live',
      };
      this.load();
    });
  }

  updateStatus(b: Backlink, status: BacklinkStatus) {
    if (!b._id) return;
    this.svc.update(b._id, { status }).subscribe(() => this.load());
  }

  remove(b: Backlink) {
    if (!b._id) return;
    this.svc.remove(b._id).subscribe(() => this.load());
  }

  statusColor(status: string) {
    switch (status) {
      case 'live': return 'text-emerald-600';
      case 'pending': return 'text-amber-600';
      case 'lost': return 'text-red-500';
      default: return 'text-slate-700';
    }
  }
}
