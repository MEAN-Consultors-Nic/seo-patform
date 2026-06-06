import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ContentPiece, ContentStatus, CONTENT_STATUSES } from '@seo/shared';
import { ContentService } from '../../../core/content.service';

@Component({
  selector: 'app-client-content-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="card">
        <h3 class="text-sm font-semibold text-ink-900 mb-3">+ New piece</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newPiece.title" placeholder="Piece title" />
          <input class="input" [(ngModel)]="newPiece.targetKeyword" placeholder="Target keyword" />
          <select class="input" [(ngModel)]="newPiece.status">
            @for (s of statuses; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </div>
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newPiece.title">Add to pipeline</button>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
        @for (status of statuses; track status) {
          <div class="bg-white border border-ink-200 rounded-lg p-3 min-h-[200px]">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[10px] font-bold uppercase tracking-wider text-ink-600">{{ status }}</span>
              <span class="text-xs font-semibold text-ink-400">{{ byStatus()[status]?.length || 0 }}</span>
            </div>
            <div class="space-y-2">
              @for (p of byStatus()[status] || []; track p._id) {
                <div class="bg-ink-50 rounded-md p-2 border border-ink-200 text-sm hover:border-brand-500 hover:shadow-sm transition-all cursor-pointer">
                  <div class="font-medium text-ink-900 leading-tight text-xs">{{ p.title }}</div>
                  @if (p.targetKeyword) {
                    <div class="text-[10px] text-brand-600 mt-1 font-medium">🎯 {{ p.targetKeyword }}</div>
                  }
                  <div class="flex items-center justify-between mt-2">
                    <select class="text-[10px] border border-ink-200 rounded px-1 py-0.5 bg-white" [ngModel]="p.status" (ngModelChange)="changeStatus(p, $event)">
                      @for (s of statuses; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                    <button class="text-ink-400 hover:text-danger-500 text-sm leading-none" (click)="remove(p)">×</button>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class ClientContentTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  private svc = inject(ContentService);

  pieces = signal<ContentPiece[]>([]);
  statuses: ContentStatus[] = CONTENT_STATUSES;

  newPiece: Partial<ContentPiece> = { title: '', targetKeyword: '', status: 'idea' };

  byStatus = computed(() => {
    const map: Record<string, ContentPiece[]> = {};
    for (const p of this.pieces()) {
      (map[p.status] ||= []).push(p);
    }
    return map;
  });

  ngOnChanges() {
    this.load();
  }

  load() {
    this.svc.list({ clientId: this.clientId }).subscribe((p) => this.pieces.set(p));
  }

  add() {
    if (!this.newPiece.title) return;
    this.svc.create({ ...this.newPiece, clientId: this.clientId }).subscribe(() => {
      this.newPiece = { title: '', targetKeyword: '', status: 'idea' };
      this.load();
    });
  }

  changeStatus(p: ContentPiece, status: ContentStatus) {
    if (!p._id) return;
    this.svc.update(p._id, { status }).subscribe(() => this.load());
  }

  remove(p: ContentPiece) {
    if (!p._id) return;
    this.svc.remove(p._id).subscribe(() => this.load());
  }
}
