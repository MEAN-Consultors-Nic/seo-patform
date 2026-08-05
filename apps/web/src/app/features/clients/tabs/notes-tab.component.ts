import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Client, ClientNote, ClientNoteAttachment } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { CloudinaryService } from '../../../core/cloudinary.service';
import { SanitizerService } from '../../../core/sanitizer.service';
import { FileDropDirective } from '../../../shared/file-drop.directive';
import { RichTextEditorComponent } from '../../../shared/rich-text-editor.component';

/**
 * Notes tab — multiple free-text notes per client, each with its own
 * attachments. Sits right after Overview in the sidebar for easy
 * access during a call.
 *
 * Compose card at the top for new entries; existing notes render below
 * as cards ordered newest-first. Each card supports inline edit,
 * delete, and drop-to-attach (same Cloudinary flow the Files tab
 * already uses).
 */
@Component({
  selector: 'app-client-notes-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    FileDropDirective,
    RichTextEditorComponent,
  ],
  template: `
    <div class="space-y-4">
      <!-- Hidden file input reused for every attach-file button on the
           page. The pendingAttachNoteId signal tracks which note the
           picked file belongs to. -->
      <input #fileInput type="file" class="hidden" (change)="onFilePicked($event)" />

      <!-- Compose card -->
      <div class="card space-y-2">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-ink-900">Notes</h3>
            <p class="text-xs text-ink-500 mt-0.5 max-w-lg">
              Running log for this client — meeting recaps, decisions,
              open questions. Notes support attachments (screenshots,
              PDFs, docs) and are ordered newest-first.
            </p>
          </div>
        </div>

        <app-rich-text-editor
          [(value)]="composeText"
          placeholder="Write a note…"
          [styles]="{ minHeight: '140px' }"></app-rich-text-editor>
        <div class="flex items-center justify-between">
          <div class="text-[11px] text-ink-500">
            Tip: create the note first, then drop files onto its card
            to attach — one flow for pasting a screenshot after saving.
          </div>
          <button
            type="button"
            class="btn-primary text-sm"
            [disabled]="saving() || !hasVisibleCompose()"
            (click)="save()">
            {{ saving() ? 'Saving…' : '＋ Add note' }}
          </button>
        </div>
      </div>

      @if (toast(); as t) {
        <div
          class="text-xs px-3 py-2 rounded"
          [class.bg-positive-100]="t.type === 'success'"
          [class.text-positive-500]="t.type === 'success'"
          [class.bg-danger-100]="t.type === 'error'"
          [class.text-danger-500]="t.type === 'error'">
          {{ t.msg }}
        </div>
      }

      <!-- Existing notes. Each card is its own drop target so an
           attach lands on the intended note (rather than a global
           "add to last note" heuristic). -->
      @if (sortedNotes().length === 0) {
        <div class="card text-center text-ink-400 italic text-sm py-10">
          No notes yet. Start with a quick recap of your last call.
        </div>
      } @else {
        @for (note of sortedNotes(); track note._id) {
          <div
            class="card space-y-2"
            [appFileDrop]="cloudinary.isConfigured() && !attachingNoteId()"
            #drop="fileDrop"
            (filesDropped)="onFilesDroppedOnNote(note, $event)">
            <div class="flex items-start justify-between gap-2">
              <div class="text-[11px] text-ink-500">
                @if (note.authorName) {
                  <span class="font-semibold text-ink-700">{{ note.authorName }}</span>
                  ·
                }
                <span>{{ note.createdAt | date: 'medium' }}</span>
                @if (note.updatedAt && stringOf(note.updatedAt) !== stringOf(note.createdAt)) {
                  <span class="text-ink-400"> · edited {{ note.updatedAt | date: 'medium' }}</span>
                }
              </div>
              <div class="flex items-center gap-1 text-xs">
                @if (editingId() === note._id) {
                  <button type="button" class="text-ink-500 hover:text-ink-900 px-2 py-0.5" (click)="cancelEdit()">Cancel</button>
                  <button type="button" class="text-brand-500 font-semibold hover:text-brand-600 px-2 py-0.5"
                          [disabled]="saving()"
                          (click)="commitEdit(note)">Save</button>
                } @else {
                  <button
                    type="button"
                    class="text-ink-500 hover:text-ink-900 px-2 py-0.5"
                    [disabled]="!cloudinary.isConfigured() || attachingNoteId() === note._id"
                    [title]="cloudinary.isConfigured() ? 'Attach file' : 'Cloudinary not configured'"
                    (click)="triggerPicker(note)">
                    {{ attachingNoteId() === note._id
                        ? 'Uploading ' + attachProgress() + '%…'
                        : '📎 Attach' }}
                  </button>
                  <button type="button" class="text-ink-500 hover:text-ink-900 px-2 py-0.5" (click)="startEdit(note)">Edit</button>
                  <button type="button" class="text-danger-500 hover:text-danger-600 px-2 py-0.5" (click)="remove(note)">Delete</button>
                }
              </div>
            </div>

            @if (editingId() === note._id) {
              <app-rich-text-editor
                [(value)]="editingText"
                placeholder="Update the note…"
                [styles]="{ minHeight: '140px' }"></app-rich-text-editor>
            } @else if (looksLikeHtml(note.content)) {
              <!-- Post-rich-text: sanitize + render as HTML so lists,
                   links, and formatting come through. -->
              <div class="rich-content text-sm text-ink-900 leading-relaxed"
                   [innerHTML]="sanitize(note.content)"></div>
            } @else {
              <!-- Pre-rich-text notes are plain text without <br>
                   markup; keep whitespace-pre-wrap so line breaks
                   don't collapse. -->
              <div class="text-sm text-ink-900 whitespace-pre-wrap break-words">{{ note.content }}</div>
            }

            <!-- Drop-target hint appears only when the user is
                 actively dragging files over this note. Keeps the
                 rest of the card visually quiet. -->
            @if (drop.active) {
              <div class="border-2 border-dashed border-brand-500 rounded-md py-3 text-center text-xs font-semibold uppercase tracking-wider text-brand-500 bg-brand-500/10">
                📎 Drop to attach to this note
              </div>
            }

            @if ((note.attachments?.length ?? 0) > 0) {
              <ul class="divide-y divide-ink-100 border border-ink-200 rounded-md">
                @for (a of note.attachments; track a.publicId) {
                  <li class="flex items-center gap-3 px-3 py-2 text-xs">
                    @if (isImage(a)) {
                      <img [src]="a.thumbnailUrl || a.url" class="w-10 h-10 object-cover rounded" alt="" />
                    } @else {
                      <span class="w-10 h-10 grid place-items-center rounded bg-ink-100 text-ink-500 text-base">📄</span>
                    }
                    <div class="flex-1 min-w-0">
                      <a [href]="a.url" target="_blank" rel="noopener"
                         class="text-brand-500 hover:underline truncate block">
                        {{ a.originalFilename || 'File' }}
                      </a>
                      <span class="text-ink-400">{{ (a.format || '').toUpperCase() }}{{ a.bytes ? ' · ' + formatBytes(a.bytes) : '' }}</span>
                    </div>
                    <button
                      type="button"
                      class="text-danger-500 hover:text-danger-600 text-[11px]"
                      (click)="removeAttachment(note, a)">
                      Remove
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        }
      }
    </div>
  `,
})
export class ClientNotesTabComponent implements OnChanges {
  @Input({ required: true }) clientId!: string;
  @Input() notes: ClientNote[] = [];
  @Output() changed = new EventEmitter<Client>();

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private svc = inject(ClientsService);
  private sanitizer = inject(SanitizerService);
  cloudinary = inject(CloudinaryService);

