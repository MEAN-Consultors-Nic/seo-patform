import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, ContentPiece, ContentStatus, CONTENT_STATUSES } from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { ContentService } from '../../core/content.service';

@Component({
  selector: 'app-content-pipeline',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-8 max-w-7xl mx-auto">
      <header class="mb-6 flex items-start justify-between">
        <div>
          <h1 class="text-3xl font-bold text-navy-700">Content Pipeline</h1>
          <p class="text-slate-500 mt-1">Calendario editorial · idea → publicado</p>
        </div>
        <select class="input w-56" [(ngModel)]="clientFilter" (change)="load()">
          <option value="">Todos los clientes</option>
          @for (c of clients(); track c._id) {
            <option [value]="c._id">{{ c.name }}</option>
          }
        </select>
      </header>

      <div class="card mb-6">
        <h3 class="font-semibold text-navy-700 mb-3">+ Nueva pieza</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select class="input" [(ngModel)]="newPiece.clientId">
            <option value="">Cliente</option>
            @for (c of clients(); track c._id) {
              <option [value]="c._id">{{ c.name }}</option>
            }
          </select>
          <input class="input md:col-span-2" [(ngModel)]="newPiece.title" placeholder="Título" />
          <input class="input" [(ngModel)]="newPiece.targetKeyword" placeholder="Keyword objetivo" />
        </div>
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newPiece.title || !newPiece.clientId">
          Agregar a 'Idea'
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        @for (status of statuses; track status) {
          <div class="bg-slate-50 rounded-lg p-4 min-h-[260px]">
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
              <span class="text-xs font-bold uppercase tracking-wider"
                    [class.text-slate-600]="status !== 'published'"
                    [class.text-positive-500]="status === 'published'">
                {{ status }}
              </span>
              <span class="text-xs font-bold text-slate-500 bg-slate-200 rounded-full px-2 py-0.5">
                {{ countByStatus()[status] || 0 }}
              </span>
            </div>
            <div class="space-y-2">
              @for (p of byStatus()[status] || []; track p._id) {
                <div class="bg-white rounded-md p-2.5 shadow-sm border border-slate-200 text-sm hover:border-navy-500 transition">
                  <div class="font-medium text-navy-700 leading-tight">{{ p.title }}</div>
                  <div class="text-xs text-slate-400 mt-1">{{ clientName(p.clientId) }}</div>
                  @if (p.targetKeyword) {
                    <div class="text-xs text-teal-600 mt-1">🎯 {{ p.targetKeyword }}</div>
                  }
                  @if (p.publishedUrl) {
                    <a [href]="p.publishedUrl" target="_blank" rel="noopener"
                       class="block text-[10px] text-positive-500 hover:underline mt-1 font-medium truncate"
                       [title]="p.publishedUrl">
                      ↗ {{ p.publishedUrl }}
                    </a>
                  }
                  <div class="flex items-center justify-between mt-2 gap-1">
                    <select class="text-xs border rounded px-1 py-0.5 flex-1"
                            [ngModel]="p.status"
                            (ngModelChange)="changeStatus(p, $event)">
                      @for (s of statuses; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                    @if (p.status === 'published') {
                      <button class="text-xs text-slate-500 hover:text-navy-700 px-1"
                              (click)="openPublishModal(p)"
                              title="Edit published URL">✎</button>
                    }
                    <button class="text-xs text-red-400 hover:text-red-600 px-1" (click)="remove(p)">×</button>
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
              <h2 class="text-lg font-bold text-navy-700">🎉 Moved to Published</h2>
              <p class="text-xs text-slate-500 mt-0.5">
                Save the URL where this piece went live.
              </p>
            </div>
            <button type="button" (click)="dismissPublishModal()"
                    class="text-slate-400 hover:text-navy-700 text-2xl leading-none">×</button>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded p-3 mb-4 text-xs">
            <div class="text-slate-500 text-[10px] uppercase tracking-wider font-bold mb-1">Piece</div>
            <div class="font-medium text-navy-700">{{ p.title }}</div>
            @if (p.targetKeyword) {
              <div class="text-teal-600 mt-0.5">🎯 {{ p.targetKeyword }}</div>
            }
          </div>

          <div>
            <label class="label">Published URL</label>
            <input class="input"
                   [(ngModel)]="publishUrlInput"
                   placeholder="https://example.com/blog/my-piece"
                   (keyup.enter)="savePublishUrl()" />
            <p class="text-[11px] text-slate-400 mt-1">
              Used in client-facing reports to link to the live page.
            </p>
          </div>

          @if (publishError()) {
            <div class="text-xs text-red-500 mt-2">{{ publishError() }}</div>
          }

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-200">
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
export class ContentPipelineComponent implements OnInit {
  private clientsSvc = inject(ClientsService);
  private svc = inject(ContentService);

  clients = signal<Client[]>([]);
  pieces = signal<ContentPiece[]>([]);
  clientFilter = '';
  statuses: ContentStatus[] = CONTENT_STATUSES;

  newPiece: Partial<ContentPiece> = { title: '', clientId: '', targetKeyword: '', status: 'idea' };

  byStatus = computed(() => {
    const map: Record<string, ContentPiece[]> = {};
    for (const p of this.pieces()) {
      (map[p.status] ||= []).push(p);
    }
    return map;
  });

  countByStatus = computed(() => {
    const counts: Record<string, number> = {};
    for (const p of this.pieces()) counts[p.status] = (counts[p.status] || 0) + 1;
    return counts;
  });

  ngOnInit() {
    this.clientsSvc.list().subscribe((c) => this.clients.set(c));
    this.load();
  }

  load() {
    const filters = this.clientFilter ? { clientId: this.clientFilter } : {};
    this.svc.list(filters).subscribe((p) => this.pieces.set(p));
  }

  clientName(id: string): string {
    return this.clients().find((c) => c._id === id)?.name || '';
  }

  add() {
    if (!this.newPiece.title || !this.newPiece.clientId) return;
    this.svc.create(this.newPiece).subscribe(() => {
      this.newPiece = { title: '', clientId: this.newPiece.clientId, targetKeyword: '', status: 'idea' };
      this.load();
    });
  }

  changeStatus(p: ContentPiece, status: ContentStatus) {
    if (!p._id) return;
    if (status === 'published' && p.status !== 'published') {
      this.openPublishModal(p);
      return;
    }
    this.svc.update(p._id, { status }).subscribe(() => this.load());
  }

  // Published URL modal state
  publishModalPiece = signal<ContentPiece | null>(null);
  publishUrlInput = '';
  publishSaving = signal(false);
  publishError = signal<string | null>(null);

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
      error: () => {
        this.publishSaving.set(false);
      },
    });
  }

  remove(p: ContentPiece) {
    if (!p._id) return;
    this.svc.remove(p._id).subscribe(() => this.load());
  }
}
