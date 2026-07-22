import { CommonModule, DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ClientAttachment } from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { CloudinaryService } from '../../../core/cloudinary.service';
import { FileDropDirective } from '../../../shared/file-drop.directive';

/**
 * Client-level Files tab. Lives under SETUP alongside Knowledge /
 * Contacts / Credentials / Integrations. Reuses the same Cloudinary
 * upload plumbing as task and content attachments; the difference is
 * that these files aren't tied to any specific task or content
 * piece — they belong to the client as a whole (contracts, brand
 * kits, reference PDFs, etc.).
 *
 * Each file has an optional free-text label the reader can edit
 * inline so they can categorize how they see fit (Contract, Brand
 * kit, Reference, whatever) without a rigid enum.
 */
@Component({
  selector: 'app-client-files-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, FileDropDirective],
  template: `
    <div class="space-y-4">
      <input #fileInput type="file" class="hidden" (change)="onFilePicked($event)" />

      <div class="card"
           [appFileDrop]="cloudinary.isConfigured() && !uploading()"
           #drop="fileDrop"
           (filesDropped)="onFilesDropped($event)">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-semibold text-ink-900">Client files</h3>
            <p class="text-xs text-ink-500 mt-0.5 max-w-lg">
              Contracts, brand kits, reference material — anything that
              belongs to the client as a whole rather than a specific task.
              Add a label to each file so you can find it later.
            </p>
          </div>
          <button type="button"
                  class="btn-primary text-sm whitespace-nowrap"
                  [disabled]="!cloudinary.isConfigured() || uploading()"
                  [title]="cloudinary.isConfigured() ? '' : 'Cloudinary not configured'"
                  (click)="triggerPicker()">
            {{ uploading() ? 'Uploading ' + uploadProgress() + '%…' : '📎 Attach file' }}
          </button>
        </div>

        <!-- Drop-target overlay only visible during drag -->
        <div class="mt-3 border-2 border-dashed rounded-md py-4 text-center text-xs font-semibold uppercase tracking-wider transition-colors"
             [class.border-brand-500]="drop.active"
             [class.bg-brand-500/10]="drop.active"
             [class.text-brand-500]="drop.active"
             [class.border-ink-200]="!drop.active"
             [class.text-ink-400]="!drop.active">
          @if (drop.active) {
            📎 Drop to attach
          } @else {
            or drop files here
          }
        </div>

        @if (toast(); as t) {
          <div [class]="'mt-3 rounded-md px-3 py-2 text-xs font-medium ' +
                (t.kind === 'error'
                  ? 'bg-danger-100 text-danger-700 border border-danger-500/30'
                  : 'bg-positive-100 text-positive-500 border border-positive-500/30')">
            {{ t.message }}
          </div>
        }
      </div>

      @if (files().length === 0) {
        <div class="card text-center py-10 text-sm text-ink-400 italic">
          No files yet. Drop a file above or click Attach.
        </div>
      } @else {
        <div class="bg-white border border-ink-200 rounded-lg">
          <div class="hidden md:grid grid-cols-[44px_minmax(0,1fr)_minmax(0,200px)_100px_120px_100px] items-center gap-3 px-4 py-2 border-b border-ink-100 bg-ink-50/60 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            <div></div>
            <div>Name</div>
            <div>Label</div>
            <div>Size</div>
            <div>Added</div>
            <div class="text-right">Actions</div>
          </div>
          <ul class="divide-y divide-ink-100">
            @for (a of files(); track a.publicId) {
              <li class="group grid grid-cols-1 md:grid-cols-[44px_minmax(0,1fr)_minmax(0,200px)_100px_120px_100px] items-center gap-3 px-4 py-2.5">
                <!-- Icon / thumbnail -->
                <button type="button"
                        class="flex-shrink-0 w-9 h-9 rounded border border-ink-200 overflow-hidden hover:border-brand-500 transition"
                        (click)="preview.set(a)">
                  @if (isImage(a)) {
                    <img [src]="a.thumbnailUrl || a.url"
                         [alt]="a.originalFilename || 'image'"
                         class="w-full h-full object-cover" />
                  } @else {
                    <div class="w-full h-full flex flex-col items-center justify-center bg-ink-50 text-ink-600 text-[7px] font-bold uppercase">
                      <span class="text-xs leading-none">📄</span>
                      <span class="leading-none mt-0.5">{{ fileExt(a) }}</span>
                    </div>
                  }
                </button>

                <!-- Filename -->
                <button type="button"
                        class="text-left min-w-0"
                        (click)="preview.set(a)"
                        [title]="a.originalFilename || 'file'">
                  <div class="text-sm font-semibold text-ink-900 truncate hover:text-brand-500">
                    {{ a.originalFilename || 'Untitled file' }}
                  </div>
                  <div class="text-[10px] text-ink-500 mt-0.5 md:hidden">
                    {{ formatBytes(a.bytes) }} · {{ a.uploadedAt | date: 'mediumDate' }}
                  </div>
                </button>

                <!-- Label (inline editable) -->
                <input type="text"
                       class="text-xs border border-ink-200 rounded px-2 py-1 bg-white min-w-0"
                       [ngModel]="labelDraft(a.publicId)"
                       (ngModelChange)="setLabelDraft(a.publicId, $event)"
                       (blur)="commitLabel(a)"
                       (keyup.enter)="commitLabel(a)"
                       placeholder="Add label…" />

                <!-- Size -->
                <div class="text-xs text-ink-600 hidden md:block">
                  {{ formatBytes(a.bytes) }}
                </div>

                <!-- Uploaded date -->
                <div class="text-xs text-ink-500 hidden md:block">
                  {{ a.uploadedAt | date: 'mediumDate' }}
                </div>

                <!-- Actions -->
                <div class="flex justify-end items-center gap-1">
                  <a [href]="a.url" target="_blank" rel="noopener"
                     class="text-xs px-2 py-1 rounded hover:bg-ink-100 text-ink-600 hover:text-brand-500"
                     title="Open in new tab">
                    🔗
                  </a>
                  <a [href]="a.url" [download]="a.originalFilename || 'file'"
                     class="text-xs px-2 py-1 rounded hover:bg-ink-100 text-ink-600 hover:text-brand-500"
                     title="Download">
                    ⬇
                  </a>
                  <button type="button"
                          class="text-xs px-2 py-1 rounded hover:bg-danger-100 text-ink-400 hover:text-danger-500"
                          (click)="remove(a)"
                          title="Delete">
                    ×
                  </button>
                </div>
              </li>
            }
          </ul>
        </div>
      }
    </div>

    <!-- Preview lightbox. Mirrors the pattern from attachments-strip
         so images get a lightbox, PDFs get an iframe, other files get
         a card + download. -->
    @if (preview(); as a) {
      <div class="fixed inset-0 bg-ink-900/80 flex items-center justify-center p-6"
           style="z-index: 10000;"
           (click)="preview.set(null)">
        <div class="relative max-w-5xl w-full" (click)="$event.stopPropagation()">
          @if (isImage(a)) {
            <img [src]="a.url" [alt]="a.originalFilename || 'image'"
                 class="w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          } @else if (isPdf(a)) {
            <div class="w-full rounded-lg shadow-2xl bg-white flex flex-col overflow-hidden max-h-[85vh]">
              <div class="px-4 py-2.5 border-b border-ink-100 flex items-center gap-3 bg-ink-50">
                <span class="inline-flex items-center justify-center w-8 h-8 rounded bg-white border border-ink-200 text-xs font-bold text-ink-700">PDF</span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-ink-900 truncate">
                    {{ a.originalFilename || 'document.pdf' }}
                  </div>
                  @if (a.bytes) {
                    <div class="text-[11px] text-ink-500">{{ formatBytes(a.bytes) }}</div>
                  }
                </div>
                <a [href]="a.url" target="_blank" rel="noopener"
                   class="text-xs font-semibold text-ink-600 hover:text-ink-900 px-2 py-1 rounded hover:bg-ink-100">
                  🔗 Open
                </a>
                <a [href]="a.url" [download]="a.originalFilename || 'file.pdf'"
                   class="text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 px-3 py-1.5 rounded">
                  ⬇ Download
                </a>
              </div>
              <iframe [src]="pdfPreviewUrl(a)"
                      class="w-full flex-1 border-0"
                      style="min-height: 70vh;"
                      title="PDF preview"></iframe>
            </div>
          } @else {
            <div class="w-full max-h-[80vh] rounded-lg shadow-2xl bg-white flex flex-col items-center justify-center p-10 gap-4">
              <div class="flex flex-col items-center justify-center w-24 h-32 rounded border border-ink-200 bg-ink-50 text-ink-600 text-xl font-bold">
                <span class="text-4xl leading-none">📄</span>
                <span class="mt-2 text-[10px] tracking-wider uppercase">{{ fileExt(a) }}</span>
              </div>
              <div class="text-center max-w-md">
                <div class="text-lg font-bold text-ink-900 break-all">
                  {{ a.originalFilename || 'Attachment' }}
                </div>
                @if (a.bytes) {
                  <div class="text-xs text-ink-500 mt-1">{{ formatBytes(a.bytes) }}</div>
                }
                @if (a.label) {
                  <div class="text-xs text-brand-500 mt-1 uppercase tracking-wider font-semibold">
                    {{ a.label }}
                  </div>
                }
              </div>
              <div class="flex items-center gap-2 mt-2">
                <a [href]="a.url" target="_blank" rel="noopener" class="btn-secondary text-sm">🔗 View</a>
                <a [href]="a.url" [download]="a.originalFilename || 'file'"
                   class="btn-primary text-sm">⬇ Download</a>
              </div>
            </div>
          }
          <button (click)="preview.set(null)"
                  class="absolute top-2 right-2 w-9 h-9 rounded-full bg-ink-900/80 text-white hover:bg-ink-900 flex items-center justify-center text-lg">
            ×
          </button>
        </div>
      </div>
    }
  `,
})
export class ClientFilesTabComponent implements OnChanges {
  @Input({ required: true }) clientId!: string;
  @Input() attachments: ClientAttachment[] = [];
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private svc = inject(ClientsService);
  protected cloudinary = inject(CloudinaryService);
  private sanitizer = inject(DomSanitizer);

