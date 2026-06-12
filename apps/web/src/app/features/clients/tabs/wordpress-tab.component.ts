import { CommonModule, DecimalPipe } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Client,
  Task,
  TaskStatus,
  WordpressApplyResultRow,
  WordpressConnectionInfo,
  WordpressPostType,
  WordpressResourceItem,
  WordpressSeoPlugin,
  WordpressSeoPreviewRow,
} from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { TasksService } from '../../../core/tasks.service';
import { WordpressService } from '../../../core/wordpress.service';

type HealthKey = 'good' | 'partial' | 'empty';
type CharHealth = 'good' | 'warn' | 'neutral';

interface TrackContext {
  item: WordpressResourceItem;
  pageUrl: string;
  subtaskTitle: string;
}

@Component({
  selector: 'app-client-wordpress-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="space-y-4">
      <!-- Header / connection -->
      <div class="card">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-ink-900">📝 WordPress</h2>
            <p class="text-xs text-ink-500 mt-0.5 max-w-2xl">
              Read &amp; update meta tags on pages, posts, and custom post
              types via the WordPress REST API. Authentication uses
              Application Passwords (built in to WordPress 5.6+).
            </p>
          </div>
          <div class="flex items-center gap-2">
            @if (connStatus()?.connected) {
              <span class="px-2 py-1 rounded bg-positive-50 text-positive-500 text-[11px] font-semibold">
                ✓ Connected
              </span>
            } @else if (hasAnyCredentials()) {
              <span class="px-2 py-1 rounded bg-warning-50 text-warning-500 text-[11px] font-semibold">
                ⚠ Not connected
              </span>
            } @else {
              <span class="px-2 py-1 rounded bg-ink-100 text-ink-500 text-[11px] font-semibold">
                — Not configured
              </span>
            }
            <button class="btn-secondary text-xs" (click)="testConnection()"
                    [disabled]="testing() || !hasAnyCredentials()">
              {{ testing() ? 'Testing…' : '⚡ Test' }}
            </button>
            <button class="btn-secondary text-xs" (click)="toggleSettings()">
              {{ settingsOpen() ? 'Hide settings' : '⚙ Settings' }}
            </button>
          </div>
        </div>

        @if (settingsOpen()) {
          <div class="mt-4 border-t border-ink-100 pt-4 space-y-3">
            <div>
              <label class="label">Site URL</label>
              <input class="input"
                     [(ngModel)]="settingsForm.siteUrl"
                     placeholder="https://example.com" />
              <p class="text-[11px] text-ink-400 mt-1">
                The site's WordPress root. REST API must be reachable at
                <code class="bg-ink-100 px-1 rounded">{{ '{site}/wp-json' }}</code>.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="label">Username</label>
                <input class="input"
                       autocomplete="off"
                       [(ngModel)]="settingsForm.username"
                       placeholder="admin" />
                <p class="text-[11px] text-ink-400 mt-1">
                  A WP user with Editor+ role on the target post types.
                </p>
              </div>
              <div>
                <label class="label">Application Password</label>
                <input class="input font-mono text-xs"
                       type="password"
                       autocomplete="off"
                       [(ngModel)]="settingsForm.appPassword"
                       placeholder="AbCd EfGh IjKl MnOp QrSt UvWx" />
                <p class="text-[11px] text-ink-400 mt-1">
                  Generated in <em>WP Admin → Users → Profile → Application
                  Passwords</em>. Spaces are OK.
                </p>
              </div>
            </div>

            <div>
              <label class="label">SEO plugin</label>
              <select class="input" [(ngModel)]="settingsForm.seoPlugin">
                <option value="yoast">Yoast SEO</option>
                <option value="rankmath">Rank Math</option>
                <option value="aioseo">All-in-One SEO (AIOSEO)</option>
                <option value="native">None (WP native — read only)</option>
              </select>
              <p class="text-[11px] text-ink-400 mt-1">
                Tells the platform where to read &amp; write the SEO title and
                meta description. The plugin must register its meta in REST
                (Yoast/RankMath/AIOSEO recent versions all do this).
              </p>
            </div>

            @if (settingsError()) {
              <div class="text-xs text-danger-500">{{ settingsError() }}</div>
            }
            @if (rawTestResult(); as r) {
              @if (r.connected) {
                <div class="text-xs text-positive-500">
                  ✓ Connection test passed
                  @if (r.siteName) { — <strong>{{ r.siteName }}</strong> }
                  @if (r.user) { · user <strong>{{ r.user }}</strong> }
                  @if (r.seoPlugin) { · plugin <strong>{{ r.seoPlugin }}</strong> }
                </div>
              } @else {
                <div class="text-xs text-danger-500">✗ {{ r.error }}</div>
              }
            }
            <div class="flex justify-end gap-2">
              <button class="btn-secondary text-xs" (click)="testRaw()"
                      [disabled]="testingRaw() || !canTestRaw()">
                {{ testingRaw() ? 'Testing…' : 'Test before saving' }}
              </button>
              <button class="btn-primary text-xs" (click)="saveSettings()"
                      [disabled]="savingSettings()">
                {{ savingSettings() ? 'Saving…' : 'Save credentials' }}
              </button>
            </div>
          </div>
        }

        @if (connStatus(); as cs) {
          @if (cs.connected) {
            <div class="mt-3 text-xs text-ink-500">
              Connected to <strong>{{ cs.siteName || cs.siteUrl }}</strong>
              @if (cs.user) { · user <code>{{ cs.user }}</code> }
              @if (cs.seoPlugin) { · plugin <code>{{ cs.seoPlugin }}</code> }
            </div>
          } @else if (cs.error) {
            <div class="mt-3 text-xs text-danger-500">⚠ {{ cs.error }}</div>
          }
        }
      </div>

      @if (!hasAnyCredentials() || !connStatus()?.connected) {
        <div class="card text-center py-10 text-ink-400 italic text-sm">
          Configure and test the WordPress credentials above to enable
          browsing and bulk SEO updates.
        </div>
      } @else {
        <div class="card">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3 mb-3">
            <div class="flex flex-wrap items-center gap-1">
              @if (loadingTypes()) {
                <span class="text-xs text-ink-400 italic">Loading post types…</span>
              } @else {
                @for (t of postTypes(); track t.slug) {
                  <button
                    class="px-3 py-1.5 text-xs font-semibold rounded transition"
                    [class.bg-brand-500]="activePostType() === t.slug"
                    [class.text-white]="activePostType() === t.slug"
                    [class.bg-ink-100]="activePostType() !== t.slug"
                    [class.text-ink-700]="activePostType() !== t.slug"
                    (click)="selectPostType(t.slug)">
                    {{ typeLabel(t) }}
                  </button>
                }
              }
            </div>
            <div class="flex items-center gap-2">
              <input class="input input-sm w-44 text-xs"
                     placeholder="Search…"
                     [(ngModel)]="searchTerm"
                     (keyup.enter)="reload()" />
              <button class="btn-secondary text-xs" (click)="reload()"
                      [disabled]="loadingList() || !activePostType()">
                {{ loadingList() ? 'Loading…' : '⚡ Refresh' }}
              </button>
              <button class="btn-primary text-xs" (click)="openCsv()"
                      [disabled]="!activePostType() || pluginIsNative()">
                📤 Upload CSV
              </button>
            </div>
          </div>

          @if (pluginIsNative()) {
            <div class="mb-3 p-3 rounded bg-warning-50 border border-warning-500/40 text-[11px] text-ink-700">
              SEO plugin is set to <strong>None (native WP)</strong> — you
              can browse posts but meta tag editing is disabled. Install
              Yoast, RankMath, or AIOSEO and update the plugin selector.
            </div>
          }

          <!-- Health filter chips -->
          @if (items().length > 0 && !pluginIsNative()) {
            <div class="flex flex-wrap items-center gap-1 mb-3">
              <span class="text-[10px] uppercase tracking-wider text-ink-500 font-bold mr-1">
                Filter:
              </span>
              @for (f of healthFilters; track f.key) {
                <button
                  type="button"
                  class="px-2 py-1 text-[11px] font-semibold rounded transition border"
                  [class.bg-brand-50]="activeHealth().has(f.key)"
                  [class.text-brand-500]="activeHealth().has(f.key)"
                  [class.border-brand-500]="activeHealth().has(f.key)"
                  [class.bg-white]="!activeHealth().has(f.key)"
                  [class.text-ink-500]="!activeHealth().has(f.key)"
                  [class.border-ink-200]="!activeHealth().has(f.key)"
                  (click)="toggleHealth(f.key)">
                  {{ f.label }}
                  <span class="ml-1 opacity-70">({{ healthCount(f.key) }})</span>
                </button>
              }
              @if (activeHealth().size > 0) {
                <button class="text-[11px] text-ink-400 hover:text-ink-900 ml-1 underline"
                        (click)="activeHealth.set(emptySet)">
                  Clear
                </button>
              }
            </div>
          }

          @if (listError()) {
            <div class="mb-3 text-xs text-danger-500">{{ listError() }}</div>
          }

          @if (loadingList()) {
            <div class="text-center py-10 text-ink-400 italic text-sm">
              <div class="inline-block animate-spin mr-2">⏳</div>
              Loading {{ activePostType() }}s from WordPress…
            </div>
          } @else if (items().length === 0) {
            <div class="text-center py-10 text-ink-400 italic text-sm">
              No items found.
            </div>
          } @else if (filteredItems().length === 0) {
            <div class="text-center py-10 text-ink-400 italic text-sm">
              No items match the selected health filters.
            </div>
          } @else {
            <table class="w-full text-sm">
              <thead class="border-b border-ink-100">
                <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500">
                  <th class="py-2 pr-2 font-bold">Title / slug</th>
                  <th class="py-2 px-2 font-bold">SEO title</th>
                  <th class="py-2 px-2 font-bold">SEO description</th>
                  <th class="py-2 px-2 font-bold">Health</th>
                  <th class="py-2 pl-2 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (item of filteredItems(); track item.id) {
                  <tr class="border-b border-ink-100 last:border-0 hover:bg-ink-50/40">
                    <td class="py-2 pr-2 align-top">
                      <div class="text-ink-900 font-medium truncate max-w-[260px]"
                           [title]="item.title">{{ item.title }}</div>
                      <div class="font-mono text-[11px] text-ink-400 truncate max-w-[260px]"
                           [title]="item.slug">{{ item.slug }}</div>
                    </td>
                    <td class="py-2 px-2 align-top">
                      @if (item.seoTitle) {
                        <span class="text-xs text-ink-700"
                              [title]="item.seoTitle">{{ truncate(item.seoTitle, 60) }}</span>
                        <span class="block text-[10px] text-ink-400 mt-0.5">
                          {{ item.seoTitle.length }} chars
                        </span>
                      } @else {
                        <span class="text-[11px] text-warning-500 italic">— missing</span>
                      }
                    </td>
                    <td class="py-2 px-2 align-top">
                      @if (item.seoDescription) {
                        <span class="text-xs text-ink-700"
                              [title]="item.seoDescription">{{ truncate(item.seoDescription, 90) }}</span>
                        <span class="block text-[10px] text-ink-400 mt-0.5">
                          {{ item.seoDescription.length }} chars
                        </span>
                      } @else {
                        <span class="text-[11px] text-warning-500 italic">— missing</span>
                      }
                    </td>
                    <td class="py-2 px-2 align-top">
                      <span [class]="healthBadgeClass(item)">
                        {{ healthBadge(item) }}
                      </span>
                    </td>
                    <td class="py-2 pl-2 align-top text-right whitespace-nowrap">
                      @if (viewUrl(item); as href) {
                        <a class="btn-secondary text-[11px] !py-1 !px-2 mr-1 inline-block"
                           [href]="href" target="_blank" rel="noopener">
                          👁 View
                        </a>
                      }
                      <button class="btn-secondary text-[11px] !py-1 !px-2 mr-1"
                              (click)="openRichResults(item)">
                        🔍 Test
                      </button>
                      <button class="btn-secondary text-[11px] !py-1 !px-2"
                              [disabled]="pluginIsNative()"
                              (click)="openEdit(item)">
                        ✎ Edit
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="flex items-center justify-between mt-3 text-[11px] text-ink-500">
              <span>
                {{ filteredItems().length }} shown
                @if (activeHealth().size > 0) { · of {{ items().length }} loaded }
                @if (activeHealth().size === 0) { · {{ items().length }} loaded }
                @if (totalPages() > 1) { · page {{ currentPage() }} / {{ totalPages() }} }
              </span>
              @if (currentPage() < totalPages()) {
                <button class="btn-secondary text-xs" (click)="loadMore()"
                        [disabled]="loadingList()">
                  Load more →
                </button>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Bulk CSV modal -->
    @if (csvOpen()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="closeCsv()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-5xl p-6 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="text-lg font-bold text-ink-900">
                Bulk SEO update — {{ activePostType() }}
              </h2>
              <p class="text-xs text-ink-500 mt-0.5">
                CSV with header row: <code class="bg-ink-100 px-1 rounded">slug, seo_title, seo_description</code>.
              </p>
            </div>
            <button type="button" (click)="closeCsv()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          @if (csvStep() === 'upload') {
            <div class="space-y-3">
              <div class="border-2 border-dashed border-ink-200 rounded-lg p-6 text-center">
                <input type="file" accept=".csv,text/csv"
                       (change)="onCsvFile($event)" class="hidden" #fileInput />
                <p class="text-sm text-ink-700 mb-2">
                  Drop a CSV file or paste the contents below.
                </p>
                <button class="btn-secondary text-xs" (click)="fileInput.click()">
                  Choose file
                </button>
                @if (csvFileName()) {
                  <div class="text-[11px] text-ink-500 mt-2">
                    Loaded: <strong>{{ csvFileName() }}</strong>
                    ({{ csvText().length | number }} chars)
                  </div>
                }
              </div>
              <div>
                <label class="label">Or paste CSV here</label>
                <textarea class="input font-mono text-xs h-40"
                          [(ngModel)]="csvText"
                          placeholder="slug,seo_title,seo_description&#10;my-page,New SEO title,New SEO description"></textarea>
              </div>
              @if (csvError()) {
                <div class="text-xs text-danger-500">{{ csvError() }}</div>
              }
              <div class="flex justify-end gap-2 pt-2 border-t border-ink-100">
                <button class="btn-secondary" (click)="closeCsv()">Cancel</button>
                <button class="btn-primary" (click)="runPreview()"
                        [disabled]="previewing() || !csvText().trim()">
                  {{ previewing() ? 'Previewing…' : 'Preview changes →' }}
                </button>
              </div>
            </div>
          }

          @if (csvStep() === 'preview') {
            <div class="space-y-3">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">Total rows</div>
                  <div class="text-xl font-black text-ink-900">{{ preview().length }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">Matched</div>
                  <div class="text-xl font-black text-positive-500">{{ matchedCount() }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">Not found</div>
                  <div class="text-xl font-black text-danger-500">{{ notFoundCount() }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">Will change</div>
                  <div class="text-xl font-black text-ink-900">{{ willChangeCount() }}</div>
                </div>
              </div>

              <label class="inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
                <input type="checkbox" [(ngModel)]="onlyChanged"
                       class="rounded border-ink-300 text-brand-500 focus:ring-brand-500" />
                <span class="text-xs">Hide rows with no changes</span>
              </label>

              <div class="border border-ink-200 rounded overflow-hidden max-h-[50vh] overflow-y-auto">
                <table class="w-full text-xs">
                  <thead class="bg-ink-50 sticky top-0">
                    <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500">
                      <th class="py-1.5 px-2">
                        <input type="checkbox"
                               [checked]="allSelected()"
                               (change)="toggleAll($event)"
                               class="rounded border-ink-300 text-brand-500 focus:ring-brand-500" />
                      </th>
                      <th class="py-1.5 px-2 font-bold">Slug</th>
                      <th class="py-1.5 px-2 font-bold">Current → New title</th>
                      <th class="py-1.5 px-2 font-bold">Current → New description</th>
                      <th class="py-1.5 px-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of filteredPreview(); track row.slug) {
                      <tr class="border-t border-ink-100"
                          [class.bg-danger-50]="!row.matched">
                        <td class="py-1.5 px-2 align-top">
                          <input type="checkbox"
                                 [disabled]="!row.matched || (!row.titleChanged && !row.descriptionChanged)"
                                 [checked]="selected().has(row.slug)"
                                 (change)="toggleRow(row.slug, $event)"
                                 class="rounded border-ink-300 text-brand-500 focus:ring-brand-500" />
                        </td>
                        <td class="py-1.5 px-2 font-mono text-[11px] text-ink-700 align-top">
                          {{ row.slug }}
                          @if (row.title) {
                            <div class="text-ink-400 text-[10px] mt-0.5" [title]="row.title">
                              {{ truncate(row.title, 30) }}
                            </div>
                          }
                        </td>
                        <td class="py-1.5 px-2 align-top">
                          @if (row.titleChanged) {
                            <div class="text-ink-400 line-through" [title]="row.currentSeoTitle || ''">
                              {{ truncate(row.currentSeoTitle || '—', 40) }}
                            </div>
                            <div class="text-positive-500 font-medium mt-0.5" [title]="row.newSeoTitle || ''">
                              {{ truncate(row.newSeoTitle || '', 40) }}
                            </div>
                          } @else if (row.newSeoTitle === undefined) {
                            <span class="text-ink-400 italic">— (no change)</span>
                          } @else {
                            <span class="text-ink-400">{{ truncate(row.currentSeoTitle || '—', 40) }}</span>
                          }
                        </td>
                        <td class="py-1.5 px-2 align-top">
                          @if (row.descriptionChanged) {
                            <div class="text-ink-400 line-through" [title]="row.currentSeoDescription || ''">
                              {{ truncate(row.currentSeoDescription || '—', 60) }}
                            </div>
                            <div class="text-positive-500 font-medium mt-0.5" [title]="row.newSeoDescription || ''">
                              {{ truncate(row.newSeoDescription || '', 60) }}
                            </div>
                          } @else if (row.newSeoDescription === undefined) {
                            <span class="text-ink-400 italic">— (no change)</span>
                          } @else {
                            <span class="text-ink-400">{{ truncate(row.currentSeoDescription || '—', 60) }}</span>
                          }
                        </td>
                        <td class="py-1.5 px-2 align-top">
                          @if (row.error) {
                            <span class="text-[11px] text-danger-500">⚠ {{ row.error }}</span>
                          } @else if (!row.matched) {
                            <span class="text-[11px] text-danger-500">not found</span>
                          } @else if (!row.titleChanged && !row.descriptionChanged) {
                            <span class="text-[11px] text-ink-400">no change</span>
                          } @else {
                            <span class="text-[11px] text-positive-500 font-semibold">will update</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="flex justify-between items-center pt-2 border-t border-ink-100">
                <button class="btn-secondary text-xs" (click)="csvStep.set('upload')">← Back</button>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-ink-500">{{ selected().size }} selected</span>
                  <button class="btn-primary"
                          (click)="runApply()"
                          [disabled]="applying() || selected().size === 0">
                    {{ applying() ? 'Applying…' : 'Apply ' + selected().size + ' change(s) →' }}
                  </button>
                </div>
              </div>
            </div>
          }

          @if (csvStep() === 'results') {
            <div class="space-y-3">
              <div class="grid grid-cols-3 gap-3">
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">Total</div>
                  <div class="text-xl font-black text-ink-900">{{ results().length }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">Success</div>
                  <div class="text-xl font-black text-positive-500">{{ successCount() }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">Failed</div>
                  <div class="text-xl font-black text-danger-500">{{ failedCount() }}</div>
                </div>
              </div>
              <div class="border border-ink-200 rounded overflow-hidden max-h-[50vh] overflow-y-auto">
                <table class="w-full text-xs">
                  <thead class="bg-ink-50 sticky top-0">
                    <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500">
                      <th class="py-1.5 px-2 font-bold">Slug</th>
                      <th class="py-1.5 px-2 font-bold">Result</th>
                      <th class="py-1.5 px-2 font-bold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of results(); track r.slug) {
                      <tr class="border-t border-ink-100" [class.bg-danger-50]="!r.success">
                        <td class="py-1.5 px-2 font-mono text-[11px]">{{ r.slug }}</td>
                        <td class="py-1.5 px-2">
                          @if (r.success) {
                            <span class="text-positive-500 font-semibold">✓ updated</span>
                          } @else {
                            <span class="text-danger-500 font-semibold">✗ failed</span>
                          }
                        </td>
                        <td class="py-1.5 px-2 text-ink-500">{{ r.error || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="flex justify-end gap-2 pt-2 border-t border-ink-100">
                <button class="btn-secondary" (click)="restartCsv()">Run another batch</button>
                <button class="btn-primary" (click)="closeCsv(); reload()">Done</button>
              </div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Inline edit modal -->
    @if (editOpen(); as item) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="closeEdit()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-4">
            <div>
              <h2 class="text-lg font-bold text-ink-900">
                Edit meta tags — {{ activePostType() }}
              </h2>
              <p class="text-xs text-ink-500 mt-0.5">{{ item.title }}</p>
              <p class="font-mono text-[11px] text-ink-400 mt-0.5">
                {{ item.slug }}
                @if (item.link) {
                  · <a [href]="item.link" target="_blank" rel="noopener"
                       class="text-brand-500 hover:underline">View live ↗</a>
                }
              </p>
            </div>
            <button type="button" (click)="closeEdit()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            <div>
              <div class="flex items-baseline justify-between">
                <label class="label">SEO title</label>
                <span class="text-[11px]"
                      [class.text-positive-500]="editTitleHealth() === 'good'"
                      [class.text-warning-500]="editTitleHealth() === 'warn'"
                      [class.text-ink-400]="editTitleHealth() === 'neutral'">
                  {{ editForm.seoTitle.length }} chars
                  @if (editTitleHealth() === 'warn') { · target 30–60 }
                </span>
              </div>
              <input class="input" [(ngModel)]="editForm.seoTitle"
                     placeholder="Page title shown in Google results" />
              @if (editOriginal()?.seoTitle) {
                <div class="text-[10px] text-ink-400 mt-1">
                  Current: <span class="line-through">{{ editOriginal()?.seoTitle }}</span>
                </div>
              }
            </div>

            <div>
              <div class="flex items-baseline justify-between">
                <label class="label">SEO description</label>
                <span class="text-[11px]"
                      [class.text-positive-500]="editDescHealth() === 'good'"
                      [class.text-warning-500]="editDescHealth() === 'warn'"
                      [class.text-ink-400]="editDescHealth() === 'neutral'">
                  {{ editForm.seoDescription.length }} chars
                  @if (editDescHealth() === 'warn') { · target 120–160 }
                </span>
              </div>
              <textarea class="input h-20"
                        [(ngModel)]="editForm.seoDescription"
                        placeholder="Snippet shown in Google results"></textarea>
              @if (editOriginal()?.seoDescription) {
                <div class="text-[10px] text-ink-400 mt-1">
                  Current: <span class="line-through">{{ editOriginal()?.seoDescription }}</span>
                </div>
              }
            </div>

            @if (editError()) {
              <div class="text-xs text-danger-500">{{ editError() }}</div>
            }

            <div class="bg-ink-50 border border-ink-200 rounded p-3 text-[11px] text-ink-600">
              💡 After saving, you'll be prompted to log this change as a
              subtask on one of this client's tasks.
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="closeEdit()">Cancel</button>
            <button class="btn-primary" (click)="saveEdit()"
                    [disabled]="savingEdit() || !editHasChanges()">
              {{ savingEdit() ? 'Saving…' : 'Save to WordPress →' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Track-in-task dialog -->
    @if (trackOpen(); as ctx) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-center justify-center p-4"
           (click)="dismissTrack()">
        <div class="bg-white rounded-xl shadow-xl w-full max-w-xl p-6"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between mb-3">
            <div>
              <h2 class="text-lg font-bold text-ink-900">✓ Saved to WordPress</h2>
              <p class="text-xs text-ink-500 mt-0.5">Track this change as a subtask?</p>
            </div>
            <button type="button" (click)="dismissTrack()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="bg-ink-50 border border-ink-200 rounded p-3 mb-4 text-xs">
            <div class="text-ink-500 text-[10px] uppercase tracking-wider font-bold mb-1">
              Subtask title
            </div>
            <div class="font-medium text-ink-900">{{ ctx.subtaskTitle }}</div>
          </div>

          <div>
            <label class="label">Add it to which task?</label>
            @if (loadingTasks()) {
              <div class="text-xs text-ink-400 italic py-2">Loading tasks…</div>
            } @else if (clientTasks().length === 0) {
              <div class="text-xs text-warning-500 py-2">
                No tasks exist for this client yet. Create a task from the Tasks tab first.
              </div>
            } @else {
              <select class="input" [(ngModel)]="selectedTaskId">
                <option [ngValue]="null" disabled>— Select a task —</option>
                @for (t of clientTasks(); track t._id) {
                  <option [ngValue]="t._id">
                    {{ statusEmoji(t.status) }} {{ t.title }}
                    @if (t.category) { · {{ t.category }} }
                  </option>
                }
              </select>
            }
          </div>

          @if (trackError()) {
            <div class="text-xs text-danger-500 mt-2">{{ trackError() }}</div>
          }
          @if (trackSaved()) {
            <div class="text-xs text-positive-500 mt-2">
              ✓ Subtask added — visible on the Tasks tab.
            </div>
          }

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="dismissTrack()">
              {{ trackSaved() ? 'Done' : 'Skip' }}
            </button>
            @if (!trackSaved()) {
              <button class="btn-primary"
                      (click)="confirmTrack()"
                      [disabled]="!selectedTaskId || trackingSave()">
                {{ trackingSave() ? 'Adding…' : 'Add as subtask' }}
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class ClientWordpressTab implements OnChanges {
  @Input({ required: true }) client!: Client;

  private wp = inject(WordpressService);
  private clients = inject(ClientsService);
  private tasksSvc = inject(TasksService);

  // Settings form
  settingsOpen = signal(false);
  settingsForm: {
    siteUrl: string;
    username: string;
    appPassword: string;
    seoPlugin: WordpressSeoPlugin;
  } = {
    siteUrl: '',
    username: '',
    appPassword: '',
    seoPlugin: 'yoast',
  };
  testing = signal(false);
  testingRaw = signal(false);
  savingSettings = signal(false);
  settingsError = signal<string | null>(null);
  rawTestResult = signal<WordpressConnectionInfo | null>(null);
  connStatus = signal<WordpressConnectionInfo | null>(null);

  // Post types + list
  postTypes = signal<WordpressPostType[]>([]);
  loadingTypes = signal(false);
  activePostType = signal<string>('');
  items = signal<WordpressResourceItem[]>([]);
  currentPage = signal(1);
  totalPages = signal(1);
  loadingList = signal(false);
  listError = signal<string | null>(null);
  searchTerm = '';

  // Health filters
  healthFilters: Array<{ key: HealthKey; label: string }> = [
    { key: 'good', label: '🟢 Good' },
    { key: 'partial', label: '🟡 Partial' },
    { key: 'empty', label: '🔴 Empty' },
  ];
  emptySet: Set<HealthKey> = new Set();
  activeHealth = signal<Set<HealthKey>>(new Set());

  // CSV bulk
  csvOpen = signal(false);
  csvStep = signal<'upload' | 'preview' | 'results'>('upload');
  csvFileName = signal<string | null>(null);
  csvText = signal('');
  csvError = signal<string | null>(null);
  previewing = signal(false);
  preview = signal<WordpressSeoPreviewRow[]>([]);
  selected = signal<Set<string>>(new Set());
  onlyChanged = true;
  applying = signal(false);
  results = signal<WordpressApplyResultRow[]>([]);

  // Inline edit
  editOpen = signal<WordpressResourceItem | null>(null);
  editOriginal = signal<WordpressResourceItem | null>(null);
  editForm: { seoTitle: string; seoDescription: string } = {
    seoTitle: '',
    seoDescription: '',
  };
  savingEdit = signal(false);
  editError = signal<string | null>(null);

  // Track-in-task
  trackOpen = signal<TrackContext | null>(null);
  clientTasks = signal<Task[]>([]);
  loadingTasks = signal(false);
  selectedTaskId: string | null = null;
  trackingSave = signal(false);
  trackError = signal<string | null>(null);
  trackSaved = signal(false);

  // Computed
  matchedCount = computed(() => this.preview().filter((r) => r.matched).length);
  notFoundCount = computed(
    () => this.preview().filter((r) => !r.matched).length,
  );
  willChangeCount = computed(
    () =>
      this.preview().filter(
        (r) => r.matched && (r.titleChanged || r.descriptionChanged),
      ).length,
  );
  filteredPreview = computed(() => {
    const p = this.preview();
    if (!this.onlyChanged) return p;
    return p.filter((r) => !r.matched || r.titleChanged || r.descriptionChanged);
  });
  allSelected = computed(() => {
    const eligible = this.preview().filter(
      (r) => r.matched && (r.titleChanged || r.descriptionChanged),
    );
    if (!eligible.length) return false;
    const sel = this.selected();
    return eligible.every((r) => sel.has(r.slug));
  });
  successCount = computed(() => this.results().filter((r) => r.success).length);
  failedCount = computed(() => this.results().filter((r) => !r.success).length);

  filteredItems = computed(() => {
    const filters = this.activeHealth();
    if (filters.size === 0) return this.items();
    return this.items().filter((i) => filters.has(this.healthKey(i)));
  });

  ngOnChanges() {
    this.settingsForm = {
      siteUrl: this.client.wordpressSiteUrl ?? '',
      username: this.client.wordpressUsername ?? '',
      appPassword: this.client.wordpressAppPassword ?? '',
      seoPlugin: (this.client.wordpressSeoPlugin as WordpressSeoPlugin) ?? 'yoast',
    };
    this.items.set([]);
    this.postTypes.set([]);
    this.activePostType.set('');
    this.connStatus.set(null);
    this.rawTestResult.set(null);
    if (this.hasAnyCredentials()) {
      this.testConnection();
    }
  }

  hasAnyCredentials(): boolean {
    return !!(
      this.client.wordpressSiteUrl &&
      this.client.wordpressUsername &&
      this.client.wordpressAppPassword
    );
  }

  canTestRaw(): boolean {
    return !!(
      this.settingsForm.siteUrl &&
      this.settingsForm.username &&
      this.settingsForm.appPassword
    );
  }

  pluginIsNative(): boolean {
    return (
      this.connStatus()?.seoPlugin === 'native' ||
      this.client.wordpressSeoPlugin === 'native'
    );
  }

  toggleSettings() {
    this.settingsOpen.update((v) => !v);
    this.settingsError.set(null);
    this.rawTestResult.set(null);
  }

  testConnection() {
    if (!this.client?._id) return;
    this.testing.set(true);
    this.wp.test(this.client._id).subscribe({
      next: (r) => {
        this.connStatus.set(r);
        this.testing.set(false);
        if (r.connected) this.loadPostTypes();
      },
      error: (err) => {
        this.testing.set(false);
        this.connStatus.set({
          connected: false,
          error: err?.error?.message || 'Connection failed',
        });
      },
    });
  }

  testRaw() {
    this.testingRaw.set(true);
    this.settingsError.set(null);
    this.wp
      .testRaw({
        siteUrl: this.settingsForm.siteUrl.trim(),
        username: this.settingsForm.username.trim(),
        appPassword: this.settingsForm.appPassword.trim(),
        seoPlugin: this.settingsForm.seoPlugin,
      })
      .subscribe({
        next: (r) => {
          this.rawTestResult.set(r);
          this.testingRaw.set(false);
        },
        error: (err) => {
          this.testingRaw.set(false);
          this.rawTestResult.set({
            connected: false,
            error: err?.error?.message || 'Connection failed',
          });
        },
      });
  }

  saveSettings() {
    if (!this.client?._id) return;
    this.savingSettings.set(true);
    this.settingsError.set(null);
    this.clients
      .update(this.client._id, {
        wordpressSiteUrl: this.settingsForm.siteUrl.trim() || undefined,
        wordpressUsername: this.settingsForm.username.trim() || undefined,
        wordpressAppPassword:
          this.settingsForm.appPassword.trim() || undefined,
        wordpressSeoPlugin: this.settingsForm.seoPlugin,
      })
      .subscribe({
        next: (c) => {
          this.client = c;
          this.savingSettings.set(false);
          this.settingsOpen.set(false);
          this.testConnection();
        },
        error: (err) => {
          this.savingSettings.set(false);
          const m = err?.error?.message;
          this.settingsError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not save credentials',
          );
        },
      });
  }

  loadPostTypes() {
    if (!this.client?._id) return;
    this.loadingTypes.set(true);
    this.wp.postTypes(this.client._id).subscribe({
      next: (types) => {
        // Surface page/post first, then everything else alphabetically.
        const priority: Record<string, number> = { page: 0, post: 1 };
        const sorted = [...types].sort((a, b) => {
          const pa = priority[a.slug] ?? 10;
          const pb = priority[b.slug] ?? 10;
          return pa - pb || a.name.localeCompare(b.name);
        });
        this.postTypes.set(sorted);
        this.loadingTypes.set(false);
        if (sorted.length && !this.activePostType()) {
          this.selectPostType(sorted[0].slug);
        }
      },
      error: (err) => {
        this.loadingTypes.set(false);
        const m = err?.error?.message;
        this.listError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Could not load post types',
        );
      },
    });
  }

  selectPostType(slug: string) {
    if (slug === this.activePostType()) return;
    this.activePostType.set(slug);
    this.items.set([]);
    this.currentPage.set(1);
    this.totalPages.set(1);
    this.reload();
  }

  reload() {
    const pt = this.activePostType();
    if (!this.client?._id || !pt) return;
    this.loadingList.set(true);
    this.listError.set(null);
    this.items.set([]);
    this.currentPage.set(1);
    this.wp
      .list(this.client._id, pt, {
        page: 1,
        perPage: 50,
        search: this.searchTerm.trim() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.items.set(r.items);
          this.totalPages.set(r.totalPages);
          this.currentPage.set(r.page);
          this.loadingList.set(false);
        },
        error: (err) => {
          this.loadingList.set(false);
          const m = err?.error?.message;
          this.listError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not load',
          );
        },
      });
  }

  loadMore() {
    const pt = this.activePostType();
    if (!this.client?._id || !pt) return;
    this.loadingList.set(true);
    const nextPage = this.currentPage() + 1;
    this.wp
      .list(this.client._id, pt, {
        page: nextPage,
        perPage: 50,
        search: this.searchTerm.trim() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.items.update((cur) => [...cur, ...r.items]);
          this.totalPages.set(r.totalPages);
          this.currentPage.set(r.page);
          this.loadingList.set(false);
        },
        error: (err) => {
          this.loadingList.set(false);
          const m = err?.error?.message;
          this.listError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not load more',
          );
        },
      });
  }

  toggleHealth(key: HealthKey) {
    this.activeHealth.update((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  healthCount(key: HealthKey): number {
    return this.items().filter((i) => this.healthKey(i) === key).length;
  }

  healthKey(item: WordpressResourceItem): HealthKey {
    if (!item.seoTitle && !item.seoDescription) return 'empty';
    if (!item.seoTitle || !item.seoDescription) return 'partial';
    const tLen = item.seoTitle.length;
    const dLen = item.seoDescription.length;
    if (tLen > 70 || dLen > 160 || tLen < 20 || dLen < 60) return 'partial';
    return 'good';
  }

  healthBadge(item: WordpressResourceItem): string {
    const key = this.healthKey(item);
    if (key === 'good') return '🟢 good';
    if (key === 'empty') return '🔴 empty';
    if (!item.seoTitle || !item.seoDescription) return '🟡 partial';
    const tLen = item.seoTitle?.length ?? 0;
    const dLen = item.seoDescription?.length ?? 0;
    if (tLen > 70 || dLen > 160) return '🟡 over';
    if (tLen < 20 || dLen < 60) return '🟡 short';
    return '🟡 partial';
  }

  healthBadgeClass(item: WordpressResourceItem): string {
    const key = this.healthKey(item);
    if (key === 'good') return 'text-[10px] font-semibold text-positive-500';
    if (key === 'partial') return 'text-[10px] font-semibold text-warning-500';
    return 'text-[10px] font-semibold text-danger-500';
  }

  // CSV flow ---------------------------------------------------------------

  openCsv() {
    this.csvOpen.set(true);
    this.csvStep.set('upload');
    this.csvText.set('');
    this.csvFileName.set(null);
    this.csvError.set(null);
    this.preview.set([]);
    this.results.set([]);
    this.selected.set(new Set());
  }

  closeCsv() {
    this.csvOpen.set(false);
  }

  restartCsv() {
    this.csvStep.set('upload');
    this.csvText.set('');
    this.csvFileName.set(null);
    this.csvError.set(null);
    this.preview.set([]);
    this.results.set([]);
    this.selected.set(new Set());
  }

  onCsvFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.csvFileName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => this.csvText.set(String(reader.result || ''));
    reader.readAsText(file);
  }

  runPreview() {
    if (!this.client?._id) return;
    if (!this.csvText().trim()) {
      this.csvError.set('CSV is empty');
      return;
    }
    this.previewing.set(true);
    this.csvError.set(null);
    this.wp
      .preview(this.client._id, this.activePostType(), this.csvText())
      .subscribe({
        next: (rows) => {
          this.preview.set(rows);
          const pre = new Set<string>();
          for (const r of rows) {
            if (r.matched && (r.titleChanged || r.descriptionChanged)) {
              pre.add(r.slug);
            }
          }
          this.selected.set(pre);
          this.previewing.set(false);
          this.csvStep.set('preview');
        },
        error: (err) => {
          this.previewing.set(false);
          const m = err?.error?.message;
          this.csvError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not parse CSV',
          );
        },
      });
  }

  toggleRow(slug: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selected.update((cur) => {
      const next = new Set(cur);
      if (checked) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }

  toggleAll(ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    if (!checked) {
      this.selected.set(new Set());
      return;
    }
    const eligible = this.preview().filter(
      (r) => r.matched && (r.titleChanged || r.descriptionChanged),
    );
    this.selected.set(new Set(eligible.map((r) => r.slug)));
  }

  runApply() {
    if (!this.client?._id) return;
    const sel = this.selected();
    const rows = this.preview()
      .filter((r) => sel.has(r.slug) && r.matched && r.id !== undefined)
      .map((r) => ({
        slug: r.slug,
        id: r.id as number,
        newSeoTitle: r.titleChanged ? r.newSeoTitle : undefined,
        newSeoDescription: r.descriptionChanged ? r.newSeoDescription : undefined,
      }));
    if (!rows.length) return;
    this.applying.set(true);
    this.wp.apply(this.client._id, this.activePostType(), rows).subscribe({
      next: (res) => {
        this.results.set(res);
        this.applying.set(false);
        this.csvStep.set('results');
      },
      error: (err) => {
        this.applying.set(false);
        const m = err?.error?.message;
        this.csvError.set(
          Array.isArray(m) ? m.join(', ') : m || 'Apply failed',
        );
      },
    });
  }

  // Inline edit ------------------------------------------------------------

  openEdit(item: WordpressResourceItem) {
    if (this.pluginIsNative()) return;
    this.editOriginal.set(item);
    this.editOpen.set(item);
    this.editForm = {
      seoTitle: item.seoTitle ?? '',
      seoDescription: item.seoDescription ?? '',
    };
    this.editError.set(null);
  }

  closeEdit() {
    this.editOpen.set(null);
    this.editOriginal.set(null);
    this.editError.set(null);
  }

  editHasChanges(): boolean {
    const orig = this.editOriginal();
    if (!orig) return false;
    const t = this.editForm.seoTitle.trim();
    const d = this.editForm.seoDescription.trim();
    return t !== (orig.seoTitle ?? '') || d !== (orig.seoDescription ?? '');
  }

  editTitleHealth(): CharHealth {
    const len = this.editForm.seoTitle.trim().length;
    if (len === 0) return 'neutral';
    if (len >= 30 && len <= 60) return 'good';
    return 'warn';
  }

  editDescHealth(): CharHealth {
    const len = this.editForm.seoDescription.trim().length;
    if (len === 0) return 'neutral';
    if (len >= 120 && len <= 160) return 'good';
    return 'warn';
  }

  saveEdit() {
    const item = this.editOpen();
    const orig = this.editOriginal();
    if (!item || !orig || !this.client?._id) return;
    const newTitle = this.editForm.seoTitle.trim();
    const newDesc = this.editForm.seoDescription.trim();
    const titleChanged = newTitle !== (orig.seoTitle ?? '');
    const descChanged = newDesc !== (orig.seoDescription ?? '');
    if (!titleChanged && !descChanged) {
      this.closeEdit();
      return;
    }

    this.savingEdit.set(true);
    this.editError.set(null);
    this.wp
      .apply(this.client._id, this.activePostType(), [
        {
          slug: item.slug,
          id: item.id,
          newSeoTitle: titleChanged ? newTitle : undefined,
          newSeoDescription: descChanged ? newDesc : undefined,
        },
      ])
      .subscribe({
        next: (res) => {
          this.savingEdit.set(false);
          const result = res[0];
          if (!result?.success) {
            this.editError.set(result?.error || 'Update failed');
            return;
          }
          this.items.update((cur) =>
            cur.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    seoTitle: titleChanged ? newTitle : i.seoTitle,
                    seoDescription: descChanged ? newDesc : i.seoDescription,
                  }
                : i,
            ),
          );
          this.closeEdit();
          this.openTrackDialog(item);
        },
        error: (err) => {
          this.savingEdit.set(false);
          const m = err?.error?.message;
          this.editError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Update failed',
          );
        },
      });
  }

  // Track-in-task ----------------------------------------------------------

  private openTrackDialog(item: WordpressResourceItem) {
    const pageUrl = item.link || `${this.connStatus()?.siteUrl}/${item.slug}`;
    const ctx: TrackContext = {
      item,
      pageUrl,
      subtaskTitle: `Meta tags improvement for ${pageUrl}`,
    };
    this.trackOpen.set(ctx);
    this.trackError.set(null);
    this.trackSaved.set(false);
    this.selectedTaskId = null;
    this.loadClientTasks();
  }

  private loadClientTasks() {
    if (!this.client?._id) return;
    this.loadingTasks.set(true);
    this.clientTasks.set([]);
    this.tasksSvc.list({ clientId: this.client._id }).subscribe({
      next: (tasks) => {
        const order: Record<TaskStatus, number> = {
          in_progress: 0,
          pending: 1,
          blocked: 2,
          completed: 3,
        };
        const sorted = [...tasks].sort(
          (a, b) =>
            (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
            a.title.localeCompare(b.title),
        );
        this.clientTasks.set(sorted);
        this.loadingTasks.set(false);
      },
      error: () => this.loadingTasks.set(false),
    });
  }

  confirmTrack() {
    const ctx = this.trackOpen();
    if (!ctx || !this.selectedTaskId) return;
    this.trackingSave.set(true);
    this.trackError.set(null);
    this.tasksSvc
      .addSubtask(this.selectedTaskId, ctx.subtaskTitle, true)
      .subscribe({
        next: () => {
          this.trackingSave.set(false);
          this.trackSaved.set(true);
        },
        error: (err) => {
          this.trackingSave.set(false);
          const m = err?.error?.message;
          this.trackError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not add subtask',
          );
        },
      });
  }

  dismissTrack() {
    this.trackOpen.set(null);
    this.trackingSave.set(false);
    this.trackError.set(null);
  }

  statusEmoji(s: TaskStatus): string {
    if (s === 'completed') return '✓';
    if (s === 'in_progress') return '▶';
    if (s === 'blocked') return '🛑';
    return '○';
  }

  // Rich Results Test ------------------------------------------------------

  openRichResults(item: WordpressResourceItem) {
    const url = this.viewUrl(item);
    if (!url) return;
    window.open(
      `https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener',
    );
  }

  viewUrl(item: WordpressResourceItem): string | null {
    if (item.link) return item.link;
    const site = this.connStatus()?.siteUrl;
    if (site && item.slug) return `${site}/${item.slug}`;
    return null;
  }

  // Helpers ----------------------------------------------------------------

  typeLabel(t: WordpressPostType): string {
    const icon =
      t.slug === 'page'
        ? '📄'
        : t.slug === 'post'
          ? '📝'
          : t.hierarchical
            ? '📁'
            : '📰';
    return `${icon} ${t.name}`;
  }

  truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }
}
