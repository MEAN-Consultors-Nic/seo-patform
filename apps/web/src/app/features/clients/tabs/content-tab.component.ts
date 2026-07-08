import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CONTENT_PIECE_TYPES,
  CONTENT_STATUSES,
  ContentAttachment,
  ContentPiece,
  ContentPieceType,
  ContentStatus,
  Task,
} from '@seo/shared';
import { CloudinaryService } from '../../../core/cloudinary.service';
import { ContentService } from '../../../core/content.service';
import { TasksService } from '../../../core/tasks.service';

@Component({
  selector: 'app-client-content-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <input #fileInput type="file" class="hidden" (change)="onFilePicked($event)" />
      <div class="card">
        <h3 class="text-sm font-semibold text-ink-900 mb-3">+ New piece</h3>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input class="input md:col-span-2" [(ngModel)]="newPiece.title" placeholder="Piece title" />
          <select class="input" [(ngModel)]="newPiece.contentType" title="Type">
            @for (t of types; track t) {
              <option [value]="t">{{ t }}</option>
            }
          </select>
          <input class="input" [(ngModel)]="newPiece.targetKeyword" placeholder="Target keyword" />
          <select class="input" [(ngModel)]="newPiece.status">
            @for (s of statuses; track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select>
        </div>
        <button class="btn-primary mt-3" (click)="add()" [disabled]="!newPiece.title">Add to pipeline</button>
      </div>

      @if (toast(); as t) {
        <div [class]="'rounded-md px-3 py-2 text-xs font-medium ' +
              (t.kind === 'error'
                ? 'bg-danger-100 text-danger-700 border border-danger-500/30'
                : 'bg-positive-100 text-positive-500 border border-positive-500/30')">
          {{ t.message }}
        </div>
      }

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
                  <div class="flex items-start justify-between gap-2">
                    <div class="font-medium text-ink-900 leading-tight text-xs flex-1">{{ p.title }}</div>
                    <span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                          [class]="typeChipClass(p.contentType)">
                      {{ p.contentType || 'post' }}
                    </span>
                  </div>
                  @if (p.targetKeyword) {
                    <div class="text-[10px] text-brand-600 mt-1 font-medium">🎯 {{ p.targetKeyword }}</div>
                  }
                  @if (p.briefUrl) {
                    <a [href]="p.briefUrl" target="_blank" rel="noopener"
                       class="block text-[10px] text-sky-600 hover:underline mt-1 font-medium truncate"
                       [title]="p.briefUrl">
                      📝 {{ p.briefUrl }}
                    </a>
                  }
                  @if (p.publishedUrl) {
                    <a [href]="p.publishedUrl" target="_blank" rel="noopener"
                       class="block text-[10px] text-positive-500 hover:underline mt-1 font-medium truncate"
                       [title]="p.publishedUrl">
                      ↗ {{ p.publishedUrl }}
                    </a>
                  }
                  @if (p.attachments?.length) {
                    <div class="mt-1.5 space-y-1">
                      @for (a of p.attachments || []; track a.publicId) {
                        <div class="flex items-center gap-1.5 text-[10px] bg-white border border-ink-200 rounded px-1.5 py-1">
                          <a [href]="a.url" target="_blank" rel="noopener"
                             class="flex-1 text-ink-700 hover:text-brand-500 truncate font-medium"
                             [title]="a.originalFilename || a.publicId">
                            📎 {{ a.originalFilename || 'attachment' }}
                          </a>
                          <button type="button" class="text-ink-400 hover:text-danger-500 leading-none px-0.5"
                                  (click)="removeAttachment(p, a)"
                                  title="Remove attachment">×</button>
                        </div>
                      }
                    </div>
                  }
                  @if (uploadingFor() === p._id) {
                    <div class="text-[10px] text-brand-500 mt-1 font-medium">
                      Uploading {{ uploadProgress() }}%…
                    </div>
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
                    <!-- Contextual menu. The button toggles a small dropdown
                         anchored to the piece card. Keep actions discoverable
                         here as we add more over time. -->
                    <div class="relative">
                      <button class="text-ink-400 hover:text-ink-900 text-sm leading-none px-1"
                              (click)="toggleMenu(p, $event)"
                              [attr.aria-expanded]="menuOpenId() === p._id"
                              title="More actions">⋮</button>
                      @if (menuOpenId() === p._id) {
                        <div class="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-ink-200 rounded-md shadow-lg py-1 text-xs"
                             (click)="$event.stopPropagation()">
                          @if (p.status === 'idea') {
                            <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900"
                                    [disabled]="creatingTaskFor() === p._id"
                                    (click)="createTaskForPiece(p)">
                              {{ creatingTaskFor() === p._id ? 'Creating…' : 'Create task' }}
                            </button>
                          }
                          @if (p.status === 'draft') {
                            <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900"
                                    (click)="openDraftLinkModal(p)">
                              {{ p.briefUrl ? 'Edit draft link' : 'Add draft link' }}
                            </button>
                          }
                          <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900 disabled:opacity-50"
                                  [disabled]="!cloudinary.isConfigured() || uploadingFor() === p._id"
                                  [title]="cloudinary.isConfigured() ? '' : 'Cloudinary not configured'"
                                  (click)="triggerAttachFile(p)">
                            {{ uploadingFor() === p._id ? 'Uploading…' : 'Attach file' }}
                          </button>
                          <div class="my-1 border-t border-ink-100"></div>
                          <button class="block w-full text-left px-3 py-1.5 hover:bg-danger-100 text-danger-500 hover:text-danger-700"
                                  (click)="confirmRemove(p)">
                            Delete piece
                          </button>
                        </div>
                      }
                    </div>
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

    <!-- Draft link modal -->
    @if (draftLinkPiece(); as p) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="dismissDraftLinkModal()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-lg p-6"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Draft link</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Where the draft lives — Google Doc, Notion, etc.
              </p>
            </div>
            <button type="button" (click)="dismissDraftLinkModal()"
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
            <label class="label">Draft URL</label>
            <input class="input"
                   [(ngModel)]="draftUrlInput"
                   placeholder="https://docs.google.com/document/d/…"
                   (keyup.enter)="saveDraftLink()"
                   autofocus />
          </div>

          @if (draftLinkError()) {
            <div class="text-xs text-danger-500 mt-2">{{ draftLinkError() }}</div>
          }

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="dismissDraftLinkModal()" [disabled]="draftLinkSaving()">
              Cancel
            </button>
            <button class="btn-primary" (click)="saveDraftLink()"
                    [disabled]="draftLinkSaving() || !draftUrlInput.trim()">
              {{ draftLinkSaving() ? 'Saving…' : 'Save link' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientContentTab implements OnChanges {
  @Input({ required: true }) clientId!: string;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  private svc = inject(ContentService);
  private tasksSvc = inject(TasksService);
  protected cloudinary = inject(CloudinaryService);

  pieces = signal<ContentPiece[]>([]);
  statuses: ContentStatus[] = CONTENT_STATUSES;
  types: ContentPieceType[] = CONTENT_PIECE_TYPES;

  newPiece: Partial<ContentPiece> = {
    title: '',
    targetKeyword: '',
    status: 'idea',
    contentType: 'post',
  };

  // Which piece the file input is bound to. Used to route the file
  // through the upload flow to the correct content piece.
  private attachTargetId: string | null = null;
  uploadingFor = signal<string | null>(null);
  uploadProgress = signal(0);

  // Published URL modal state
  publishModalPiece = signal<ContentPiece | null>(null);
  publishUrlInput = '';
  publishSaving = signal(false);
  publishError = signal<string | null>(null);

  // Contextual menu + create-task state
  menuOpenId = signal<string | null>(null);
  creatingTaskFor = signal<string | null>(null);

  // Draft link modal state
  draftLinkPiece = signal<ContentPiece | null>(null);
  draftUrlInput = '';
  draftLinkSaving = signal(false);
  draftLinkError = signal<string | null>(null);

  // Inline toast for transient errors / success messages around the
  // "Create task" + draft-link flows. The publish flow has its own
  // modal-scoped error display so it doesn't need this.
  toast = signal<{ kind: 'success' | 'error'; message: string } | null>(null);

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
      this.newPiece = {
        title: '',
        targetKeyword: '',
        status: 'idea',
        contentType: 'post',
      };
      this.load();
    });
  }

  typeChipClass(t?: ContentPieceType): string {
    switch (t) {
      case 'page':
        return 'bg-brand-500/10 text-brand-700';
      case 'post':
      default:
        return 'bg-sky-100 text-sky-700';
    }
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

  /**
   * Delete-piece action from the contextual menu. Confirms with the
   * user first — content pieces often carry hours of research + drafts
   * behind them, so an accidental click shouldn't wipe the record.
   */
  confirmRemove(p: ContentPiece) {
    this.menuOpenId.set(null);
    const label = p.title || 'this piece';
    if (
      !confirm(
        `Delete "${label}"? This removes the content piece from the pipeline. Any linked draft URL or published URL will also be lost.`,
      )
    ) {
      return;
    }
    this.remove(p);
  }

  // --- Contextual menu --------------------------------------------------

  toggleMenu(p: ContentPiece, ev: MouseEvent) {
    ev.stopPropagation();
    this.menuOpenId.set(this.menuOpenId() === p._id ? null : (p._id ?? null));
  }

  /**
   * Close any open menu when the user clicks outside the card. Doing it
   * at the host level keeps the markup simple — no backdrop needed.
   */
  @HostListener('document:click')
  closeMenuOnOutsideClick() {
    if (this.menuOpenId()) this.menuOpenId.set(null);
  }

  /**
   * Creates an in-progress content task in the active cycle and moves
   * the piece into 'draft'. The two writes are sequential — task first,
   * then status flip — so if the task POST fails we don't strand the
   * piece in 'draft' without a backing task.
   */
  createTaskForPiece(p: ContentPiece) {
    if (!p._id) return;
    this.creatingTaskFor.set(p._id);
    const taskPayload: Partial<Task> = {
      clientId: this.clientId,
      category: 'content',
      title: `Draft content: ${p.title}`,
      description: p.targetKeyword ? `Target keyword: ${p.targetKeyword}` : '',
      status: 'in_progress',
      priority: 'medium',
      estimatedHours: 1,
    };
    this.tasksSvc.create(taskPayload).subscribe({
      next: () => {
        // Task created — now move the piece to 'draft'. We don't need
        // the task back; the Tasks tab will pick it up on next load.
        this.svc.update(p._id!, { status: 'draft' }).subscribe({
          next: () => {
            this.creatingTaskFor.set(null);
            this.menuOpenId.set(null);
            this.flashToast('success', `Task created. "${p.title}" moved to Draft.`);
            this.load();
          },
          error: (err) => {
            this.creatingTaskFor.set(null);
            this.menuOpenId.set(null);
            const m = err?.error?.message;
            this.flashToast(
              'error',
              `Task created but moving to Draft failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
            );
            this.load();
          },
        });
      },
      error: (err) => {
        this.creatingTaskFor.set(null);
        this.menuOpenId.set(null);
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Could not create task: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
    });
  }

  // --- Draft link modal -------------------------------------------------

  openDraftLinkModal(p: ContentPiece) {
    this.menuOpenId.set(null);
    this.draftUrlInput = p.briefUrl ?? '';
    this.draftLinkError.set(null);
    this.draftLinkPiece.set(p);
  }

  dismissDraftLinkModal() {
    if (this.draftLinkSaving()) return;
    this.draftLinkPiece.set(null);
    this.draftUrlInput = '';
    this.draftLinkError.set(null);
  }

  saveDraftLink() {
    const piece = this.draftLinkPiece();
    if (!piece?._id) return;
    const url = this.draftUrlInput.trim();
    if (!url) return;
    this.draftLinkSaving.set(true);
    this.draftLinkError.set(null);
    this.svc.update(piece._id, { briefUrl: url }).subscribe({
      next: () => {
        this.draftLinkSaving.set(false);
        this.draftLinkPiece.set(null);
        this.draftUrlInput = '';
        this.load();
      },
      error: (err) => {
        this.draftLinkSaving.set(false);
        const m = err?.error?.message;
        this.draftLinkError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not save',
        );
      },
    });
  }

  // --- Attachments ------------------------------------------------------

  triggerAttachFile(p: ContentPiece) {
    if (!p._id || !this.fileInput) return;
    if (!this.cloudinary.isConfigured()) {
      this.flashToast(
        'error',
        'Cloudinary is not configured — cannot upload files.',
      );
      return;
    }
    this.attachTargetId = p._id;
    this.menuOpenId.set(null);
    // Reset the input so picking the same file twice still fires (change).
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  async onFilePicked(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    const pieceId = this.attachTargetId;
    if (!file || !pieceId) return;
    this.uploadingFor.set(pieceId);
    this.uploadProgress.set(0);
    try {
      const result = await this.cloudinary.upload(file, (pct) =>
        this.uploadProgress.set(pct),
      );
      this.svc
        .addAttachment(pieceId, {
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
          next: () => {
            this.uploadingFor.set(null);
            this.uploadProgress.set(0);
            this.attachTargetId = null;
            this.flashToast('success', 'File attached.');
            this.load();
          },
          error: (err) => {
            this.uploadingFor.set(null);
            this.attachTargetId = null;
            const m = err?.error?.message;
            this.flashToast(
              'error',
              `Attach failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
            );
          },
        });
    } catch (err: unknown) {
      this.uploadingFor.set(null);
      this.attachTargetId = null;
      const msg = err instanceof Error ? err.message : 'Upload failed';
      this.flashToast('error', `Upload failed: ${msg}`);
    }
  }

  removeAttachment(p: ContentPiece, a: ContentAttachment) {
    if (!p._id) return;
    if (!confirm(`Remove ${a.originalFilename || 'this file'}?`)) return;
    this.svc.removeAttachment(p._id, a.publicId).subscribe({
      next: () => this.load(),
      error: (err) => {
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Remove failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
    });
  }

  // --- Toast helpers ----------------------------------------------------

  private flashToast(kind: 'success' | 'error', message: string) {
    this.toast.set({ kind, message });
    setTimeout(() => this.toast.set(null), 4000);
  }
}