  files = signal<ClientAttachment[]>([]);
  uploading = signal(false);
  uploadProgress = signal(0);
  preview = signal<ClientAttachment | null>(null);
  toast = signal<{ kind: 'success' | 'error'; message: string } | null>(null);

  // Inline label editing draft, keyed by publicId so multi-row edits
  // don't stomp on each other before the blur/enter commit.
  private drafts = new Map<string, string>();
  private pdfUrlCache = new Map<string, SafeResourceUrl>();

  ngOnChanges() {
    this.files.set(this.attachments || []);
    this.drafts.clear();
  }

  labelDraft(publicId: string): string {
    if (this.drafts.has(publicId)) return this.drafts.get(publicId) as string;
    const a = this.files().find((f) => f.publicId === publicId);
    return a?.label || '';
  }

  setLabelDraft(publicId: string, value: string) {
    this.drafts.set(publicId, value);
  }

  commitLabel(a: ClientAttachment) {
    const draft = this.drafts.get(a.publicId);
    if (draft === undefined) return;
    if ((draft || '') === (a.label || '')) {
      this.drafts.delete(a.publicId);
      return;
    }
    this.svc
      .updateAttachment(this.clientId, a.publicId, { label: draft.trim() || undefined })
      .subscribe({
        next: (updated) => {
          this.files.set(updated.attachments || []);
          this.drafts.delete(a.publicId);
        },
        error: (err) => {
          const msg = err?.error?.message;
          this.flashToast('error', `Label save failed: ${Array.isArray(msg) ? msg.join(', ') : msg || 'unknown error'}`);
        },
      });
  }

