import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, ClientKnowledge } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';

@Component({
  selector: 'app-client-knowledge-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card max-w-3xl">
      <h2 class="font-semibold text-navy-700 mb-1">Knowledge base</h2>
      <p class="text-xs text-slate-500 mb-4">
        Notes you reference every time you work with this client — brand voice, target persona, rules, etc.
      </p>

      <div class="space-y-3 text-sm">
        <div>
          <label class="label">Brand voice / Tone</label>
          <textarea class="input" rows="2" [(ngModel)]="form.brandVoice"
            placeholder="e.g. Professional, direct, no jargon. Address the reader informally."></textarea>
        </div>

        <div>
          <label class="label">Target persona</label>
          <textarea class="input" rows="2" [(ngModel)]="form.targetPersona"
            placeholder="e.g. SMB owners in PR, 35-55, who value time-saving solutions."></textarea>
        </div>

        <div>
          <label class="label">Anchor text rules</label>
          <textarea class="input" rows="2" [(ngModel)]="form.anchorRules"
            placeholder="e.g. Keep ratio 60% branded, 30% partial-match, 10% exact-match."></textarea>
        </div>

        <div>
          <label class="label">Internal linking strategy</label>
          <textarea class="input" rows="2" [(ngModel)]="form.internalLinkingStrategy"
            placeholder="e.g. Pillar /seo-services → cluster pages with descriptive anchors."></textarea>
        </div>

        <div>
          <label class="label">Internal notes</label>
          <textarea class="input" rows="4" [(ngModel)]="form.internalNotes"
            placeholder="Any other relevant information: history, past decisions, context."></textarea>
        </div>

        <button class="btn-primary mt-2" (click)="save()">Save knowledge base</button>
      </div>
    </div>
  `,
})
export class ClientKnowledgeTab {
  private svc = inject(ClientsService);
  @Output() changed = new EventEmitter<void>();
  form: ClientKnowledge = {};
  private clientId?: string;

  @Input() set client(c: Client) {
    this.clientId = c._id;
    this.form = { ...(c.knowledge || {}) };
  }

  save() {
    if (!this.clientId) return;
    this.svc.update(this.clientId, { knowledge: this.form }).subscribe(() => this.changed.emit());
  }
}
