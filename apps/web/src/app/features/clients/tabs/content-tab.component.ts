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
} from '@seo/shared';
import { CloudinaryService } from '../../../core/cloudinary.service';
import { ContentService } from '../../../core/content.service';
import { FileDropDirective } from '../../../shared/file-drop.directive';

/**
 * Shape of the `_taskAutoComplete` blob the API attaches to the
 * update response when publishing a piece spawns the completed
 * publication task and fires the Google Doc mirror off it.
 * 'completed' — task persisted, mirror ran (docSync.ok tells you
 * whether it landed). 'blocked' — task couldn't be created; reason
 * carries the upstream error.
 */
interface TaskAutoCompleteResult {
  status: 'completed' | 'blocked';
  taskId?: string;
  reason?: string;
  docSync?: { ok: boolean; message?: string };
}

@Component({
  selector: 'app-client-content-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, FileDropDirective],
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

      <!-- Filter tabs + list. Single scrollable list with a status
           filter on top; the counts help the reader decide where to
           focus without loading three columns worth of empty state. -->
      <!-- overflow-visible so the kebab menu dropdown on each row can
           escape the container's rounded corners; ancestor
           overflow-hidden clips absolute-positioned descendants. -->
      <div class="bg-white border border-ink-200 rounded-lg">
        <div class="flex items-center gap-1 px-3 pt-3 pb-0 border-b border-ink-100 flex-wrap">
          @for (tab of filterTabs; track tab.key) {
            <button type="button"
                    class="text-xs font-semibold px-3 py-1.5 rounded-t-md border-b-2 transition-colors"
                    [class.text-brand-500]="filter() === tab.key"
                    [class.border-brand-500]="filter() === tab.key"
                    [class.text-ink-500]="filter() !== tab.key"
                    [class.border-transparent]="filter() !== tab.key"
                    [class.hover:text-ink-900]="filter() !== tab.key"
                    (click)="filter.set(tab.key)">
              {{ tab.label }}
              <span class="ml-1 text-[10px] font-bold text-ink-500 bg-ink-100 rounded-full px-1.5 py-0.5">
                {{ countFor(tab.key) }}
              </span>
            </button>
          }
        </div>

        <ul class="divide-y divide-ink-100">
          @for (p of visiblePieces(); track p._id) {
            <li class="relative flex items-start gap-3 px-4 py-3 hover:bg-ink-50 transition-colors"
                [appFileDrop]="cloudinary.isConfigured() && uploadingFor() !== p._id"
                #drop="fileDrop"
                (filesDropped)="onFilesDropped(p, $event)">
              <div class="absolute inset-0 z-10 border-2 border-dashed border-brand-500 bg-brand-500/10 pointer-events-none flex items-center justify-center text-xs font-bold uppercase tracking-wider text-brand-500 opacity-0 transition-opacity"
                   [class.opacity-100]="drop.active">
                📎 Drop to attach
              </div>

              <!-- Type chip -->
              <span class="mt-0.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded shrink-0 w-14 text-center"
                    [class]="typeChipClass(p.contentType)">
                {{ p.contentType || 'post' }}
              </span>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-ink-900 leading-tight text-sm">
                  {{ p.title }}
                </div>
                @if (p.targetKeyword) {
                  <div class="text-xs text-ink-500 mt-0.5">
                    <span class="text-brand-600 font-medium">🎯 {{ p.targetKeyword }}</span>
                  </div>
                }
                @if (p.notes) {
                  <div class="text-xs text-ink-500 mt-0.5 line-clamp-2">
                    {{ p.notes }}
                  </div>
                }

                <!-- Links + attachments row -->
                @if (p.briefUrl || p.publishedUrl || p.attachments?.length) {
                  <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    @if (p.briefUrl) {
                      <a [href]="p.briefUrl" target="_blank" rel="noopener"
                         class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 border border-sky-100 text-sky-700 hover:bg-sky-100 max-w-xs truncate"
                         [title]="p.briefUrl">
                        📝 Draft link
                      </a>
                    }
                    @if (p.publishedUrl) {
                      <a [href]="p.publishedUrl" target="_blank" rel="noopener"
                         class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-positive-100/70 border border-positive-500/30 text-positive-500 hover:bg-positive-100 max-w-xs truncate"
                         [title]="p.publishedUrl">
                        ↗ Live
                      </a>
                    }
                    @for (a of p.attachments || []; track a.publicId) {
                      <span class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-white border border-ink-200 text-ink-700 max-w-xs">
                        <a [href]="a.url" target="_blank" rel="noopener"
                           class="hover:text-brand-500 truncate"
                           [title]="a.originalFilename || a.publicId">
                          📎 {{ a.originalFilename || 'attachment' }}
                        </a>
                        <button type="button" class="text-ink-400 hover:text-danger-500 leading-none px-0.5"
                                (click)="removeAttachment(p, a)"
                                title="Remove attachment">×</button>
                      </span>
                    }
                  </div>
                }

                <!-- Indexation strip. Only shown on published pieces so
                     drafts/ideas don't get GSC actions they can't use. -->
                @if (p.status === 'published' && p.publishedUrl) {
                  <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded"
                          [class]="indexationChipClass(p)"
                          [title]="indexationTooltip(p)">
                      {{ indexationChipLabel(p) }}
                    </span>
                    <button type="button"
                            class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-ink-200 text-ink-700 hover:bg-ink-100 disabled:opacity-50"
                            [disabled]="indexationBusyId() === p._id"
                            (click)="checkIndexation(p)">
                      {{ indexationBusyId() === p._id ? '⟳ Checking…' : '⟳ Recheck' }}
                    </button>
                    <button type="button"
                            class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 text-brand-700 hover:bg-brand-500/20 disabled:opacity-50"
                            [disabled]="indexingBusyId() === p._id"
                            (click)="requestIndexing(p)">
                      {{ indexingBusyId() === p._id ? '📤 Requesting…' : '📤 Request indexing' }}
                    </button>
                    <a [href]="richResultsUrl(p.publishedUrl)"
                       target="_blank" rel="noopener"
                       class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-warning-100 border border-warning-500/30 text-warning-500 hover:bg-warning-100/70">
                      🔍 Rich Results
                    </a>
                  </div>
                }
                @if (uploadingFor() === p._id) {
                  <div class="text-[11px] text-brand-500 mt-1 font-medium">
                    Uploading {{ uploadProgress() }}%…
                  </div>
                }
              </div>

              <!-- Right side: status + primary action + menu -->
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                      [class]="statusChipClass(p.status)">
                  {{ p.status }}
                </span>

                <button type="button"
                        class="text-xs font-semibold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
                        [class]="primaryActionClass(p.status)"
                        [disabled]="creatingTaskFor() === p._id"
                        (click)="primaryAction(p)">
                  {{ primaryActionLabel(p) }}
                </button>

                <div class="relative">
                  <button type="button"
                          class="w-7 h-7 rounded-md text-ink-400 hover:text-ink-900 hover:bg-ink-100 flex items-center justify-center text-lg leading-none"
                          (click)="toggleMenu(p, $event)"
                          [attr.aria-expanded]="menuOpenId() === p._id"
                          title="More actions">⋮</button>
                  @if (menuOpenId() === p._id) {
                    <div class="absolute right-0 top-full mt-1 z-20 w-48 bg-white border border-ink-200 rounded-md shadow-lg py-1 text-xs"
                         (click)="$event.stopPropagation()">
                      <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900 font-semibold"
                              (click)="openEditModal(p)">
                        ✎ Edit piece
                      </button>
                      <div class="my-1 border-t border-ink-100"></div>
                      @if (p.status !== 'idea') {
                        <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900"
                                (click)="setStatus(p, 'idea')">
                          Move to Idea
                        </button>
                      }
                      @if (p.status !== 'draft') {
                        <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900"
                                (click)="setStatus(p, 'draft')">
                          Move to Draft
                        </button>
                      }
                      @if (p.status !== 'published') {
                        <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900"
                                (click)="setStatus(p, 'published')">
                          Mark as Published
                        </button>
                      }
                      <div class="my-1 border-t border-ink-100"></div>
                      @if (p.status === 'draft' || p.briefUrl) {
                        <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900"
                                (click)="openDraftLinkModal(p)">
                          {{ p.briefUrl ? 'Edit draft link' : 'Add draft link' }}
                        </button>
                      }
                      @if (p.status === 'published') {
                        <button class="block w-full text-left px-3 py-1.5 hover:bg-ink-50 text-ink-700 hover:text-ink-900"
                                (click)="openPublishModal(p)">
                          {{ p.publishedUrl ? 'Edit published URL' : 'Add published URL' }}
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

                <button type="button"
                        class="w-7 h-7 rounded-md text-ink-400 hover:text-danger-500 hover:bg-danger-100 flex items-center justify-center text-lg leading-none"
                        (click)="confirmRemove(p)"
                        title="Delete piece">×</button>
              </div>
            </li>
          }
          @if (visiblePieces().length === 0) {
            <li class="px-6 py-12 text-center text-sm text-ink-400 italic">
              @if (filter() === 'all') {
                No content pieces yet. Add one above.
              } @else {
                No pieces in <strong>{{ filter() }}</strong>.
              }
            </li>
          }
        </ul>
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

          <div class="space-y-3">
            <div>
              <label class="label">Published URL</label>
              <input class="input"
                     [(ngModel)]="publishUrlInput"
                     placeholder="https://example.com/blog/my-piece"
                     #urlInput
                     autofocus />
              <p class="text-[11px] text-ink-400 mt-1">
                Used in client-facing reports and included in the
                auto-generated publication task's Google Doc entry.
              </p>
            </div>
            <div>
              <label class="label">Meta title</label>
              <input class="input"
                     [(ngModel)]="publishMetaTitleInput"
                     placeholder="SEO title tag as it appears on the SERP" />
            </div>
            <div>
              <label class="label">Meta description</label>
              <textarea class="input min-h-[70px] resize-y"
                        [(ngModel)]="publishMetaDescriptionInput"
                        placeholder="SEO description shown under the title on the SERP"></textarea>
              <p class="text-[11px] text-ink-400 mt-1">
                Along with the focused keyword + URL, these fields
                go into the description of the Publication task the
                platform auto-completes on publish.
              </p>
            </div>
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
              {{ publishSaving() ? 'Saving…' : 'Save & publish' }}
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

    <!-- Full edit modal. Kept intentionally simple: all the piece's
         first-class fields (type, status, title, keyword, notes, draft
         URL, published URL). Attachments stay inline on the list row
         because they're big enough to warrant their own visible slot. -->
    @if (editModalPiece(); as p) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="dismissEditModal()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="text-lg font-bold text-ink-900">Edit piece</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Change any field. Attachments stay on the list row.
              </p>
            </div>
            <button type="button" (click)="dismissEditModal()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="label">Title</label>
              <input class="input" [(ngModel)]="editForm.title" placeholder="Piece title" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Type</label>
                <select class="input" [(ngModel)]="editForm.contentType">
                  @for (t of types; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Status</label>
                <select class="input" [(ngModel)]="editForm.status">
                  @for (s of statuses; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </div>
            </div>

            <div>
              <label class="label">Target keyword</label>
              <input class="input" [(ngModel)]="editForm.targetKeyword"
                     placeholder="e.g. truck repair Palmyra PA" />
            </div>

            <div>
              <label class="label">Notes</label>
              <textarea class="input min-h-[80px]" [(ngModel)]="editForm.notes"
                        placeholder="Angle, brief, context…"></textarea>
            </div>

            <div>
              <label class="label">Draft URL <span class="text-ink-400 font-normal">(optional)</span></label>
              <input class="input" [(ngModel)]="editForm.briefUrl"
                     placeholder="https://docs.google.com/document/d/…" />
            </div>

            <div>
              <label class="label">Published URL <span class="text-ink-400 font-normal">(optional)</span></label>
              <input class="input" [(ngModel)]="editForm.publishedUrl"
                     placeholder="https://example.com/blog/my-piece" />
            </div>

            <!-- Attachments — inline management, no leaving the modal -->
            <div>
              <label class="label">Attachments</label>
              @if (p.attachments?.length) {
                <div class="space-y-1.5">
                  @for (a of p.attachments || []; track a.publicId) {
                    <div class="flex items-center gap-2 text-xs bg-ink-50 border border-ink-200 rounded px-2 py-1.5">
                      <a [href]="a.url" target="_blank" rel="noopener"
                         class="flex-1 text-ink-700 hover:text-brand-500 truncate font-medium"
                         [title]="a.originalFilename || a.publicId">
                        📎 {{ a.originalFilename || 'attachment' }}
                      </a>
                      <button type="button" class="text-ink-400 hover:text-danger-500 leading-none px-1 text-lg"
                              (click)="removeAttachment(p, a)"
                              title="Remove attachment">×</button>
                    </div>
                  }
                </div>
              } @else {
                <div class="text-xs text-ink-400 italic mb-2">
                  No files attached yet.
                </div>
              }
              <button type="button"
                      class="mt-2 text-xs font-semibold px-3 py-1.5 rounded-md bg-white border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-50"
                      [disabled]="!cloudinary.isConfigured() || uploadingFor() === p._id"
                      [title]="cloudinary.isConfigured() ? '' : 'Cloudinary not configured'"
                      (click)="triggerAttachFile(p)">
                {{ uploadingFor() === p._id ? 'Uploading ' + uploadProgress() + '%…' : '📎 Attach file' }}
              </button>
            </div>
          </div>

          @if (editError()) {
            <div class="text-xs text-danger-500 mt-3">{{ editError() }}</div>
          }

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="dismissEditModal()" [disabled]="editSaving()">
              Cancel
            </button>
            <button class="btn-primary" (click)="saveEdit()"
                    [disabled]="editSaving() || !editForm.title?.trim()">
              {{ editSaving() ? 'Saving…' : 'Save changes' }}
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
  protected cloudinary = inject(CloudinaryService);

  pieces = signal<ContentPiece[]>([]);
  statuses: ContentStatus[] = CONTENT_STATUSES;
  types: ContentPieceType[] = CONTENT_PIECE_TYPES;

  // Active status filter for the list view. 'all' shows every piece;
  // the specific values match ContentStatus one-to-one.
  filter = signal<'all' | ContentStatus>('all');

  readonly filterTabs: { key: 'all' | ContentStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'idea', label: 'Idea' },
    { key: 'draft', label: 'Draft' },
    { key: 'published', label: 'Published' },
  ];

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
  // Captured alongside the URL so the auto-completed publication
  // task carries the full SEO context into the Google Doc mirror.
  publishMetaTitleInput = '';
  publishMetaDescriptionInput = '';
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

  // Full edit modal state. The form is kept as a plain object rather
  // than a signal since Angular's two-way binding already re-renders
  // the modal on change.
  editModalPiece = signal<ContentPiece | null>(null);
  editForm: Partial<ContentPiece> = {};
  editSaving = signal(false);
  editError = signal<string | null>(null);

  // Per-piece "which action is in flight" signals so the row buttons
  // can show spinners without a global "working" flag that would
  // freeze every row at once.
  indexationBusyId = signal<string | null>(null);
  indexingBusyId = signal<string | null>(null);

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

  // Pieces to render in the list, filtered by the current tab. Sorted
  // by status priority (idea → draft → published) then most-recent
  // first so the top of the list is always where the reader's
  // attention should be — WIP surfaces over completed work.
  visiblePieces = computed<ContentPiece[]>(() => {
    const f = this.filter();
    const rank: Record<ContentStatus, number> = {
      idea: 0,
      draft: 1,
      published: 2,
    };
    const list = f === 'all'
      ? [...this.pieces()]
      : this.pieces().filter((p) => p.status === f);
    return list.sort((a, b) => {
      const rankDiff = rank[a.status] - rank[b.status];
      if (rankDiff !== 0) return rankDiff;
      const aT = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bT = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bT - aT;
    });
  });

  countFor(key: 'all' | ContentStatus): number {
    if (key === 'all') return this.pieces().length;
    return this.byStatus()[key]?.length || 0;
  }

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

  statusChipClass(s: ContentStatus): string {
    switch (s) {
      case 'draft':
        return 'bg-warning-100 text-warning-500';
      case 'published':
        return 'bg-positive-100 text-positive-500';
      case 'idea':
      default:
        return 'bg-ink-100 text-ink-500';
    }
  }

  primaryActionLabel(p: ContentPiece): string {
    if (this.creatingTaskFor() === p._id) return 'Moving…';
    switch (p.status) {
      case 'idea':
        return 'Write draft';
      case 'draft':
        return 'Mark published';
      case 'published':
        return 'Open';
      default:
        return '';
    }
  }

  primaryActionClass(s: ContentStatus): string {
    if (s === 'published') {
      return 'bg-white border border-ink-200 text-ink-700 hover:bg-ink-100';
    }
    return 'bg-brand-500 text-white hover:bg-brand-600';
  }

  /**
   * The list view collapses "advance workflow" into a single button
   * whose action depends on where the piece is. Idea → creates a task
   * and moves to draft (existing helper). Draft → opens the publish
   * modal so the URL is captured in one step. Published → opens the
   * live page in a new tab.
   */
  primaryAction(p: ContentPiece) {
    switch (p.status) {
      case 'idea':
        this.createTaskForPiece(p);
        return;
      case 'draft':
        this.openPublishModal(p);
        return;
      case 'published':
        if (p.publishedUrl) {
          window.open(p.publishedUrl, '_blank', 'noopener');
        } else {
          this.openPublishModal(p);
        }
        return;
    }
  }

  /**
   * Kebab-menu shortcut to change status without going through the
   * primary action. Handles the idea→published intercept the same way
   * as the old inline dropdown.
   */
  setStatus(p: ContentPiece, status: ContentStatus) {
    this.menuOpenId.set(null);
    this.changeStatus(p, status);
  }

  // --- Indexation -------------------------------------------------------

  /**
   * Chip color/label reflect the last GSC verdict. Never-checked
   * pieces show a neutral "not checked" tag so the reader knows they
   * can trigger a check — vs. a definite "not indexed" verdict.
   */
  indexationChipClass(p: ContentPiece): string {
    const v = p.indexation?.verdict;
    if (!v) return 'bg-ink-100 text-ink-500 border border-ink-200';
    if (v === 'PASS') return 'bg-positive-100 text-positive-500 border border-positive-500/30';
    if (v === 'PARTIAL' || v === 'NEUTRAL')
      return 'bg-warning-100 text-warning-500 border border-warning-500/30';
    return 'bg-danger-100 text-danger-500 border border-danger-500/30';
  }

  indexationChipLabel(p: ContentPiece): string {
    const idx = p.indexation;
    if (!idx?.checkedAt) return 'Not checked';
    const v = idx.verdict;
    if (v === 'PASS') return `● Indexed`;
    if (v === 'PARTIAL') return `◐ Partial`;
    if (v === 'NEUTRAL') return `◑ Neutral`;
    if (v === 'FAIL') return `● Not indexed`;
    return idx.coverageState || 'Checked';
  }

  indexationTooltip(p: ContentPiece): string {
    const idx = p.indexation;
    if (!idx?.checkedAt) return 'No indexation check yet. Click Recheck to run one.';
    const parts: string[] = [];
    if (idx.coverageState) parts.push(idx.coverageState);
    if (idx.indexingState) parts.push(`Indexing: ${idx.indexingState}`);
    if (idx.lastCrawlTime) parts.push(`Last crawl: ${new Date(idx.lastCrawlTime).toLocaleString()}`);
    parts.push(`Checked: ${new Date(idx.checkedAt).toLocaleString()}`);
    if (idx.indexingRequestedAt) {
      parts.push(`Indexing requested: ${new Date(idx.indexingRequestedAt).toLocaleString()}`);
    }
    return parts.join(' · ');
  }

  richResultsUrl(publishedUrl: string): string {
    return `https://search.google.com/test/rich-results?url=${encodeURIComponent(publishedUrl)}`;
  }

  checkIndexation(p: ContentPiece) {
    if (!p._id) return;
    this.indexationBusyId.set(p._id);
    this.svc.checkIndexation(p._id).subscribe({
      next: () => {
        this.indexationBusyId.set(null);
        this.flashToast('success', 'Indexation status refreshed.');
        this.load();
      },
      error: (err) => {
        this.indexationBusyId.set(null);
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Indexation check failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
    });
  }

  requestIndexing(p: ContentPiece) {
    if (!p._id) return;
    this.indexingBusyId.set(p._id);
    this.svc.requestIndexing(p._id).subscribe({
      next: () => {
        this.indexingBusyId.set(null);
        this.flashToast('success', 'Indexing request sent to Google.');
        this.load();
      },
      error: (err) => {
        this.indexingBusyId.set(null);
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Indexing request failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
        );
      },
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
    // Prefill meta fields if the piece already carries them from a
    // previous publish, so a re-publish doesn't blank them out.
    this.publishMetaTitleInput = p.metaTitle ?? '';
    this.publishMetaDescriptionInput = p.metaDescription ?? '';
    this.publishError.set(null);
    this.publishModalPiece.set(p);
  }

  dismissPublishModal() {
    if (this.publishSaving()) return;
    this.publishModalPiece.set(null);
    this.publishUrlInput = '';
    this.publishMetaTitleInput = '';
    this.publishMetaDescriptionInput = '';
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
      .update(piece._id, {
        status: 'published',
        publishedUrl: url,
        metaTitle: this.publishMetaTitleInput.trim() || undefined,
        metaDescription: this.publishMetaDescriptionInput.trim() || undefined,
      })
      .subscribe({
        next: (resp) => {
          this.publishSaving.set(false);
          this.publishModalPiece.set(null);
          this.publishUrlInput = '';
          this.publishMetaTitleInput = '';
          this.publishMetaDescriptionInput = '';
          this.reportTaskAutoComplete(resp);
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
    this.svc
      .update(piece._id, {
        status: 'published',
        metaTitle: this.publishMetaTitleInput.trim() || undefined,
        metaDescription: this.publishMetaDescriptionInput.trim() || undefined,
      })
      .subscribe({
      next: (resp) => {
        this.publishSaving.set(false);
        this.publishModalPiece.set(null);
        this.publishUrlInput = '';
        this.publishMetaTitleInput = '';
        this.publishMetaDescriptionInput = '';
        this.reportTaskAutoComplete(resp);
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

  /**
   * The backend embeds a `_taskAutoComplete` blob on the response
   * when publishing a piece spawns the completed publication task
   * (focused keyword / meta title / meta description / URL baked
   * into its description) and fires the Google Doc mirror off it.
   * Toast the outcome so the reader knows the deliverable landed
   * in the doc — or exactly what went wrong when it didn't.
   */
  private reportTaskAutoComplete(resp: ContentPiece | unknown) {
    const meta = (resp as { _taskAutoComplete?: TaskAutoCompleteResult })
      ._taskAutoComplete;
    if (!meta) return;
    if (meta.status === 'completed') {
      const docNote =
        meta.docSync && meta.docSync.ok === false
          ? ` (Google Doc sync failed: ${meta.docSync.message ?? 'unknown'})`
          : meta.docSync?.message
            ? ` — ${meta.docSync.message}`
            : '';
      this.flashToast(
        'success',
        `Piece published. Publication task created and completed${docNote}.`,
      );
    } else if (meta.status === 'blocked') {
      this.flashToast(
        'error',
        `Piece published but the publication task could not be created: ${meta.reason ?? 'unknown'}. Add it manually from the Tasks tab.`,
      );
    }
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
   * Moves the piece from Idea to Draft. Previously this also spawned
   * an in-progress task, but that task carried no useful info and
   * just cluttered the Tasks tab. The real deliverable task is now
   * created at publish time (already-completed, with the full SEO
   * metadata baked in — see the Publish modal + TasksService
   * .completeForContentPiece).
   */
  createTaskForPiece(p: ContentPiece) {
    if (!p._id) return;
    this.creatingTaskFor.set(p._id);
    this.svc.update(p._id, { status: 'draft' }).subscribe({
      next: () => {
        this.creatingTaskFor.set(null);
        this.menuOpenId.set(null);
        this.flashToast('success', `"${p.title}" moved to Draft.`);
        this.load();
      },
      error: (err) => {
        this.creatingTaskFor.set(null);
        this.menuOpenId.set(null);
        const m = err?.error?.message;
        this.flashToast(
          'error',
          `Could not move to Draft: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
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

  // --- Edit modal --------------------------------------------------------

  /**
   * Opens the full-edit modal for a piece. Seeds the form from the
   * current piece; edits are held locally until Save so a Cancel
   * discards without a network roundtrip.
   */
  openEditModal(p: ContentPiece) {
    this.menuOpenId.set(null);
    this.editForm = {
      title: p.title,
      contentType: p.contentType || 'post',
      status: p.status,
      targetKeyword: p.targetKeyword || '',
      notes: p.notes || '',
      briefUrl: p.briefUrl || '',
      publishedUrl: p.publishedUrl || '',
    };
    this.editError.set(null);
    this.editModalPiece.set(p);
  }

  dismissEditModal() {
    if (this.editSaving()) return;
    this.editModalPiece.set(null);
    this.editForm = {};
    this.editError.set(null);
  }

  saveEdit() {
    const piece = this.editModalPiece();
    if (!piece?._id) return;
    const title = (this.editForm.title || '').trim();
    if (!title) {
      this.editError.set('Title is required.');
      return;
    }
    // Normalize empty strings to undefined so we clear optional fields
    // rather than persisting whitespace.
    const patch: Partial<ContentPiece> = {
      title,
      contentType: this.editForm.contentType,
      status: this.editForm.status,
      targetKeyword: (this.editForm.targetKeyword || '').trim() || undefined,
      notes: (this.editForm.notes || '').trim() || undefined,
      briefUrl: (this.editForm.briefUrl || '').trim() || undefined,
      publishedUrl: (this.editForm.publishedUrl || '').trim() || undefined,
    };
    this.editSaving.set(true);
    this.editError.set(null);
    this.svc.update(piece._id, patch).subscribe({
      next: () => {
        this.editSaving.set(false);
        this.editModalPiece.set(null);
        this.editForm = {};
        this.flashToast('success', 'Piece updated.');
        this.load();
      },
      error: (err) => {
        this.editSaving.set(false);
        const m = err?.error?.message;
        this.editError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not save.',
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
    await this.uploadOne(pieceId, file);
  }

  /**
   * Drag-and-drop entry point. Uploads every dropped file sequentially
   * so we don't spam the Cloudinary widget or the progress signal.
   * Skips silently if the piece has an upload already running.
   */
  async onFilesDropped(p: ContentPiece, files: File[]) {
    if (!p._id) return;
    if (!this.cloudinary.isConfigured()) {
      this.flashToast('error', 'Cloudinary is not configured — cannot upload files.');
      return;
    }
    if (this.uploadingFor()) return;
    for (const file of files) {
      await this.uploadOne(p._id, file);
    }
  }

  /**
   * Single-file upload path shared by the menu button (file input) and
   * drag-and-drop. Uploads to Cloudinary with progress, then registers
   * the metadata with the API. Toast + load on completion.
   */
  private async uploadOne(pieceId: string, file: File): Promise<void> {
    this.uploadingFor.set(pieceId);
    this.uploadProgress.set(0);
    try {
      const result = await this.cloudinary.upload(file, (pct) =>
        this.uploadProgress.set(pct),
      );
      await new Promise<void>((resolve) => {
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
              this.flashToast('success', `Attached ${file.name}.`);
              this.load();
              resolve();
            },
            error: (err) => {
              this.uploadingFor.set(null);
              this.attachTargetId = null;
              const m = err?.error?.message;
              this.flashToast(
                'error',
                `Attach failed: ${Array.isArray(m) ? m.join(', ') : m || 'unknown error'}`,
              );
              resolve();
            },
          });
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
