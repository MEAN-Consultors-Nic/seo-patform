import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TaskAttachment } from '@seo/shared';
import { CloudinaryService } from '../../core/cloudinary.service';
import { TasksService } from '../../core/tasks.service';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type LabelOption = 'before' | 'after' | 'other';

interface UploadDraft {
  file: File;
  previewUrl: string; // image preview, empty for non-image files
  isImage: boolean;
  label: LabelOption;
  caption: string;
}

@Component({
  selector: 'app-attachments-strip',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
      @for (a of attachments; track a.publicId) {
        <div class="group relative">
          @if (isImage(a)) {
            <button (click)="open(a)"
                    class="block w-10 h-10 rounded border border-ink-200 overflow-hidden hover:border-brand-500 transition">
              <img [src]="a.thumbnailUrl || a.url" [alt]="a.caption || a.label"
                   class="w-full h-full object-cover" />
            </button>
          } @else {
            <a [href]="a.url" target="_blank" rel="noopener"
               [title]="a.originalFilename || a.caption || 'Document'"
               class="flex flex-col items-center justify-center w-10 h-10 rounded border border-ink-200 bg-ink-50 text-ink-600 hover:border-brand-500 hover:text-brand-600 transition text-[8px] font-bold uppercase">
              <span class="text-base leading-none">📄</span>
              <span class="leading-none mt-0.5">{{ fileExt(a) }}</span>
            </a>
          }
          @if (a.label && a.label !== 'other') {
            <span class="absolute -top-1 -right-1 text-[8px] font-bold px-1 py-0.5 rounded-sm uppercase tracking-wider"
                  [class]="labelBadgeClass(a.label)">
              {{ a.label }}
            </span>
          }
          @if (!isImage(a) && !readOnly) {
            <button (click)="remove(a)"
                    title="Delete"
                    class="opacity-0 group-hover:opacity-100 absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-danger-500 text-white text-[10px] leading-none flex items-center justify-center hover:bg-danger-700 transition">×</button>
          }
        </div>
      }

      @if (!readOnly) {
        @if (cloudinary.isConfigured()) {
          <button (click)="openUploadModal()"
                  class="inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 hover:text-brand-600 border border-dashed border-ink-300 rounded transition hover:border-brand-500">
            📎 Attach
          </button>
        } @else {
          <button (click)="showSetupHelp.set(!showSetupHelp())"
                  class="inline-flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning-500 border border-dashed border-warning-500 rounded hover:bg-warning-100 transition">
            ⚠ Cloudinary not set
          </button>
        }

        @if (uploadError()) {
          <span class="text-[10px] text-danger-500">{{ uploadError() }}</span>
        }
      }

      <!-- Cloudinary setup help modal -->
      @if (showSetupHelp()) {
        <div class="fixed inset-0 bg-ink-900/50 z-50 flex items-center justify-center p-6"
             (click)="showSetupHelp.set(false)">
          <div class="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="text-lg font-bold text-ink-900 mb-2">⚠ Cloudinary is not configured</h3>
            <p class="text-sm text-ink-500 mb-4">
              To enable screenshot uploads, you need to add your Cloudinary credentials:
            </p>
            <ol class="text-sm text-ink-700 space-y-2 mb-4 list-decimal pl-5">
              <li>Sign up at <a href="https://cloudinary.com" target="_blank" class="text-brand-500 hover:underline">cloudinary.com</a> (free tier)</li>
              <li>Copy your <strong>Cloud Name</strong> from the dashboard</li>
              <li>Go to Settings → Upload → Upload Presets → <strong>Add</strong>, set Signing Mode to <strong>Unsigned</strong></li>
              <li>Open the file <code class="bg-ink-100 px-1 py-0.5 rounded text-xs">apps/web/src/environments/environment.ts</code></li>
              <li>Paste your <code class="text-xs">cloudName</code> and <code class="text-xs">uploadPreset</code></li>
              <li>Save → the dev server will reload automatically</li>
            </ol>
            <button class="btn-primary w-full" (click)="showSetupHelp.set(false)">Got it</button>
          </div>
        </div>
      }
    </div>

    <!-- Upload modal -->
    @if (uploadModalOpen()) {
      <div class="fixed inset-0 bg-ink-900/60 z-50 flex items-center justify-center p-6"
           (click)="closeUploadModal()">
        <div class="bg-white rounded-xl max-w-lg w-full shadow-2xl overflow-hidden"
             (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-ink-200 flex items-center justify-between">
            <h3 class="text-lg font-bold text-ink-900">Attach file</h3>
            <button (click)="closeUploadModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="p-6">
            @if (!draft()) {
              <!-- File picker + paste support -->
              <label
                class="block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition"
                [class.border-ink-300]="!dropActive()"
                [class.hover:border-brand-500]="!dropActive()"
                [class.border-brand-500]="dropActive()"
                [class.bg-brand-50]="dropActive()"
                (dragenter)="onDragEnter($event)"
                (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)"
                (drop)="onDrop($event)">
                <div class="text-5xl mb-3">📁</div>
                <div class="font-semibold text-ink-900">Choose a file</div>
                <div class="text-xs text-ink-500 mt-1">
                  Images (PNG/JPG/WebP) or documents (PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP) — up to 10 MB
                </div>
                <div class="text-[11px] text-ink-400 mt-3">
                  or drop it here · paste images with
                  <kbd class="px-1.5 py-0.5 rounded border border-ink-300 bg-white text-[10px] font-mono text-ink-700">{{ pasteHint }}</kbd>
                </div>
                <input type="file" class="hidden"
                       accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rtf,.odt,.ods,.odp"
                       (change)="onPick($event)" />
              </label>
              <button type="button"
                      (click)="pasteFromClipboard()"
                      [disabled]="reading()"
                      class="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-ink-200 bg-white text-sm font-semibold text-ink-700 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 transition">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3.5" y="2.5" width="9" height="11" rx="1.5" />
                  <path d="M6 2.5V1.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" stroke-linecap="round" />
                </svg>
                {{ reading() ? 'Reading clipboard…' : 'Paste from clipboard' }}
              </button>
              @if (uploadError()) {
                <div class="mt-3 rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-xs text-danger-500">
                  {{ uploadError() }}
                </div>
              }
            } @else {
              <!-- Preview + label/caption -->
              <div class="space-y-4">
                <div class="rounded-lg overflow-hidden bg-ink-50 border border-ink-200">
                  @if (draft()!.isImage) {
                    <img [src]="draft()!.previewUrl" alt="preview"
                         class="w-full max-h-64 object-contain" />
                  } @else {
                    <div class="flex items-center gap-3 p-4">
                      <div class="w-12 h-12 rounded bg-ink-100 flex flex-col items-center justify-center text-ink-700 text-[10px] font-bold uppercase flex-shrink-0">
                        <span class="text-xl leading-none">📄</span>
                        <span class="leading-none mt-0.5">{{ draftFileExt() }}</span>
                      </div>
                      <div class="min-w-0">
                        <div class="font-semibold text-ink-900 truncate text-sm">
                          {{ draft()!.file.name }}
                        </div>
                        <div class="text-xs text-ink-500 mt-0.5">
                          {{ formatBytes(draft()!.file.size) }}
                        </div>
                      </div>
                    </div>
                  }
                </div>

                <div>
                  <label class="label">Tag this attachment as</label>
                  <div class="grid grid-cols-3 gap-2">
                    @for (opt of labelOptions; track opt.value) {
                      <button (click)="setDraftLabel(opt.value)"
                              [class]="'px-3 py-2.5 text-xs font-semibold uppercase tracking-wider rounded-lg border-2 transition ' +
                                (draft()!.label === opt.value
                                  ? opt.activeClass
                                  : 'bg-white border-ink-200 text-ink-500 hover:border-ink-400')">
                        {{ opt.label }}
                      </button>
                    }
                  </div>
                  <p class="text-[10px] text-ink-500 mt-1.5">
                    "Other" is fine if it's just a general resource, not a before/after pair.
                  </p>
                </div>

                <div>
                  <label class="label">Caption (optional)</label>
                  <input class="input"
                         [value]="draft()!.caption"
                         (input)="setDraftCaption($any($event.target).value)"
                         placeholder="e.g. Old homepage layout, Mobile view, etc." />
                </div>

                @if (uploadingPct() !== null) {
                  <div>
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-ink-700 font-semibold">Uploading…</span>
                      <span class="text-ink-500">{{ uploadingPct() }}%</span>
                    </div>
                    <div class="h-2 bg-ink-100 rounded-full overflow-hidden">
                      <div class="h-full bg-brand-500 transition-all"
                           [style.width.%]="uploadingPct()"></div>
                    </div>
                  </div>
                }

                @if (uploadError()) {
                  <div class="rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
                    {{ uploadError() }}
                  </div>
                }
              </div>
            }
          </div>

          @if (draft()) {
            <div class="px-6 py-4 border-t border-ink-200 flex items-center justify-between bg-ink-50">
              <button class="btn-ghost" (click)="resetDraft()" [disabled]="uploadingPct() !== null">
                Choose another
              </button>
              <div class="flex items-center gap-2">
                <button class="btn-secondary" (click)="closeUploadModal()" [disabled]="uploadingPct() !== null">
                  Cancel
                </button>
                <button class="btn-primary" (click)="submitUpload()" [disabled]="uploadingPct() !== null">
                  @if (uploadingPct() !== null) {
                    Uploading…
                  } @else {
                    Upload
                  }
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Lightbox (teleported to document.body so it escapes any
         ancestor stacking context, e.g. completed task cards) -->
    @if (lightbox(); as a) {
      <div #lightboxRoot
           class="fixed inset-0 bg-ink-900/80 flex items-center justify-center p-6"
           style="z-index: 10000;"
           (click)="lightbox.set(null)">
        <div class="relative max-w-5xl w-full" (click)="$event.stopPropagation()">
          <img [src]="cloudinary.fullUrl(a.publicId)" [alt]="a.caption || a.label"
               class="w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />

          <button (click)="lightbox.set(null)"
                  class="absolute top-2 right-2 w-9 h-9 rounded-full bg-ink-900/80 text-white hover:bg-ink-900 flex items-center justify-center text-lg">
            ×
          </button>

          <div class="absolute bottom-0 left-0 right-0 bg-ink-900/90 backdrop-blur rounded-b-lg px-4 py-3 flex items-center gap-3 text-white">
            <div class="flex items-center gap-1">
              @for (lbl of labels; track lbl) {
                <button (click)="setLabel(a, lbl)"
                        [class]="'px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition ' +
                          (a.label === lbl ? 'bg-brand-500 text-white' : 'bg-white/10 hover:bg-white/20')">
                  {{ lbl }}
                </button>
              }
            </div>

            <input class="flex-1 bg-white/10 text-sm rounded px-3 py-1.5 border border-white/20 focus:outline-none focus:border-brand-500"
                   [(ngModel)]="captionDraft"
                   (blur)="saveCaption(a)"
                   placeholder="Add a caption…" />

            @if (!readOnly) {
              <button (click)="remove(a)" class="text-xs text-danger-100 hover:text-white opacity-70 hover:opacity-100">
                Delete
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .group input[type="text"] {
      color: white;
    }
  `],
})
export class AttachmentsStripComponent implements AfterViewChecked, OnDestroy {
  protected cloudinary = inject(CloudinaryService);
  private tasksSvc = inject(TasksService);

  @ViewChild('lightboxRoot') lightboxRoot?: ElementRef<HTMLDivElement>;
  private lightboxInBody = false;

  @Input({ required: true }) taskId!: string;
  @Input() attachments: TaskAttachment[] = [];
  @Input() readOnly = false;
  @Output() changed = new EventEmitter<TaskAttachment[]>();

  uploadingPct = signal<number | null>(null);
  uploadError = signal<string | null>(null);
  lightbox = signal<TaskAttachment | null>(null);
  showSetupHelp = signal(false);
  uploadModalOpen = signal(false);
  draft = signal<UploadDraft | null>(null);
  dropActive = signal(false);
  reading = signal(false);

  captionDraft = '';
  labels: Array<LabelOption> = ['before', 'after', 'other'];

  pasteHint = this.detectPasteHint();

  labelOptions: Array<{ value: LabelOption; label: string; activeClass: string }> = [
    { value: 'before', label: 'Before', activeClass: 'bg-warning-100 border-warning-500 text-warning-500' },
    { value: 'after', label: 'After', activeClass: 'bg-positive-100 border-positive-500 text-positive-500' },
    { value: 'other', label: 'Other', activeClass: 'bg-ink-100 border-ink-700 text-ink-900' },
  ];

  openUploadModal() {
    this.uploadModalOpen.set(true);
    this.uploadError.set(null);
    this.draft.set(null);
  }

  closeUploadModal() {
    if (this.uploadingPct() !== null) return;
    this.uploadModalOpen.set(false);
    this.resetDraft();
  }

  resetDraft() {
    const current = this.draft();
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
    this.draft.set(null);
    this.uploadError.set(null);
  }

  onPick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.acceptFile(file);
    input.value = '';
  }

  // --- Paste & drag-drop --------------------------------------------------

  @HostListener('window:paste', ['$event'])
  onWindowPaste(ev: ClipboardEvent) {
    if (!this.uploadModalOpen() || this.draft() || this.readOnly) return;
    const items = ev.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          ev.preventDefault();
          this.acceptFile(this.renameClipboardFile(file));
          return;
        }
      }
    }
  }

  async pasteFromClipboard() {
    this.uploadError.set(null);
    if (this.reading()) return;
    if (!('clipboard' in navigator) || !navigator.clipboard.read) {
      this.uploadError.set(
        `Your browser does not expose clipboard images. Press ${this.pasteHint} instead.`,
      );
      return;
    }
    this.reading.set(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (!imgType) continue;
        const blob = await item.getType(imgType);
        const file = new File(
          [blob],
          this.suggestedClipboardName(imgType),
          { type: imgType },
        );
        this.acceptFile(file);
        this.reading.set(false);
        return;
      }
      this.uploadError.set('No image found in the clipboard. Copy a screenshot first.');
    } catch (err) {
      const msg = (err as Error).message || '';
      if (/denied|permission/i.test(msg)) {
        this.uploadError.set(
          `Clipboard access was denied. Press ${this.pasteHint} to paste instead.`,
        );
      } else {
        this.uploadError.set(
          `Could not read clipboard. Press ${this.pasteHint} to paste instead.`,
        );
      }
    } finally {
      this.reading.set(false);
    }
  }

  onDragEnter(ev: DragEvent) {
    ev.preventDefault();
    if (this.hasFileInTransfer(ev.dataTransfer)) this.dropActive.set(true);
  }

  onDragOver(ev: DragEvent) {
    ev.preventDefault();
    if (this.hasFileInTransfer(ev.dataTransfer)) this.dropActive.set(true);
  }

  onDragLeave(ev: DragEvent) {
    ev.preventDefault();
    this.dropActive.set(false);
  }

  onDrop(ev: DragEvent) {
    ev.preventDefault();
    this.dropActive.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.acceptFile(file);
  }

  private hasFileInTransfer(dt: DataTransfer | null): boolean {
    if (!dt) return false;
    return Array.from(dt.items || []).some((i) => i.kind === 'file');
  }

  private acceptFile(file: File) {
    this.uploadError.set(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      this.uploadError.set('File is over 10 MB. Compress it and try again.');
      return;
    }
    const isImage = file.type.startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : '';
    this.draft.set({ file, previewUrl, isImage, label: 'other', caption: '' });
  }

  private renameClipboardFile(file: File): File {
    // Browsers default to "image.png" — give it a slightly more useful name.
    if (file.name && file.name !== 'image.png') return file;
    return new File([file], this.suggestedClipboardName(file.type), { type: file.type });
  }

  private suggestedClipboardName(mime: string): string {
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `screenshot-${stamp}.${ext}`;
  }

  private detectPasteHint(): string {
    if (typeof navigator === 'undefined') return 'Ctrl+V';
    const platform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /Mac|iPhone|iPad/i.test(platform + ua) ? '⌘V' : 'Ctrl+V';
  }

  setDraftLabel(label: LabelOption) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, label });
  }

  setDraftCaption(caption: string) {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, caption });
  }

  async submitUpload() {
    const d = this.draft();
    if (!d) return;
    this.uploadError.set(null);
    this.uploadingPct.set(0);
    try {
      const result = await this.cloudinary.upload(d.file, (p) =>
        this.uploadingPct.set(p),
      );
      this.tasksSvc
        .addAttachment(this.taskId, {
          ...result,
          label: d.label,
          caption: d.caption.trim() || undefined,
        })
        .subscribe({
          next: (task) => {
            this.attachments = task.attachments || [];
            this.changed.emit(this.attachments);
            this.uploadingPct.set(null);
            if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
            this.draft.set(null);
            this.uploadModalOpen.set(false);
          },
          error: (err) => {
            this.uploadingPct.set(null);
            this.uploadError.set(err?.error?.message || 'Could not save');
          },
        });
    } catch (err) {
      this.uploadingPct.set(null);
      this.uploadError.set((err as Error).message);
    }
  }

  open(a: TaskAttachment) {
    if (!this.isImage(a)) return;
    this.lightbox.set(a);
    this.captionDraft = a.caption || '';
  }

  isImage(a: TaskAttachment): boolean {
    if (a.resourceType) return a.resourceType === 'image';
    // Legacy attachments without resourceType — fall back to format check
    const imgFormats = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'];
    return !!(a.format && imgFormats.includes(a.format.toLowerCase()));
  }

  fileExt(a: TaskAttachment): string {
    if (a.format) return a.format.toUpperCase().slice(0, 4);
    const name = a.originalFilename || '';
    const m = /\.([a-z0-9]+)$/i.exec(name);
    return m ? m[1].toUpperCase().slice(0, 4) : 'FILE';
  }

  draftFileExt(): string {
    const d = this.draft();
    if (!d) return '';
    const m = /\.([a-z0-9]+)$/i.exec(d.file.name);
    return m ? m[1].toUpperCase().slice(0, 4) : 'FILE';
  }

  formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  // Teleport the lightbox DOM node to <body> the first time it's rendered
  // so it lives outside any ancestor stacking context (e.g. completed task
  // cards that used to be opacity-faded, modals, sticky headers, etc.).
  ngAfterViewChecked() {
    if (!this.lightbox()) {
      this.lightboxInBody = false;
      return;
    }
    const el = this.lightboxRoot?.nativeElement;
    if (el && !this.lightboxInBody && el.parentElement !== document.body) {
      document.body.appendChild(el);
      this.lightboxInBody = true;
    }
  }

  ngOnDestroy() {
    // Clean up if we teleported the lightbox out of the component subtree.
    const el = this.lightboxRoot?.nativeElement;
    if (el && el.parentElement === document.body) {
      el.remove();
    }
  }

  setLabel(a: TaskAttachment, label: LabelOption) {
    this.tasksSvc.patchAttachment(this.taskId, a.publicId, { label }).subscribe({
      next: (task) => {
        this.attachments = task.attachments || [];
        const updated = this.attachments.find((x) => x.publicId === a.publicId);
        if (updated) this.lightbox.set(updated);
        this.changed.emit(this.attachments);
      },
    });
  }

  saveCaption(a: TaskAttachment) {
    if (this.captionDraft === (a.caption || '')) return;
    this.tasksSvc
      .patchAttachment(this.taskId, a.publicId, { caption: this.captionDraft })
      .subscribe({
        next: (task) => {
          this.attachments = task.attachments || [];
          const updated = this.attachments.find((x) => x.publicId === a.publicId);
          if (updated) this.lightbox.set(updated);
          this.changed.emit(this.attachments);
        },
      });
  }

  remove(a: TaskAttachment) {
    if (!confirm('Delete this attachment?')) return;
    this.tasksSvc.removeAttachment(this.taskId, a.publicId).subscribe({
      next: (task) => {
        this.attachments = task.attachments || [];
        this.lightbox.set(null);
        this.changed.emit(this.attachments);
      },
    });
  }

  labelBadgeClass(label: string): string {
    if (label === 'before') return 'bg-warning-100 text-warning-500';
    if (label === 'after') return 'bg-positive-100 text-positive-500';
    return 'bg-ink-100 text-ink-700';
  }
}
