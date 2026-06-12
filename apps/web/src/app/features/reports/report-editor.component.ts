import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { QuillEditorComponent } from 'ngx-quill';
import {
  Client,
  Cycle,
  LOCATIONS_SORT_OPTIONS,
  LocationsSortKey,
  Report,
  Task,
} from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { CyclesService } from '../../core/cycles.service';
import { ReportsService } from '../../core/reports.service';
import { TasksService } from '../../core/tasks.service';
import { SanitizerService } from '../../core/sanitizer.service';
import { GoogleIntegrationsService } from '../../core/google-integrations.service';
import { CloudinaryService } from '../../core/cloudinary.service';

interface KpiGroup {
  label: string;
  description: string;
  fields: Array<{ key: string; label: string; suffix?: string }>;
}

@Component({
  selector: 'app-report-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillEditorComponent, RouterLink],
  template: `
    <div class="page-container max-w-6xl">
      <!-- Sticky action bar -->
      <header class="sticky top-0 -mx-8 -mt-6 px-8 py-4 bg-ink-50/95 backdrop-blur z-30 mb-6 border-b border-ink-200">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="min-w-0">
              <h1 class="text-xl font-bold text-ink-900 leading-tight truncate">
                Bi-weekly report
                @if (selectedClientName(); as name) {
                  <span class="text-brand-500">· {{ name }}</span>
                }
              </h1>
              <p class="text-xs text-ink-500 mt-0.5">
                @if (selectedCycleLabel(); as cl) {
                  Cycle <strong>{{ cl }}</strong>
                } @else {
                  Select a client and cycle to start
                }
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <button class="btn-secondary" (click)="autoCompose()" [disabled]="!ready() || saving()" title="Generate base content from tasks">
              ⚡ Auto-compose
            </button>
            <button class="btn-primary" (click)="save()" [disabled]="!ready() || saving()">
              @if (saving()) { Saving… } @else { 💾 Save }
            </button>
            <button class="btn-secondary" (click)="viewPdf()" [disabled]="!ready() || downloading()">
              {{ downloading() ? '…' : '👁 View PDF' }}
            </button>
            <button class="btn-secondary" (click)="downloadPdf()" [disabled]="!ready() || downloading()">
              ⬇
            </button>
            <button class="btn-primary" (click)="share()" [disabled]="!ready() || sharing()">
              {{ sharing() ? '…' : '🔗 Share' }}
            </button>
          </div>
        </div>

        @if (saveMessage()) {
          <div class="mt-3 rounded-md bg-positive-100 border border-positive-500/20 px-3 py-2 text-sm text-positive-500">
            ✓ {{ saveMessage() }}
          </div>
        }
        @if (pdfError()) {
          <div class="mt-3 rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
            {{ pdfError() }}
          </div>
        }
      </header>

      <!-- Selectors -->
      <div class="card mb-6 relative">
        @if (loadingReport()) {
          <div class="absolute top-0 left-0 right-0">
            <div class="loading-bar"></div>
          </div>
        }
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="label">Client</label>
            <select class="input" [ngModel]="clientId()" (ngModelChange)="onClientChange($event)"
                    [disabled]="loadingReport()">
              <option value="">Select client</option>
              @for (c of clients(); track c._id) {
                <option [value]="c._id">{{ c.name }} (Tier {{ c.tier }})</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Cycle</label>
            <select class="input" [ngModel]="cycleId()" (ngModelChange)="onCycleChange($event)"
                    [disabled]="loadingReport()">
              <option value="">Select cycle</option>
              @for (c of cycles(); track c._id) {
                <option [value]="c._id">{{ c.label }} ({{ c.status }})</option>
              }
            </select>
          </div>
        </div>
        @if (loadingReport()) {
          <div class="flex items-center gap-2 mt-3 text-xs text-ink-500">
            <span class="spinner"></span>
            <span>Loading client report…</span>
          </div>
        }
      </div>

      <!-- Share banner -->
      @if (shareToken()) {
        <div class="card mb-6 bg-ink-900 text-white border-ink-900">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div class="text-[10px] uppercase tracking-wider font-bold text-brand-300">
              🔗 Public link active · 🔒 PIN protected
            </div>
            <button (click)="revokeShare()" class="text-xs text-danger-100 hover:text-white opacity-70 hover:opacity-100">
              Revoke access
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              #shareInput
              type="text"
              readonly
              [value]="shareUrl()"
              class="bg-ink-700 text-white text-sm rounded px-3 py-2 flex-1 min-w-0 font-mono border border-white/10"
              (click)="shareInput.select()" />
            <button class="btn-primary" (click)="copyShareUrl(shareInput)">
              {{ copied() ? '✓ Copied' : 'Copy' }}
            </button>
            <a [href]="shareUrl()" target="_blank" class="btn-secondary"
               title="Open the public report. Logged-in owners and managers skip the PIN gate.">
              👁 Preview ↗
            </a>
            <button class="btn-primary" (click)="openSendModal()">
              ✉ Send to client
            </button>
          </div>

          <!-- PIN banner -->
          @if (sharePin(); as pin) {
            <div class="mt-4 p-4 bg-brand-500/10 border border-brand-500/30 rounded-md">
              <div class="flex items-start gap-3">
                <div class="text-brand-300 text-lg leading-none mt-0.5">🔐</div>
                <div class="flex-1 min-w-0">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-brand-300 mb-1">
                    Save this PIN — it will not be shown again
                  </div>
                  <div class="flex items-center gap-2 mt-2">
                    <code class="text-2xl font-black tracking-[0.4em] text-white bg-ink-700 px-4 py-2 rounded border border-white/10">
                      {{ pin }}
                    </code>
                    <button (click)="copyPin(pin)" class="btn-secondary btn-sm">
                      {{ pinCopied() ? '✓ Copied' : 'Copy PIN' }}
                    </button>
                    <button (click)="dismissPin()" class="text-xs text-white/50 hover:text-white px-2">
                      I saved it ✓
                    </button>
                  </div>
                  <p class="text-[10px] text-white/60 mt-2 leading-relaxed">
                    Share this PIN with the client securely. The client will be required to enter it before viewing the report.
                  </p>
                </div>
              </div>
            </div>
          } @else {
            <div class="mt-3 flex items-center justify-between gap-3 text-xs text-white/60">
              <span>The client needs the 6-digit PIN to unlock this report.</span>
              <button (click)="resetPin()"
                      [disabled]="resettingPin()"
                      class="text-brand-300 hover:text-white underline disabled:opacity-50">
                {{ resettingPin() ? 'Generating…' : 'Reset PIN' }}
              </button>
            </div>
          }
        </div>
      }

      @if (ready()) {
        <div class="space-y-6 transition-opacity"
             [class.opacity-50]="loadingReport()"
             [class.pointer-events-none]="loadingReport()">

          <!-- 1. Introduction / Executive Summary -->
          <section class="card">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                  <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">01</span>
                  Introduction
                </h2>
                <p class="text-xs text-ink-500 mt-1">
                  Brief message for the client. Appears at the top of the report. Use the toolbar for bold, italic, lists and clickable links.
                </p>
              </div>
            </div>

            <!-- Cover image -->
            <div class="mb-4">
              <label class="label mb-2">Cover picture</label>
              <p class="text-[11px] text-ink-400 mb-2">
                Displayed full-width above the Executive Summary in the public report.
                Recommended: 1600 × 600 px, landscape, ≤ 2 MB.
              </p>
              @if (coverImageUrl()) {
                <div class="rounded-lg overflow-hidden border border-ink-200 bg-ink-50 relative group">
                  <img [src]="coverImageUrl()" alt="Cover"
                       class="w-full max-h-64 object-cover" />
                  <button type="button"
                          (click)="removeCoverImage()"
                          [disabled]="uploadingCover()"
                          class="absolute top-2 right-2 px-2 py-1 rounded bg-ink-900/80 text-white text-xs font-semibold hover:bg-danger-500 transition opacity-0 group-hover:opacity-100">
                    Remove
                  </button>
                </div>
                <button type="button"
                        (click)="coverInput.click()"
                        [disabled]="uploadingCover()"
                        class="mt-2 text-xs font-semibold text-brand-500 hover:text-brand-600 disabled:opacity-50">
                  {{ uploadingCover() ? 'Uploading…' : 'Replace image' }}
                </button>
              } @else {
                @if (cloudinary.isConfigured()) {
                  <div
                    class="w-full block border-2 border-dashed rounded-lg p-6 text-center transition cursor-pointer"
                    [class.border-ink-300]="!coverDropActive()"
                    [class.hover:border-brand-500]="!coverDropActive()"
                    [class.border-brand-500]="coverDropActive()"
                    [class.bg-brand-50]="coverDropActive()"
                    [class.opacity-50]="uploadingCover()"
                    (click)="coverInput.click()"
                    (dragenter)="onCoverDragEnter($event)"
                    (dragover)="onCoverDragOver($event)"
                    (dragleave)="onCoverDragLeave($event)"
                    (drop)="onCoverDrop($event)">
                    <div class="text-3xl mb-1">🖼</div>
                    <div class="font-semibold text-ink-900 text-sm">
                      {{ uploadingCover() ? 'Uploading…' : 'Add cover picture' }}
                    </div>
                    <div class="text-[11px] text-ink-500 mt-0.5">PNG · JPG · WebP — up to 10 MB</div>
                    <div class="text-[11px] text-ink-400 mt-2">
                      or drop it here · paste with
                      <kbd class="px-1.5 py-0.5 rounded border border-ink-300 bg-white text-[10px] font-mono text-ink-700">{{ coverPasteHint }}</kbd>
                    </div>
                  </div>
                  <button type="button"
                          (click)="pasteCoverFromClipboard(); $event.stopPropagation()"
                          [disabled]="uploadingCover() || readingCoverClipboard()"
                          class="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-ink-200 bg-white text-sm font-semibold text-ink-700 hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 transition">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="3.5" y="2.5" width="9" height="11" rx="1.5" />
                      <path d="M6 2.5V1.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" stroke-linecap="round" />
                    </svg>
                    {{ readingCoverClipboard() ? 'Reading clipboard…' : 'Paste from clipboard' }}
                  </button>
                } @else {
                  <div class="rounded-md border border-warning-500/30 bg-warning-100/40 px-3 py-2 text-xs text-warning-500">
                    Cloudinary is not configured. Set <code>cloudName</code> and
                    <code>uploadPreset</code> in <code>apps/web/src/environments/environment.ts</code>.
                  </div>
                }
              }
              <input #coverInput type="file" accept="image/*" class="hidden"
                     (change)="onCoverPick($event)" />
              @if (coverUploadProgress() !== null) {
                <div class="mt-2">
                  <div class="flex items-center justify-between text-[11px] text-ink-500 mb-1">
                    <span>Uploading…</span>
                    <span>{{ coverUploadProgress() }}%</span>
                  </div>
                  <div class="h-1 bg-ink-100 rounded-full overflow-hidden">
                    <div class="h-full bg-brand-500 transition-all"
                         [style.width.%]="coverUploadProgress()"></div>
                  </div>
                </div>
              }
              @if (coverError()) {
                <div class="mt-2 text-xs text-danger-500">{{ coverError() }}</div>
              }
            </div>

            <quill-editor
              [(ngModel)]="summaryText"
              format="html"
              placeholder="During this period we focused on…"></quill-editor>
          </section>

          <!-- 2. KPIs grouped -->
          <section class="card">
            <div class="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                  <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">02</span>
                  Period metrics
                </h2>
                <p class="text-xs text-ink-500 mt-1">
                  KPIs with a previous period are compared automatically and show a green/red arrow.
                </p>
              </div>
              <div class="flex items-center gap-2">
                <select class="input input-sm text-xs"
                        [ngModel]="pullRangePreset()"
                        (ngModelChange)="setPullRangePreset($event)">
                  @for (opt of pullRangeOptions; track opt.value) {
                    <option [value]="opt.value">{{ opt.label }}</option>
                  }
                </select>
                <button class="btn-secondary text-xs"
                        type="button"
                        (click)="pullKpisFromGoogle()"
                        [disabled]="pullingKpis() || !clientId() || !cycleId()"
                        title="Fetch KPIs from Google Search Console + Google Analytics for the selected range.">
                  @if (pullingKpis()) {
                    <span class="inline-flex items-center gap-1.5"><span class="spinner" style="width:10px;height:10px;"></span> Pulling…</span>
                  } @else {
                    ⚡ Pull KPIs from Google
                  }
                </button>
              </div>
            </div>

            <!-- Compare periods toggle -->
            <div class="mb-4 flex items-center justify-between gap-3 rounded-md border border-ink-200 bg-ink-50/50 px-3 py-2">
              <div>
                <div class="text-xs font-semibold text-ink-900">Compare periods</div>
                <p class="text-[11px] text-ink-500 mt-0.5">
                  When on, KPI cards in the public report show a delta vs the
                  prior cycle (or baseline if first report). Turn off to show
                  only current-period numbers.
                </p>
              </div>
              <label class="inline-flex items-center gap-2 cursor-pointer flex-shrink-0">
                <input type="checkbox" [(ngModel)]="comparePeriods" class="rounded" />
                <span class="text-xs font-semibold text-ink-700">
                  {{ comparePeriods ? 'On' : 'Off' }}
                </span>
              </label>
            </div>

            @if (pullRangePreset() === 'custom') {
              <div class="mb-4 grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <label class="label">From</label>
                  <input type="date" class="input"
                         [ngModel]="pullFromDate()"
                         (ngModelChange)="pullFromDate.set($event)" />
                </div>
                <div>
                  <label class="label">To</label>
                  <input type="date" class="input"
                         [ngModel]="pullToDate()"
                         (ngModelChange)="pullToDate.set($event)" />
                </div>
              </div>
            }

            @if (pullResult(); as r) {
              <div [class]="'mb-4 rounded-md px-3 py-2 text-xs border ' +
                (r.sources.gsc || r.sources.ga4
                  ? 'border-positive-500/30 bg-positive-100/40 text-ink-700'
                  : 'border-danger-500/30 bg-danger-100/40 text-danger-500')">
                <div class="font-semibold">
                  @if (r.sources.gsc || r.sources.ga4) {
                    ✓ Pulled from
                    @if (r.sources.gsc) { <span>Search Console</span> }
                    @if (r.sources.gsc && r.sources.ga4) { <span> + </span> }
                    @if (r.sources.ga4) { <span>Analytics</span> }
                  } @else {
                    Could not pull KPIs.
                  }
                </div>
                @if (pullRangeUsed(); as range) {
                  <div class="mt-1 text-[11px] text-ink-600">
                    Range: <strong>{{ range.from }}</strong> → <strong>{{ range.to }}</strong>
                    ({{ range.days }} day{{ range.days === 1 ? '' : 's' }})
                  </div>
                }
                @if (r.sources.gsc && pullHasRecentDates()) {
                  <div class="mt-1 text-[11px] text-warning-500">
                    ⚠ GSC data has a ~2-day lag — the last 2 days of the range may be empty.
                  </div>
                }
                @if (r.sources.warnings.length) {
                  <ul class="mt-1 list-disc pl-4 text-[11px]">
                    @for (w of r.sources.warnings; track w) {
                      <li>{{ w }}</li>
                    }
                  </ul>
                }
              </div>
            }

            @for (group of kpiGroups; track group.label) {
              <div class="mb-5">
                <div class="flex items-baseline justify-between mb-2 pb-1 border-b border-ink-100">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-ink-700">{{ group.label }}</h3>
                  <span class="text-[10px] text-ink-400">{{ group.description }}</span>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  @for (k of group.fields; track k.key) {
                    <div>
                      <label class="label">{{ k.label }}</label>
                      <div class="relative">
                        <input type="number"
                               class="input"
                               [name]="'kpi_' + k.key"
                               [(ngModel)]="kpis[k.key]"
                               step="any"
                               placeholder="—" />
                        @if (k.suffix) {
                          <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">{{ k.suffix }}</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </section>

          <!-- 3 & 4. Side by side — auto-derived from tasks (read-only preview) -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section class="card">
              <div class="flex items-start justify-between mb-3 gap-3">
                <div>
                  <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                    <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">03</span>
                    Actions taken
                  </h2>
                  <p class="text-xs text-ink-500 mt-1">
                    Tasks marked as completed in this cycle. Auto-derived from the Tasks tab.
                  </p>
                </div>
                <a [routerLink]="['/clients', clientId()]"
                   class="text-[10px] text-brand-500 hover:text-brand-700 whitespace-nowrap font-semibold uppercase tracking-wider">
                  Edit in Tasks →
                </a>
              </div>
              @if (completedTasks().length) {
                <div class="space-y-2">
                  @for (t of completedTasks(); track t._id) {
                    <div class="flex items-start gap-2 p-2.5 bg-ink-50 rounded-md border border-ink-100">
                      <span class="text-positive-500 text-sm flex-shrink-0 mt-0.5">✓</span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 rounded"
                                [ngClass]="categoryBadgeClass(t.category)">{{ t.category }}</span>
                          @if (t.attachments?.length) {
                            <span class="text-[10px] text-ink-400">📎 {{ t.attachments?.length }}</span>
                          }
                        </div>
                        <div class="text-sm font-medium text-ink-900">{{ t.title }}</div>
                        @if (t.description) {
                          <div class="rich-content text-xs text-ink-500 mt-0.5 line-clamp-3"
                               [innerHTML]="sanitize(t.description)"></div>
                          @if (isLongDescription(t.description)) {
                            <button type="button"
                                    (click)="openTaskDescription(t)"
                                    class="mt-1 text-[11px] font-semibold text-brand-500 hover:text-brand-600">
                              View full description →
                            </button>
                          }
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="text-center py-8 text-sm text-ink-400 italic border-2 border-dashed border-ink-200 rounded-lg">
                  No completed tasks yet.<br />
                  <a [routerLink]="['/clients', clientId()]" class="text-brand-500 hover:underline">Go to Tasks →</a>
                </div>
              }
            </section>

            <section class="card">
              <div class="flex items-start justify-between mb-3 gap-3">
                <div>
                  <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                    <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">04</span>
                    Next period plan
                  </h2>
                  <p class="text-xs text-ink-500 mt-1">
                    Tasks still pending. They carry over to the next cycle as the plan.
                  </p>
                </div>
                <a [routerLink]="['/clients', clientId()]"
                   class="text-[10px] text-brand-500 hover:text-brand-700 whitespace-nowrap font-semibold uppercase tracking-wider">
                  Edit in Tasks →
                </a>
              </div>
              @if (pendingTasks().length) {
                <div class="space-y-2">
                  @for (t of pendingTasks(); track t._id) {
                    <div class="flex items-start gap-2 p-2.5 bg-ink-50 rounded-md border border-ink-100">
                      <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                            [ngClass]="priorityBadgeClass(t.priority)">
                        {{ priorityShort(t.priority) }}
                      </span>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-0.5">
                          <span class="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 rounded"
                                [ngClass]="categoryBadgeClass(t.category)">{{ t.category }}</span>
                        </div>
                        <div class="text-sm font-medium text-ink-900">{{ t.title }}</div>
                        @if (t.description) {
                          <div class="rich-content text-xs text-ink-500 mt-0.5 line-clamp-3"
                               [innerHTML]="sanitize(t.description)"></div>
                          @if (isLongDescription(t.description)) {
                            <button type="button"
                                    (click)="openTaskDescription(t)"
                                    class="mt-1 text-[11px] font-semibold text-brand-500 hover:text-brand-600">
                              View full description →
                            </button>
                          }
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="text-center py-8 text-sm text-ink-400 italic border-2 border-dashed border-ink-200 rounded-lg">
                  No pending tasks.<br />
                  <a [routerLink]="['/clients', clientId()]" class="text-brand-500 hover:underline">Plan in Tasks →</a>
                </div>
              }
            </section>
          </div>

          <!-- 5. Pending from client -->
          <section class="card">
            <div class="mb-3">
              <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">05</span>
                Pending from client
                <span class="text-xs text-ink-400 font-normal">(optional)</span>
              </h2>
              <p class="text-xs text-ink-500 mt-1">
                Things you need from the client: access, approvals, content…
              </p>
            </div>
            <quill-editor [(ngModel)]="clientBlockers" format="html"
                          placeholder="Example: Waiting for approval of the new home copy…"></quill-editor>
          </section>

          <!-- 6. Service Areas / Locations -->
          <section class="card">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                  <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">06</span>
                  Locations performance
                </h2>
                <p class="text-xs text-ink-500 mt-1">
                  Show a per-city performance breakdown in the client-facing
                  report. Uses each service area's saved GSC metrics.
                </p>
              </div>
              <label class="inline-flex items-center gap-2 cursor-pointer flex-shrink-0">
                <input type="checkbox" [(ngModel)]="includeServiceAreas" class="rounded" />
                <span class="text-sm text-ink-700">Include in report</span>
              </label>
            </div>

            @if (includeServiceAreas) {
              <div class="mb-3 rounded-md border border-ink-200 bg-ink-50/50 px-3 py-2 flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-ink-900">Sort locations by</div>
                  <p class="text-[11px] text-ink-500 mt-0.5">
                    Best performance appears first. Hubs stay grouped on top.
                  </p>
                </div>
                <select class="input input-sm text-xs w-auto min-w-[220px] flex-shrink-0"
                        [(ngModel)]="locationsSort">
                  @for (opt of locationsSortOptions; track opt.key) {
                    <option [value]="opt.key">{{ opt.label }}</option>
                  }
                </select>
              </div>

              @if (clientServiceAreas().length === 0) {
                <div class="rounded-md border border-warning-500/30 bg-warning-100/40 px-3 py-2 text-xs text-warning-500">
                  This client has no service areas configured. Add some in
                  <a [routerLink]="['/clients', clientId()]" class="font-semibold underline">Service Areas</a>.
                </div>
              } @else {
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                  @for (a of clientServiceAreas(); track a.name) {
                    <div class="rounded-md border border-ink-200 px-3 py-2">
                      <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold text-ink-900 text-sm">{{ a.name }}</span>
                        @if (a.metrics) {
                          <span class="text-[10px] uppercase tracking-wider text-positive-500 font-bold">✓ ready</span>
                        } @else {
                          <span class="text-[10px] uppercase tracking-wider text-warning-500 font-bold">no metrics</span>
                        }
                      </div>
                      @if (a.metrics) {
                        <div class="text-[11px] text-ink-500 mt-1">
                          {{ a.metrics.clicks }} clicks · {{ a.metrics.impressions }} impr ·
                          pos {{ a.metrics.position }}
                        </div>
                      } @else {
                        <div class="text-[11px] text-ink-400 mt-1 italic">
                          Won't appear — refresh metrics in Service Areas first
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            }
          </section>

          <!-- 7. Final Considerations -->
          <section class="card">
            <div class="mb-3">
              <h2 class="text-base font-semibold text-ink-900 flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-wider bg-brand-50 text-brand-600 px-2 py-0.5 rounded">07</span>
                Final considerations
              </h2>
              <p class="text-xs text-ink-500 mt-1">
                Wrap up the report on a professional note — takeaways, strategic recommendations, gratitude, next-quarter outlook.
              </p>
            </div>
            <quill-editor [(ngModel)]="finalConsiderations" format="html"
                          placeholder="To wrap up this period, we want to highlight…"></quill-editor>
          </section>
        </div>
      } @else {
        <div class="card text-center py-16">
          <div class="text-4xl mb-3">📄</div>
          <h2 class="text-lg font-semibold text-ink-900">Select a client and cycle</h2>
          <p class="text-sm text-ink-500 mt-1">to start editing the bi-weekly report</p>
        </div>
      }
    </div>

    <!-- SEND TO CLIENT MODAL -->
    @if (showSendModal()) {
      <div class="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4"
           (click)="closeSendModal()">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-lg" (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-ink-200 flex items-center justify-between">
            <h2 class="text-lg font-bold text-ink-900">Send report notification</h2>
            <button (click)="closeSendModal()" class="text-ink-400 hover:text-ink-700 text-xl leading-none">×</button>
          </div>

          <div class="px-6 py-5 space-y-4">
            <!-- Warning -->
            <div class="bg-warning-100 border border-warning-200 rounded-md px-4 py-3 text-xs text-warning-900 leading-relaxed">
              <strong>A new PIN will be generated and included in the email.</strong>
              Any PIN you may have shared manually will stop working immediately.
            </div>

            <!-- Client contacts -->
            <div>
              <label class="label">Recipients (from client contacts)</label>
              @if (selectedClient()?.contacts?.length) {
                <div class="space-y-2">
                  @for (c of selectedClient()?.contacts || []; track c.email) {
                    @if (c.email) {
                      <label class="flex items-center gap-3 p-2.5 rounded-md border border-ink-200 hover:bg-ink-50 cursor-pointer">
                        <input type="checkbox"
                               [checked]="contactSelection[c.email]"
                               (change)="toggleContact(c.email, $event)" />
                        <div class="flex-1 min-w-0">
                          <div class="text-sm font-semibold text-ink-900">{{ c.name }}</div>
                          <div class="text-xs text-ink-500 truncate">{{ c.email }}{{ c.role ? ' · ' + c.role : '' }}</div>
                        </div>
                      </label>
                    }
                  }
                </div>
              } @else {
                <div class="text-xs text-ink-500 italic px-3 py-4 bg-ink-50 rounded-md border border-ink-200">
                  No contacts found for this client. Add them in the client settings or use the field below.
                </div>
              }
            </div>

            <!-- Custom recipients -->
            <div>
              <label class="label">Additional recipients (comma-separated)</label>
              <input class="input"
                     type="text"
                     [(ngModel)]="customRecipients"
                     placeholder="another@example.com, second@example.com" />
            </div>

            @if (sendError()) {
              <div class="text-xs text-danger-500">{{ sendError() }}</div>
            }
            @if (sendSuccess()) {
              <div class="text-xs text-positive-500 font-semibold">{{ sendSuccess() }}</div>
            }
          </div>

          <div class="px-6 py-4 border-t border-ink-200 flex items-center justify-between gap-2">
            <div class="text-xs text-ink-500">
              {{ resolvedRecipientCount() }} recipient(s)
            </div>
            <div class="flex gap-2">
              <button class="btn-secondary" (click)="closeSendModal()">Cancel</button>
              <button class="btn-primary" (click)="sendNotification()" [disabled]="sending() || resolvedRecipientCount() === 0">
                {{ sending() ? 'Sending…' : 'Send email' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Task description modal -->
    @if (descriptionModal(); as t) {
      <div class="fixed inset-0 bg-ink-900/70 z-[9999] flex items-center justify-center p-4"
           (click)="closeTaskDescription()">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
             (click)="$event.stopPropagation()">
          <div class="px-6 py-4 border-b border-ink-200 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                      [ngClass]="categoryBadgeClass(t.category)">{{ t.category }}</span>
                <span class="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                      [ngClass]="priorityBadgeClass(t.priority)">{{ t.priority }}</span>
                <span class="text-[10px] uppercase tracking-wider font-semibold text-ink-500">{{ t.status }}</span>
              </div>
              <h2 class="text-lg font-bold text-ink-900 leading-snug">{{ t.title }}</h2>
            </div>
            <button (click)="closeTaskDescription()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none flex-shrink-0">×</button>
          </div>
          <div class="px-6 py-5 overflow-y-auto flex-1">
            <div class="rich-content text-sm text-ink-700"
                 [innerHTML]="sanitize(t.description || '')"></div>
            @if (t.notes) {
              <div class="mt-4 pt-4 border-t border-ink-100">
                <div class="text-[10px] uppercase tracking-wider font-semibold text-ink-400 mb-1">Notes</div>
                <div class="text-sm text-ink-700">{{ t.notes }}</div>
              </div>
            }
          </div>
          <div class="px-6 py-3 border-t border-ink-200 flex justify-end">
            <button class="btn-secondary" (click)="closeTaskDescription()">Close</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ReportEditorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private clientsSvc = inject(ClientsService);
  private cyclesSvc = inject(CyclesService);
  private reportsSvc = inject(ReportsService);
  private tasksSvc = inject(TasksService);
  private sanitizer = inject(SanitizerService);
  private googleSvc = inject(GoogleIntegrationsService);
  protected cloudinary = inject(CloudinaryService);

  sanitize(html: string | undefined | null) {
    return this.sanitizer.trustRichHtml(html);
  }

  isLongDescription(html: string | undefined | null): boolean {
    if (!html) return false;
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 220 || (html.match(/\n/g) || []).length > 3;
  }

  openTaskDescription(t: Task) {
    this.descriptionModal.set(t);
  }

  closeTaskDescription() {
    this.descriptionModal.set(null);
  }

  clients = signal<Client[]>([]);
  cycles = signal<Cycle[]>([]);
  clientId = signal<string>('');
  cycleId = signal<string>('');
  report = signal<Report | null>(null);
  downloading = signal(false);
  pdfError = signal<string | null>(null);
  saving = signal(false);
  saveMessage = signal<string | null>(null);
  loadingReport = signal(false);
  sharing = signal(false);
  shareToken = signal<string | null>(null);
  sharePin = signal<string | null>(null);
  pinCopied = signal(false);
  resettingPin = signal(false);
  copied = signal(false);

  // Send-notification modal state
  showSendModal = signal(false);
  sending = signal(false);
  sendError = signal<string | null>(null);
  sendSuccess = signal<string | null>(null);
  contactSelection: Record<string, boolean> = {};
  customRecipients = '';

  selectedClient = computed(() => {
    const id = this.clientId();
    return this.clients().find((c) => c._id === id) || null;
  });

  selectedClientName = computed(() => this.selectedClient()?.name || '');

  selectedCycleLabel = computed(() => {
    const id = this.cycleId();
    return this.cycles().find((c) => c._id === id)?.label || '';
  });

  shareUrl = (): string => {
    const t = this.shareToken();
    if (!t) return '';
    return `${window.location.origin}/r/${t}`;
  };

  summaryText = '';
  findings = '';
  nextPeriodPlan = '';
  clientBlockers = '';
  finalConsiderations = '';
  includeServiceAreas = false;
  comparePeriods = true;
  locationsSort: LocationsSortKey = 'clicks';
  locationsSortOptions = LOCATIONS_SORT_OPTIONS;
  kpis: Record<string, number | null> = {};
  coverImageUrl = signal<string>('');
  uploadingCover = signal(false);
  coverUploadProgress = signal<number | null>(null);
  coverError = signal<string | null>(null);
  descriptionModal = signal<Task | null>(null);
  coverDropActive = signal(false);
  readingCoverClipboard = signal(false);
  coverPasteHint = this.detectPasteHint();
  pullingKpis = signal(false);
  pullResult = signal<import('../../core/google-integrations.service').GoogleKpisResult | null>(null);
  pullRangePreset = signal<'cycle' | 'last7' | 'last28' | 'lastCycle' | 'custom'>('cycle');
  pullFromDate = signal<string>('');
  pullToDate = signal<string>('');
  pullRangeUsed = signal<{ from: string; to: string; days: number } | null>(null);
  pullHasRecentDates = signal(false);

  pullRangeOptions = [
    { value: 'cycle', label: 'This cycle' },
    { value: 'last7', label: 'Last 7 days' },
    { value: 'last28', label: 'Last 28 days' },
    { value: 'lastCycle', label: 'Previous cycle' },
    { value: 'custom', label: 'Custom range' },
  ] as const;

  cycleTasks = signal<Task[]>([]);
  completedTasks = computed(() =>
    this.cycleTasks().filter((t) => t.status === 'completed'),
  );
  pendingTasks = computed(() => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return this.cycleTasks()
      .filter((t) => t.status !== 'completed')
      .sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
  });

  clientServiceAreas = computed(() => {
    const c = this.clients().find((x) => x._id === this.clientId());
    return (c?.serviceAreas || []).slice();
  });

  priorityShort(p: string): string {
    if (p === 'high') return 'High';
    if (p === 'medium') return 'Med';
    return 'Low';
  }

  priorityBadgeClass(p: string): string {
    if (p === 'high') return 'bg-danger-100 text-danger-500';
    if (p === 'medium') return 'bg-warning-100 text-warning-500';
    return 'bg-ink-100 text-ink-500';
  }

  categoryBadgeClass(cat: string): string {
    const map: Record<string, string> = {
      technical: 'bg-ink-100 text-ink-900',
      onpage: 'bg-sky-50 text-sky-600',
      content: 'bg-brand-50 text-brand-700',
      offpage: 'bg-warning-100 text-warning-500',
      'local-gbp': 'bg-positive-100 text-positive-500',
      monitoring: 'bg-ink-100 text-ink-700',
      reporting: 'bg-purple-100 text-purple-700',
    };
    return map[cat] || 'bg-ink-100 text-ink-700';
  }

  kpiGroups: KpiGroup[] = [
    {
      label: 'Organic traffic',
      description: 'Google Analytics 4',
      fields: [
        { key: 'organicSessions', label: 'Organic sessions' },
        { key: 'newUsers', label: 'New users' },
        { key: 'engagementRate', label: 'Engagement rate', suffix: '%' },
        { key: 'avgEngagementTime', label: 'Avg engagement time', suffix: 's' },
        { key: 'conversions', label: 'Conversions' },
        { key: 'conversionRate', label: 'Conversion rate', suffix: '%' },
      ],
    },
    {
      label: 'Search Console',
      description: 'GSC',
      fields: [
        { key: 'impressions', label: 'Impressions' },
        { key: 'clicks', label: 'Clicks' },
        { key: 'ctr', label: 'CTR', suffix: '%' },
        { key: 'avgPosition', label: 'Avg position' },
        { key: 'indexedPages', label: 'Indexed pages' },
        { key: 'nonIndexedPages', label: 'Non-indexed pages' },
      ],
    },
    {
      label: 'Google Business Profile',
      description: 'Only for clients with local presence',
      fields: [
        { key: 'gbpSearches', label: 'Searches' },
        { key: 'gbpCalls', label: 'Calls' },
        { key: 'gbpDirections', label: 'Directions' },
        { key: 'gbpWebsiteClicks', label: 'Website clicks' },
        { key: 'gbpReviews', label: 'New reviews' },
      ],
    },
  ];

  ngOnInit() {
    this.clientsSvc.list().subscribe((cs) => this.clients.set(cs));
    this.cyclesSvc.list().subscribe((cs) => this.cycles.set(cs));
    const cid = this.route.snapshot.queryParamMap.get('clientId');
    if (cid) this.clientId.set(cid);
    this.cyclesSvc.current().subscribe({
      next: (c) => { if (c._id) this.cycleId.set(c._id); this.tryLoad(); },
      error: () => null,
    });
  }

  ready(): boolean {
    return !!(this.clientId() && this.cycleId());
  }

  onClientChange(v: string) { this.clientId.set(v); this.tryLoad(); }
  onCycleChange(v: string) { this.cycleId.set(v); this.tryLoad(); }

  tryLoad() {
    if (!this.ready()) return;
    this.loadingReport.set(true);
    this.saveMessage.set(null);
    this.pdfError.set(null);
    this.reportsSvc.byCycle(this.clientId(), this.cycleId()).subscribe({
      next: (r) => {
        this.report.set(r);
        this.populate(r);
        this.loadingReport.set(false);
      },
      error: () => this.loadingReport.set(false),
    });
    // Load tasks for this cycle (preview for sections 03 & 04)
    this.tasksSvc
      .list({ clientId: this.clientId(), cycleId: this.cycleId() })
      .subscribe((tasks) => this.cycleTasks.set(tasks));
  }

  populate(r: Report | null) {
    // Backwards compat: handle legacy array data
    const raw = r?.executiveSummary as unknown;
    if (Array.isArray(raw)) this.summaryText = raw.join(' ');
    else this.summaryText = (raw as string) || '';
    this.findings = r?.findings || '';
    this.nextPeriodPlan = r?.nextPeriodPlan || '';
    this.clientBlockers = r?.clientBlockers || '';
    this.finalConsiderations = r?.finalConsiderations || '';
    this.includeServiceAreas = !!r?.includeServiceAreas;
    // Default true for legacy reports without the field set.
    this.comparePeriods = r?.comparePeriods !== false;
    this.locationsSort = (r?.locationsSort as LocationsSortKey) || 'clicks';
    this.kpis = { ...(r?.kpis || {}) };
    this.coverImageUrl.set(r?.coverImageUrl || '');
    this.shareToken.set(r?.shareToken || null);
    this.sharePin.set(null);
    this.pinCopied.set(false);
    this.copied.set(false);
  }

  async share() {
    if (!this.ready()) return;
    this.sharing.set(true);
    const ok = await this.ensureReportSaved();
    if (!ok) {
      this.sharing.set(false);
      this.pdfError.set('Could not save the report before sharing.');
      return;
    }
    this.reportsSvc.share(this.clientId(), this.cycleId()).subscribe({
      next: (res) => {
        this.shareToken.set(res.shareToken);
        if (res.pin) {
          // Newly generated PIN — show ONCE.
          this.sharePin.set(res.pin);
          this.pinCopied.set(false);
        }
        this.sharing.set(false);
      },
      error: (err) => {
        this.sharing.set(false);
        this.pdfError.set(err?.error?.message || 'Error generating the link');
      },
    });
  }

  copyShareUrl(input: HTMLInputElement) {
    input.select();
    const url = this.shareUrl();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    } else {
      document.execCommand('copy');
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }

  revokeShare() {
    if (!confirm('Are you sure? The current link will stop working.')) return;
    this.reportsSvc.revokeShare(this.clientId(), this.cycleId()).subscribe(() => {
      this.shareToken.set(null);
      this.sharePin.set(null);
    });
  }

  copyPin(pin: string) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(pin).then(() => {
        this.pinCopied.set(true);
        setTimeout(() => this.pinCopied.set(false), 2000);
      });
    }
  }

  dismissPin() {
    this.sharePin.set(null);
    this.pinCopied.set(false);
  }

  resetPin() {
    if (!confirm('Generate a new PIN? The previous PIN will stop working immediately.')) return;
    this.resettingPin.set(true);
    this.reportsSvc.resetSharePin(this.clientId(), this.cycleId()).subscribe({
      next: (res) => {
        this.sharePin.set(res.pin);
        this.pinCopied.set(false);
        this.resettingPin.set(false);
      },
      error: () => this.resettingPin.set(false),
    });
  }

  openSendModal() {
    const client = this.selectedClient();
    this.contactSelection = {};
    if (client?.contacts) {
      for (const c of client.contacts) {
        if (c.email) this.contactSelection[c.email] = true;
      }
    }
    this.customRecipients = '';
    this.sendError.set(null);
    this.sendSuccess.set(null);
    this.showSendModal.set(true);
  }

  closeSendModal() {
    if (this.sending()) return;
    this.showSendModal.set(false);
  }

  toggleContact(email: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.contactSelection = { ...this.contactSelection, [email]: checked };
  }

  private resolveRecipients(): string[] {
    const selected = Object.entries(this.contactSelection)
      .filter(([, on]) => on)
      .map(([email]) => email);
    const custom = this.customRecipients
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set([...selected, ...custom]));
  }

  resolvedRecipientCount(): number {
    return this.resolveRecipients().length;
  }

  sendNotification() {
    const recipients = this.resolveRecipients();
    if (!recipients.length) return;
    this.sending.set(true);
    this.sendError.set(null);
    this.sendSuccess.set(null);
    this.reportsSvc
      .sendNotification(this.clientId(), this.cycleId(), recipients)
      .subscribe({
        next: (res) => {
          this.sending.set(false);
          // Clear any previously-shown PIN — it's been replaced; the new PIN
          // is only in the email now.
          this.sharePin.set(null);
          this.sendSuccess.set(
            `Sent to ${res.sentTo.length} recipient(s). New PIN delivered in the email.`,
          );
          setTimeout(() => {
            this.showSendModal.set(false);
            this.sendSuccess.set(null);
          }, 2200);
        },
        error: (err) => {
          this.sending.set(false);
          this.sendError.set(
            err?.error?.message || 'Could not send the email. Check SMTP config.',
          );
        },
      });
  }

  async onCoverPick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.acceptCoverFile(file);
  }

  removeCoverImage() {
    this.coverImageUrl.set('');
    this.coverError.set(null);
    if (this.ready()) {
      this.reportsSvc
        .upsert({
          clientId: this.clientId(),
          cycleId: this.cycleId(),
          coverImageUrl: '',
          executiveSummary: this.summaryText.trim(),
          findings: this.findings,
          nextPeriodPlan: this.nextPeriodPlan,
          clientBlockers: this.clientBlockers,
          finalConsiderations: this.finalConsiderations,
          includeServiceAreas: this.includeServiceAreas,
          comparePeriods: this.comparePeriods,
          locationsSort: this.locationsSort,
          kpis: this.cleanKpis(),
        })
        .subscribe({
          next: (r) => this.report.set(r),
          error: () => null,
        });
    }
  }

  // --- Paste / drag-drop for cover image ----------------------------------

  @HostListener('window:paste', ['$event'])
  async onWindowPaste(ev: ClipboardEvent) {
    // Only catch clipboard pastes when the report editor is the active
    // surface and the user is NOT currently typing in an input/contenteditable.
    if (this.coverImageUrl()) return;
    if (this.uploadingCover()) return;
    const target = ev.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target.isContentEditable) {
        return;
      }
    }
    const items = ev.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          ev.preventDefault();
          await this.acceptCoverFile(this.renameClipboardFile(file));
          return;
        }
      }
    }
  }

  async pasteCoverFromClipboard() {
    this.coverError.set(null);
    if (this.readingCoverClipboard()) return;
    if (!('clipboard' in navigator) || !navigator.clipboard.read) {
      this.coverError.set(
        `Your browser does not expose clipboard images. Press ${this.coverPasteHint} instead.`,
      );
      return;
    }
    this.readingCoverClipboard.set(true);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (!imgType) continue;
        const blob = await item.getType(imgType);
        const file = new File([blob], this.suggestedClipboardName(imgType), {
          type: imgType,
        });
        await this.acceptCoverFile(file);
        this.readingCoverClipboard.set(false);
        return;
      }
      this.coverError.set('No image found in the clipboard. Copy a screenshot first.');
    } catch (err) {
      const msg = (err as Error).message || '';
      if (/denied|permission/i.test(msg)) {
        this.coverError.set(
          `Clipboard access was denied. Press ${this.coverPasteHint} to paste instead.`,
        );
      } else {
        this.coverError.set(
          `Could not read clipboard. Press ${this.coverPasteHint} to paste instead.`,
        );
      }
    } finally {
      this.readingCoverClipboard.set(false);
    }
  }

  onCoverDragEnter(ev: DragEvent) {
    ev.preventDefault();
    if (this.hasImageInTransfer(ev.dataTransfer)) this.coverDropActive.set(true);
  }

  onCoverDragOver(ev: DragEvent) {
    ev.preventDefault();
    if (this.hasImageInTransfer(ev.dataTransfer)) this.coverDropActive.set(true);
  }

  onCoverDragLeave(ev: DragEvent) {
    ev.preventDefault();
    this.coverDropActive.set(false);
  }

  async onCoverDrop(ev: DragEvent) {
    ev.preventDefault();
    this.coverDropActive.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file) await this.acceptCoverFile(file);
  }

  private hasImageInTransfer(dt: DataTransfer | null): boolean {
    if (!dt) return false;
    return Array.from(dt.items || []).some(
      (i) => i.kind === 'file' && i.type.startsWith('image/'),
    );
  }

  private async acceptCoverFile(file: File) {
    this.coverError.set(null);
    if (!file.type.startsWith('image/')) {
      this.coverError.set('That file is not an image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.coverError.set('Image is over 10 MB. Compress it and try again.');
      return;
    }
    this.uploadingCover.set(true);
    this.coverUploadProgress.set(0);
    try {
      const res = await this.cloudinary.upload(file, (p) =>
        this.coverUploadProgress.set(p),
      );
      this.coverImageUrl.set(res.url);
      this.coverUploadProgress.set(null);
      this.uploadingCover.set(false);
      if (this.ready()) {
        this.reportsSvc
          .upsert({
            clientId: this.clientId(),
            cycleId: this.cycleId(),
            coverImageUrl: this.coverImageUrl(),
            executiveSummary: this.summaryText.trim(),
            findings: this.findings,
            nextPeriodPlan: this.nextPeriodPlan,
            clientBlockers: this.clientBlockers,
            finalConsiderations: this.finalConsiderations,
          includeServiceAreas: this.includeServiceAreas,
          comparePeriods: this.comparePeriods,
          locationsSort: this.locationsSort,
            kpis: this.cleanKpis(),
          })
          .subscribe({
            next: (r) => this.report.set(r),
            error: () => null,
          });
      }
    } catch (err) {
      this.uploadingCover.set(false);
      this.coverUploadProgress.set(null);
      this.coverError.set((err as Error).message);
    }
  }

  private renameClipboardFile(file: File): File {
    if (file.name && file.name !== 'image.png') return file;
    return new File([file], this.suggestedClipboardName(file.type), {
      type: file.type,
    });
  }

  private suggestedClipboardName(mime: string): string {
    const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `cover-${stamp}.${ext}`;
  }

  private detectPasteHint(): string {
    if (typeof navigator === 'undefined') return 'Ctrl+V';
    const platform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /Mac|iPhone|iPad/i.test(platform + ua) ? '⌘V' : 'Ctrl+V';
  }

  private cleanKpis(): Report['kpis'] {
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.kpis)) {
      if (typeof v === 'number' && !Number.isNaN(v)) cleaned[k] = v;
    }
    return cleaned as Report['kpis'];
  }

  setPullRangePreset(preset: 'cycle' | 'last7' | 'last28' | 'lastCycle' | 'custom') {
    this.pullRangePreset.set(preset);
    if (preset === 'custom') {
      // Seed custom inputs with whatever was last used (default to cycle).
      if (!this.pullFromDate() || !this.pullToDate()) {
        const range = this.resolvePullRange('cycle');
        if (range) {
          this.pullFromDate.set(range.from);
          this.pullToDate.set(range.to);
        }
      }
    }
  }

  private resolvePullRange(
    preset: 'cycle' | 'last7' | 'last28' | 'lastCycle' | 'custom',
  ): { from: string; to: string } | null {
    if (preset === 'custom') {
      if (!this.pullFromDate() || !this.pullToDate()) return null;
      return { from: this.pullFromDate(), to: this.pullToDate() };
    }
    if (preset === 'last7' || preset === 'last28') {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (preset === 'last7' ? 7 : 28));
      return { from: this.formatIsoDate(start), to: this.formatIsoDate(end) };
    }
    const cycle = this.cycles().find((c) => c._id === this.cycleId());
    if (!cycle) return null;
    if (preset === 'cycle') {
      return {
        from: this.formatIsoDate(cycle.startDate),
        to: this.formatIsoDate(cycle.endDate),
      };
    }
    // lastCycle: previous cycle in chronological order
    if (preset === 'lastCycle') {
      const sorted = this.cycles()
        .slice()
        .sort(
          (a, b) =>
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
        );
      const idx = sorted.findIndex((c) => c._id === cycle._id);
      const prev = idx > 0 ? sorted[idx - 1] : null;
      if (!prev) return null;
      return {
        from: this.formatIsoDate(prev.startDate),
        to: this.formatIsoDate(prev.endDate),
      };
    }
    return null;
  }

  pullKpisFromGoogle() {
    const clientId = this.clientId();
    const cycleId = this.cycleId();
    if (!clientId || !cycleId) return;
    const range = this.resolvePullRange(this.pullRangePreset());
    if (!range) {
      this.pullResult.set({
        kpis: {},
        sources: {
          gsc: false,
          ga4: false,
          warnings: [
            this.pullRangePreset() === 'lastCycle'
              ? 'No previous cycle found.'
              : 'Please fill the From and To dates.',
          ],
        },
      });
      return;
    }
    if (range.from > range.to) {
      this.pullResult.set({
        kpis: {},
        sources: {
          gsc: false,
          ga4: false,
          warnings: ['From date must be on or before To date.'],
        },
      });
      return;
    }
    this.pullingKpis.set(true);
    this.pullResult.set(null);
    const days = this.daysBetween(range.from, range.to);
    this.pullRangeUsed.set({ from: range.from, to: range.to, days });
    this.pullHasRecentDates.set(this.isRecent(range.to));
    this.googleSvc.kpisForClient(clientId, range.from, range.to).subscribe({
      next: (r) => {
        this.pullingKpis.set(false);
        this.pullResult.set(r);
        for (const [key, value] of Object.entries(r.kpis)) {
          if (typeof value === 'number' && !Number.isNaN(value)) {
            this.kpis[key] = value;
          }
        }
      },
      error: (err) => {
        this.pullingKpis.set(false);
        const msg = err?.error?.message || 'Could not pull KPIs from Google.';
        this.pullResult.set({
          kpis: {},
          sources: { gsc: false, ga4: false, warnings: [msg] },
        });
      },
    });
  }

  private formatIsoDate(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  private daysBetween(from: string, to: string): number {
    const a = new Date(`${from}T00:00:00Z`).getTime();
    const b = new Date(`${to}T00:00:00Z`).getTime();
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
  }

  private isRecent(iso: string): boolean {
    const target = new Date(`${iso}T00:00:00Z`).getTime();
    const twoDaysAgo = Date.now() - 2 * 86_400_000;
    return target >= twoDaysAgo;
  }

  save() {
    if (!this.ready()) return;
    this.saving.set(true);
    this.saveMessage.set(null);
    this.pdfError.set(null);
    this.reportsSvc
      .upsert({
        clientId: this.clientId(),
        cycleId: this.cycleId(),
        coverImageUrl: this.coverImageUrl() || undefined,
        executiveSummary: this.summaryText.trim(),
        findings: this.findings,
        nextPeriodPlan: this.nextPeriodPlan,
        clientBlockers: this.clientBlockers,
        finalConsiderations: this.finalConsiderations,
          includeServiceAreas: this.includeServiceAreas,
          comparePeriods: this.comparePeriods,
          locationsSort: this.locationsSort,
        kpis: this.cleanKpis(),
      })
      .subscribe({
        next: (r) => {
          this.report.set(r);
          this.populate(r);
          this.saving.set(false);
          const kpiCount = Object.keys(r.kpis || {}).length;
          this.saveMessage.set(
            `Report saved · ${kpiCount} KPI${kpiCount === 1 ? '' : 's'} recorded`,
          );
          setTimeout(() => this.saveMessage.set(null), 4000);
        },
        error: (err) => {
          this.saving.set(false);
          this.pdfError.set(err?.error?.message || 'Error saving the report');
        },
      });
  }

  autoCompose() {
    if (!this.ready()) return;
    this.reportsSvc.autoCompose(this.clientId(), this.cycleId()).subscribe((r) => {
      this.report.set(r);
      this.populate(r);
    });
  }

  async ensureReportSaved(): Promise<boolean> {
    if (this.report()) return true;
    return new Promise((resolve) => {
      this.reportsSvc
        .upsert({
          clientId: this.clientId(),
          cycleId: this.cycleId(),
          coverImageUrl: this.coverImageUrl() || undefined,
          executiveSummary: this.summaryText.trim(),
          findings: this.findings,
          nextPeriodPlan: this.nextPeriodPlan,
          clientBlockers: this.clientBlockers,
          comparePeriods: this.comparePeriods,
          locationsSort: this.locationsSort,
          kpis: this.cleanKpis(),
        })
        .subscribe({
          next: (r) => {
            this.report.set(r);
            resolve(true);
          },
          error: () => resolve(false),
        });
    });
  }

  async viewPdf() {
    if (!this.ready()) return;
    this.pdfError.set(null);
    const popup = window.open('about:blank', '_blank');
    this.downloading.set(true);

    const saved = await this.ensureReportSaved();
    if (!saved) {
      this.downloading.set(false);
      this.pdfError.set('Could not save the report before generating the PDF.');
      if (popup) popup.close();
      return;
    }

    this.reportsSvc.pdfBlob(this.clientId(), this.cycleId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (popup) popup.location.href = url;
        else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.downloading.set(false);
      },
      error: (err) => {
        this.downloading.set(false);
        if (popup) popup.close();
        this.pdfError.set(err?.error?.message || 'Error generating the PDF');
      },
    });
  }

  async downloadPdf() {
    if (!this.ready()) return;
    this.pdfError.set(null);
    this.downloading.set(true);

    const saved = await this.ensureReportSaved();
    if (!saved) {
      this.downloading.set(false);
      this.pdfError.set('Could not save the report before downloading.');
      return;
    }

    this.reportsSvc.pdfBlob(this.clientId(), this.cycleId()).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const clientName = this.clients().find((c) => c._id === this.clientId())?.name || 'report';
        const cycleLabel = this.cycles().find((c) => c._id === this.cycleId())?.label || '';
        a.download = `${clientName}-${cycleLabel}.pdf`.replace(/\s+/g, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        this.downloading.set(false);
      },
      error: (err) => {
        this.downloading.set(false);
        this.pdfError.set(err?.error?.message || 'Error downloading the PDF');
      },
    });
  }
}