  // Signal-based so `[(value)]` two-way binding on <app-rich-text-editor>
  // can write through directly — its `value` input is a model() signal.
  composeText = signal<string | undefined>('');
  saving = signal(false);

  editingId = signal<string | null>(null);
  editingText = signal<string | undefined>('');

  attachingNoteId = signal<string | null>(null);
  attachProgress = signal(0);

  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  /**
   * When the user clicks Attach on a specific note, we stash the id
   * here so the file input's change handler knows which note the
   * upload belongs to.
   */
  private pendingAttachNoteId = signal<string | null>(null);

  // Local copy so we can re-sort without mutating the parent's array.
  private notesSig = signal<ClientNote[]>([]);

  sortedNotes = computed<ClientNote[]>(() =>
    [...this.notesSig()].sort((a, b) => {
      const ad = new Date(a.createdAt || 0).getTime();
      const bd = new Date(b.createdAt || 0).getTime();
      return bd - ad;
    }),
  );

  ngOnChanges() {
    this.notesSig.set(this.notes || []);
  }

  save() {
    const html = (this.composeText() || '').trim();
    // Empty <p></p> and other whitespace-only Quill output shouldn't
    // count as a real note — SanitizerService knows how to strip
    // tags for the visibility check.
    if (!this.sanitizer.hasVisibleContent(html)) return;
    this.saving.set(true);
    this.svc.addNote(this.clientId, html).subscribe({
      next: (client) => {
        this.saving.set(false);
        this.composeText.set('');
        this.applyClient(client);
        this.flashToast('success', 'Note added.');
      },
      error: (err) => {
        this.saving.set(false);
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Could not save note: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
    });
  }

  startEdit(n: ClientNote) {
    if (!n._id) return;
    this.editingId.set(n._id);
    this.editingText.set(n.content);
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editingText.set('');
  }

  commitEdit(n: ClientNote) {
    if (!n._id) return;
    const html = (this.editingText() || '').trim();
    if (!this.sanitizer.hasVisibleContent(html)) return;
    this.saving.set(true);
    this.svc.updateNote(this.clientId, n._id, html).subscribe({
      next: (client) => {
        this.saving.set(false);
        this.editingId.set(null);
        this.editingText.set('');
        this.applyClient(client);
      },
      error: (err) => {
        this.saving.set(false);
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Could not update note: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
    });
  }

  /**
   * Compose Save-button gate. Quill always emits *some* HTML even
   * when the field looks empty (`<p><br></p>`), so plain
   * length checks don't cut it.
   */
  hasVisibleCompose(): boolean {
    return this.sanitizer.hasVisibleContent(this.composeText());
  }

  /**
   * Cheap check: does the stored content include any HTML tag? If
   * yes, render via sanitized [innerHTML]; if no, it's a plain-text
   * legacy note and stays under whitespace-pre-wrap. Cheaper than a
   * full parse and stable for the shapes Quill emits.
   */
  looksLikeHtml(content: string | undefined | null): boolean {
    return /<[a-z][\s\S]*>/i.test(content || '');
  }

  sanitize(html: string | undefined | null) {
    return this.sanitizer.trustRichHtml(html);
  }

  remove(n: ClientNote) {
    if (!n._id) return;
    if (!confirm('Delete this note? Attached files will also be removed.')) return;
    this.svc.removeNote(this.clientId, n._id).subscribe({
      next: () => {
        this.notesSig.set(this.notesSig().filter((x) => x._id !== n._id));
        // Emit a full-client refresh signal upward so any Overview
        // tile that counts notes stays in sync.
        this.changed.emit();
      },
      error: (err) => {
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Could not delete note: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
    });
  }

  triggerPicker(n: ClientNote) {
    if (!n._id || !this.fileInput) return;
    if (!this.cloudinary.isConfigured()) {
      this.flashToast('error', 'Cloudinary is not configured — cannot upload.');
      return;
    }
    this.pendingAttachNoteId.set(n._id);
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  async onFilePicked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    const noteId = this.pendingAttachNoteId();
    this.pendingAttachNoteId.set(null);
    if (!file || !noteId) return;
    await this.uploadForNote(noteId, file);
  }

  async onFilesDroppedOnNote(n: ClientNote, files: File[]) {
    if (!n._id) return;
    if (!this.cloudinary.isConfigured()) {
      this.flashToast('error', 'Cloudinary is not configured — cannot upload.');
      return;
    }
    if (this.attachingNoteId()) return;
    for (const f of files) {
      await this.uploadForNote(n._id, f);
    }
  }

  private async uploadForNote(noteId: string, file: File) {
    this.attachingNoteId.set(noteId);
    this.attachProgress.set(0);
    try {
      const result = await this.cloudinary.upload(file, (pct) =>
        this.attachProgress.set(pct),
      );
      await new Promise<void>((resolve) => {
        this.svc
          .addNoteAttachment(this.clientId, noteId, {
            publicId: result.publicId,
            url: result.url,
            thumbnailUrl: result.thumbnailUrl,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            resourceType: result.resourceType,
            originalFilename: result.originalFilename,
          })
          .subscribe({
            next: (client) => {
              this.attachingNoteId.set(null);
              this.attachProgress.set(0);
              this.applyClient(client);
              this.flashToast('success', `Attached ${file.name}.`);
              resolve();
            },
            error: (err) => {
              this.attachingNoteId.set(null);
              const m = err?.error?.message;
              this.flashToast(
                'error',
                `Attach failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
              );
              resolve();
            },
          });
      });
    } catch (err) {
      this.attachingNoteId.set(null);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      this.flashToast('error', `Upload failed: ${msg}`);
    }
  }

  removeAttachment(n: ClientNote, a: ClientNoteAttachment) {
    if (!n._id) return;
    if (!confirm(`Delete ${a.originalFilename || 'this file'}?`)) return;
    this.svc.removeNoteAttachment(this.clientId, n._id, a.publicId).subscribe({
      next: (client) => this.applyClient(client),
      error: (err) => {
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Delete failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
    });
  }

  isImage(a: ClientNoteAttachment): boolean {
    const imgFormats = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'];
    const fmt = (a.format || '').toLowerCase();
    if (a.resourceType === 'image' && imgFormats.includes(fmt)) return true;
    if (!a.resourceType && imgFormats.includes(fmt)) return true;
    const name = (a.originalFilename || a.url || '').toLowerCase();
    return imgFormats.some((f) => name.endsWith(`.${f}`));
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  stringOf(v: Date | string | undefined): string {
    return v ? new Date(v).toISOString() : '';
  }

  private applyClient(client: Client) {
    this.notesSig.set(client.notes || []);
    this.changed.emit(client);
  }

  private flashToast(type: 'success' | 'error', msg: string) {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
