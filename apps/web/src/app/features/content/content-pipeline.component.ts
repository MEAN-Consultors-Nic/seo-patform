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

      <div class="grid grid-cols-2 lg:grid-cols-6 gap-3">
        @for (status of statuses; track status) {
          <div class="bg-slate-50 rounded-lg p-3 min-h-[200px]">
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wide text-slate-600">{{ status }}</span>
              <span class="text-xs text-slate-400">{{ countByStatus()[status] || 0 }}</span>
            </div>
            <div class="space-y-2">
              @for (p of byStatus()[status] || []; track p._id) {
                <div class="bg-white rounded-md p-2 shadow-sm border border-slate-200 text-sm hover:border-navy-500 transition">
                  <div class="font-medium text-navy-700 leading-tight">{{ p.title }}</div>
                  <div class="text-xs text-slate-400 mt-1">{{ clientName(p.clientId) }}</div>
                  @if (p.targetKeyword) {
                    <div class="text-xs text-teal-600 mt-1">🎯 {{ p.targetKeyword }}</div>
                  }
                  <div class="flex items-center justify-between mt-2">
                    <select class="text-xs border rounded px-1 py-0.5" [ngModel]="p.status"
                            (ngModelChange)="changeStatus(p, $event)">
                      @for (s of statuses; track s) {
                        <option [value]="s">{{ s }}</option>
                      }
                    </select>
                    <button class="text-xs text-red-400 hover:text-red-600" (click)="remove(p)">×</button>
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
    this.svc.update(p._id, { status }).subscribe(() => this.load());
  }

  remove(p: ContentPiece) {
    if (!p._id) return;
    this.svc.remove(p._id).subscribe(() => this.load());
  }
}