  triggerPicker() {
    if (!this.fileInput) return;
    if (!this.cloudinary.isConfigured()) {
      this.flashToast('error', 'Cloudinary is not configured — cannot upload.');
      return;
    }
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  async onFilePicked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await this.uploadOne(file);
  }

  async onFilesDropped(files: File[]) {
    if (!this.cloudinary.isConfigured()) {
      this.flashToast('error', 'Cloudinary is not configured — cannot upload.');
      return;
    }
    if (this.uploading()) return;
    for (const f of files) {
      await this.uploadOne(f);
    }
  }

  private async uploadOne(file: File): Promise<void> {
    this.uploading.set(true);
    this.uploadProgress.set(0);
    try {
      const result = await this.cloudinary.upload(file, (pct) =>
        this.uploadProgress.set(pct),
      );
      await new Promise<void>((resolve) => {
        this.svc
          .addAttachment(this.clientId, {
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
            next: (updated) => {
              this.uploading.set(false);
              this.uploadProgress.set(0);
              this.files.set(updated.attachments || []);
              this.flashToast('success', `Attached ${file.name}.`);
              resolve();
            },
            error: (err) => {
              this.uploading.set(false);
              const msg = err?.error?.message;
              this.flashToast(
                'error',
                `Attach failed: ${Array.isArray(msg) ? msg.join(', ') : msg || 'unknown error'}`,
              );
              resolve();
            },
          });
      });
    } catch (err: unknown) {
      this.uploading.set(false);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      this.flashToast('error', `Upload failed: ${msg}`);
    }
  }

