import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, ClientContact } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';

@Component({
  selector: 'app-client-contacts-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card max-w-3xl">
      <h2 class="font-semibold text-navy-700 mb-3">Client contacts</h2>

      <div class="space-y-2 mb-4">
        @for (c of contacts(); track $index; let i = $index) {
          <div class="grid grid-cols-12 gap-2 items-center">
            <input class="input col-span-3" [(ngModel)]="c.name" placeholder="Name" />
            <input class="input col-span-4" [(ngModel)]="c.email" placeholder="Email" type="email" />
            <input class="input col-span-4" [(ngModel)]="c.role" placeholder="Role (e.g. CEO, Marketing Lead)" />
            <button class="text-red-500 hover:text-red-700 col-span-1 text-lg" (click)="remove(i)">×</button>
          </div>
        }
        @if (!contacts().length) {
          <p class="text-sm text-slate-400 italic">No contacts registered</p>
        }
      </div>

      <div class="flex gap-2">
        <button class="btn-secondary" (click)="addRow()">+ Contact</button>
        <button class="btn-primary" (click)="save()">Save</button>
      </div>
    </div>
  `,
})
export class ClientContactsTab {
  private svc = inject(ClientsService);
  @Output() changed = new EventEmitter<void>();
  contacts = signal<ClientContact[]>([]);
  private clientId?: string;

  @Input() set client(c: Client) {
    this.clientId = c._id;
    this.contacts.set([...(c.contacts || []).map((x) => ({ ...x }))]);
  }

  addRow() {
    this.contacts.update((arr) => [...arr, { name: '', email: '', role: '' }]);
  }

  remove(i: number) {
    this.contacts.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  save() {
    if (!this.clientId) return;
    const cleaned = this.contacts().filter((c) => c.name.trim() && c.email.trim());
    this.svc.update(this.clientId, { contacts: cleaned }).subscribe(() => this.changed.emit());
  }
}
