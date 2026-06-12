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

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        @for (status of statuses; track status) {
          <div class="bg-white border border-ink-200 rounded-lg p-4 min-h-[260px]">
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-ink-100">
              <span class="text-[11px] font-bold uppercase tracking-wider"
                    [class.text-ink-700]="status !== 'published'"
                    [class.text-positive-500]="status === 'published'">
                {{ status }}
              </span>
              <span class="text-xs font-bold text-ink-500 bg-ink-100 rounded-full px-2 py-0.5">
                {{ byStatus()[status]?.length || 0 }}
              </span>
            </div>
            <div class="space-y-2">
              @for (p of byStatus()[status] || []; track p._id) {
                <div class="bg-ink-50 rounded-md p-2.5 border border-ink-200 text-sm hover:border-brand-500 hover:shadow-sm transition-all">
                  <div class="font-medium text-ink-900 leading-tight text-xs">{{ p.title }}</div>
                  @if (p.targetKeyword) {
                    <div class="text-[10px] text-brand-600 mt-1 font-medium">🎯 {{ p.targetKeyword }}</div>
                  }
                  @if (p.publishedUrl) {
                    <a [href]="p.publishedUrl" target="_blank" rel="noopener"
                       class="block text-[10px] text-positive-500 hover:underline mt-1 font-medium truncate"
                       [title]="p.publishedUrl">
                      ↗ {{ p.publishedUrl }}
                    </a>
                  }
                  <div class="flex items-center justify-between mt-2 gap-1">
                    <select class="text-[10px] border border-ink-200 rounded px-1 py-0.5 bg-white flex-1"
                            [ngModel]="p.status"
                            (ngModelChange)="changeStatus(p, $event)">
                      @for (s of statuses; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                    @if (p.status === 'published') {
                      <button class="text-[10px] text-ink-500 hover:text-brand-500 px-1 leading-none"
                              (click)="openPublishModal(p)"
                              title="Edit published URL">
                        ✎
                      </button>
                    }
                    <button class="text-ink-400 hover:text-danger-500 text-sm leading-none px-1"
                            (click)="remove(p)" title="Remove piece">×</button>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Published URL modal -->
    @if (publishModalPiece(); as p) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="dismissPublishModal()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-lg p-6"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h2 class="text-lg font-bold text-ink-900">🎉 Moved to Published</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Save the URL where this piece went live.
              </p>
            </div>
            <button type="button" (click)="dismissPublishModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="bg-ink-50 border border-ink-200 rounded p-3 mb-4 text-xs">
            <div class="text-ink-500 text-[10px] uppercase tracking-wider font-bold mb-1">Piece</div>
            <div class="font-medium text-ink-900">{{ p.title }}</div>
            @if (p.targetKeyword) {
              <div class="text-brand-600 mt-0.5">🎯 {{ p.targetKeyword }}</div>
            }
          </div>

          <div>
            <label class="label">Published URL</label>
            <input class="input"
                   [(ngModel)]="publishUrlInput"
                   placeholder="https://example.com/blog/my-piece"
                   (keyup.enter)="savePublishUrl()"
                   #urlInput
                   autofocus />
            <p class="text-[11px] text-ink-400 mt-1">
              Used in client-facing reports to link to the live page.
            </p>
          </div>

          @if (publishError()) {
            <div class="text-xs text-danger-500 mt-2">{{ publishError() }}</div>
          }

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="skipPublishUrl()" [disabled]="publishSaving()">
              Skip for now
            </button>
            <button class="btn-primary" (click)="savePublishUrl()"
                    [disabled]="publishSaving() || !publishUrlInput.trim()">
              {{ publishSaving() ? 'Saving…' : 'Save URL' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientContentTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  private svc = inject(ContentService);

  pieces = signal<ContentPiece[]>([]);
  statuses: ContentStatus[] = CONTENT_STATUSES;

  newPiece: Partial<ContentPiece> = { title: '', targetKeyword: '', status: 'idea' };

  // Published URL modal state
  publishModalPiece = signal<ContentPiece | null>(null);
  publishUrlInput = '';
  publishSaving = signal(false);
  publishError = signal<string | null>(null);

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
    // Intercept the transition into 'published' so we can capture the URL
    // in one step. Existing published pieces keep their URL untouched.
    if (status === 'published' && p.status !== 'published') {
      this.openPublishModal(p);
      return;
    }
    this.svc.update(p._id, { status }).subscribe(() => this.load());
  }

  openPublishModal(p: ContentPiece) {
    this.publishUrlInput = p.publishedUrl ?? '';
    this.publishError.set(null);
    this.publishModalPiece.set(p);
  }

  dismissPublishModal() {
    if (this.publishSaving()) return;
    this.publishModalPiece.set(null);
    this.publishUrlInput = '';
    this.publishError.set(null);
  }

  savePublishUrl() {
    const piece = this.publishModalPiece();
    if (!piece?._id) return;
    const url = this.publishUrlInput.trim();
    if (!url) return;
    this.publishSaving.set(true);
    this.publishError.set(null);
    this.svc
      .update(piece._id, { status: 'published', publishedUrl: url })
      .subscribe({
        next: () => {
          this.publishSaving.set(false);
          this.publishModalPiece.set(null);
          this.publishUrlInput = '';
          this.load();
        },
        error: (err) => {
          this.publishSaving.set(false);
          const m = err?.error?.message;
          this.publishError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not save',
          );
        },
      });
  }

  skipPublishUrl() {
    const piece = this.publishModalPiece();
    if (!piece?._id) return;
    this.publishSaving.set(true);
    this.svc.update(piece._id, { status: 'published' }).subscribe({
      next: () => {
        this.publishSaving.set(false);
        this.publishModalPiece.set(null);
        this.publishUrlInput = '';
        this.load();
      },
      error: (err) => {
        this.publishSaving.set(false);
        const m = err?.error?.message;
        this.publishError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not save',
        );
      },
    });
  }

  remove(p: ContentPiece) {
    if (!p._id) return;
    this.svc.remove(p._id).subscribe(() => this.load());
  }
}