  remove(a: ClientAttachment) {
    if (!confirm(`Delete ${a.originalFilename || 'this file'}?`)) return;
    this.svc.removeAttachment(this.clientId, a.publicId).subscribe({
      next: () => {
        this.files.set(this.files().filter((f) => f.publicId !== a.publicId));
      },
      error: (err) => {
        const msg = err?.error?.message;
        this.flashToast('error', `Delete failed: ${Array.isArray(msg) ? msg.join(', ') : msg || 'unknown error'}`);
      },
    });
  }

  isImage(a: ClientAttachment): boolean {
    const imgFormats = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'];
    const fmt = (a.format || '').toLowerCase();
    if (a.resourceType === 'image' && imgFormats.includes(fmt)) return true;
    if (!a.resourceType && imgFormats.includes(fmt)) return true;
    const name = (a.originalFilename || a.url || '').toLowerCase();
    return imgFormats.some((f) => name.endsWith(`.${f}`));
  }

  isPdf(a: ClientAttachment): boolean {
    if ((a.format || '').toLowerCase() === 'pdf') return true;
    const name = (a.originalFilename || a.url || '').toLowerCase();
    return name.endsWith('.pdf');
  }

  fileExt(a: ClientAttachment): string {
    if (a.format) return a.format.toUpperCase().slice(0, 4);
    const name = a.originalFilename || '';
    const m = /\.([a-z0-9]+)$/i.exec(name);
    return m ? m[1].toUpperCase().slice(0, 4) : 'FILE';
  }

  formatBytes(bytes: number | undefined): string {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  pdfPreviewUrl(a: ClientAttachment): SafeResourceUrl {
    const cached = this.pdfUrlCache.get(a.publicId);
    if (cached) return cached;
    const suffixed = a.url.includes('#') ? a.url : `${a.url}#view=FitH`;
    const safe = this.sanitizer.bypassSecurityTrustResourceUrl(suffixed);
    this.pdfUrlCache.set(a.publicId, safe);
    return safe;
  }

  private flashToast(kind: 'success' | 'error', message: string) {
    this.toast.set({ kind, message });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
