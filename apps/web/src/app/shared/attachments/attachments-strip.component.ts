import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TaskAttachment } from '@seo/shared';
import { CloudinaryService } from '../../core/cloudinary.service';
import { TasksService } from '../../core/tasks.service';

type LabelOption = 'before' | 'after' | 'other';

interface UploadDraft {
  file: File;
  previewUrl: string;
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
          <button (click)="open(a)"
                  class="block w-10 h-10 rounded border border-ink-200 overflow-hidden hover:border-brand-500 transition">
            <img [src]="a.thumbnailUrl || a.url" [alt]="a.caption || a.label"
                 class="w-full h-full object-cover" />
          </button>
          @if (a.label && a.label !== 'other') {
            <span class="absolute -top-1 -right-1 text-[8px] font-bold px-1 py-0.5 rounded-sm uppercase tracking-wider"
                  [class]="labelBadgeClass(a.label)">
              {{ a.label }}
            </span>
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
            <h3 class="text-lg font-bold text-ink-900">Attach screenshot</h3>
            <button (click)="closeUploadModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="p-6">
            @if (!draft()) {
              <!-- File picker -->
              <label class="block border-2 border-dashed border-ink-300 hover:border-brand-500 rounded-lg p-8 text-center cursor-pointer transition">
                <div class="text-5xl mb-3">📁</div>
                <div class="font-semibold text-ink-900">Choose an image</div>
                <div class="text-xs text-ink-500 mt-1">PNG, JPG, GIF, WebP — up to 10 MB</div>
                <input type="file" class="hidden" accept="image/*" (change)="onPick($event)" />
              </label>
            } @else {
              <!-- Preview + label/caption -->
              <div class="space-y-4">
                <div class="rounded-lg overflow-hidden bg-ink-50 border border-ink-200">
                  <img [src]="draft()!.previewUrl" alt="preview"
                       class="w-full max-h-64 object-contain" />
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

    <!-- Lightbox -->
    @if (lightbox(); as a) {
      <div class="fixed inset-0 bg-ink-900/80 z-50 flex items-center justify-center p-6"
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
export class AttachmentsStripComponent {
  protected cloudinary = inject(CloudinaryService);
  private tasksSvc = inject(TasksService);

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

  captionDraft = '';
  labels: Array<LabelOption> = ['before', 'after', 'other'];

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
    if (current) URL.revokeObjectURL(current.previewUrl);
    this.draft.set(null);
    this.uploadError.set(null);
  }

  onPick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    this.draft.set({
      file,
      previewUrl,
      label: 'other',
      caption: '',
    });
    input.value = '';
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
            URL.revokeObjectURL(d.previewUrl);
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
    this.lightbox.set(a);
    this.captionDraft = a.caption || '';
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
