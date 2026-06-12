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
  ShopifyApplyResultRow,
  ShopifyAuthMode,
  ShopifyConnectionInfo,
  ShopifyResource,
  ShopifyResourceItem,
  ShopifySeoPreviewRow,
  Task,
  TaskStatus,
} from '@seo/shared';
import { ClientsService } from '../../../core/clients.service';
import { ShopifyService } from '../../../core/shopify.service';
import { TasksService } from '../../../core/tasks.service';

type ResourceTabKey = ShopifyResource;

interface ResourceTabDef {
  key: ResourceTabKey;
  label: string;
}

type HealthKey = 'good' | 'partial' | 'empty';

type CharHealth = 'good' | 'warn' | 'neutral';

interface TrackContext {
  item: ShopifyResourceItem;
  pageUrl: string;
  subtaskTitle: string;
}

@Component({
  selector: 'app-client-shopify-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  template: `
    <div class="space-y-4">
      <!-- Header / connection -->
      <div class="card">
        <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-ink-900">🛍️ Shopify</h2>
            <p class="text-xs text-ink-500 mt-0.5 max-w-2xl">
              Connect this client's Shopify store via a Custom App access token.
              Lets us read product/collection/page/article SEO and apply bulk
              meta tag updates from a CSV.
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
              <label class="label">Shop domain</label>
              <input class="input"
                     [(ngModel)]="settingsForm.shopDomain"
                     placeholder="acme-store.myshopify.com" />
              <p class="text-[11px] text-ink-400 mt-1">
                The <code class="bg-ink-100 px-1 rounded">*.myshopify.com</code>
                domain (not the storefront domain).
              </p>
            </div>

            <!-- Mode tabs -->
            <div class="flex items-center gap-1 border-b border-ink-100">
              <button type="button"
                      class="px-3 py-1.5 text-xs font-semibold border-b-2 transition"
                      [class.border-brand-500]="authMode() === 'oauth-client-credentials'"
                      [class.text-brand-500]="authMode() === 'oauth-client-credentials'"
                      [class.border-transparent]="authMode() !== 'oauth-client-credentials'"
                      [class.text-ink-500]="authMode() !== 'oauth-client-credentials'"
                      (click)="authMode.set('oauth-client-credentials')">
                Dev Dashboard (recommended)
              </button>
              <button type="button"
                      class="px-3 py-1.5 text-xs font-semibold border-b-2 transition"
                      [class.border-brand-500]="authMode() === 'legacy-token'"
                      [class.text-brand-500]="authMode() === 'legacy-token'"
                      [class.border-transparent]="authMode() !== 'legacy-token'"
                      [class.text-ink-500]="authMode() !== 'legacy-token'"
                      (click)="authMode.set('legacy-token')">
                Legacy token
              </button>
            </div>

            @if (authMode() === 'oauth-client-credentials') {
              <div class="bg-ink-50 border border-ink-200 rounded p-3 text-[11px] text-ink-600">
                Shopify deprecated legacy Custom Apps on Jan 1, 2026. New apps are
                built in <strong>Dev Dashboard</strong> and authenticate via OAuth
                client credentials. The platform exchanges
                <code class="bg-ink-100 px-1 rounded">client_id</code> +
                <code class="bg-ink-100 px-1 rounded">client_secret</code> for a
                24h access token automatically and refreshes it on demand.
                <br /><br />
                ⚠ <strong>Same organization required:</strong> the app and the store
                must belong to the same Shopify organization in Dev Dashboard.
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label class="label">Client ID</label>
                  <input class="input font-mono text-xs"
                         autocomplete="off"
                         [(ngModel)]="settingsForm.clientId"
                         placeholder="8cca07893f13fc65e5f23727a5b2b288" />
                  <p class="text-[11px] text-ink-400 mt-1">
                    Dev Dashboard → your app → <em>Settings</em> → Credentials.
                  </p>
                </div>
                <div>
                  <label class="label">Client Secret</label>
                  <input class="input font-mono text-xs"
                         type="password"
                         autocomplete="off"
                         [(ngModel)]="settingsForm.clientSecret"
                         placeholder="••••••••••••" />
                  <p class="text-[11px] text-ink-400 mt-1">
                    Required scopes (configure in the app):
                    <code class="bg-ink-100 px-1 rounded">read_products write_products read_content write_content</code>.
                  </p>
                </div>
              </div>
            } @else {
              <div class="bg-warning-50 border border-warning-500/40 rounded p-3 text-[11px] text-ink-700">
                Use this only if the store has an <strong>existing</strong>
                legacy custom app with a <code class="bg-ink-100 px-1 rounded">shpat_</code>
                token. Shopify no longer lets you create new ones (deprecated
                Jan 1, 2026).
              </div>
              <div>
                <label class="label">Admin API access token</label>
                <input class="input font-mono text-xs"
                       type="password"
                       autocomplete="off"
                       [(ngModel)]="settingsForm.accessToken"
                       placeholder="shpat_••••••••••••" />
              </div>
            }

            @if (settingsError()) {
              <div class="text-xs text-danger-500">{{ settingsError() }}</div>
            }
            @if (rawTestResult(); as r) {
              @if (r.connected) {
                <div class="text-xs text-positive-500">
                  ✓ Connection test passed —
                  <strong>{{ r.shopName }}</strong>
                  ({{ r.shopDomain }})
                  @if (r.primaryDomain) { · {{ r.primaryDomain }} }
                  @if (r.authMode === 'oauth-client-credentials') {
                    · <span class="text-ink-500">OAuth token refreshes every 24h</span>
                  }
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
              Connected to <strong>{{ cs.shopName }}</strong>
              · myshopify: <code>{{ cs.shopDomain }}</code>
              @if (cs.primaryDomain) { · primary: <code>{{ cs.primaryDomain }}</code> }
              @if (cs.authMode === 'oauth-client-credentials') {
                · <span class="text-positive-500">Dev Dashboard OAuth</span>
              } @else if (cs.authMode === 'legacy-token') {
                · <span class="text-warning-500">legacy token</span>
              }
            </div>
          } @else if (cs.error) {
            <div class="mt-3 text-xs text-danger-500">⚠ {{ cs.error }}</div>
          }
        }
      </div>

      @if (!hasAnyCredentials() || !connStatus()?.connected) {
        <div class="card text-center py-10 text-ink-400 italic text-sm">
          Configure and test the Shopify credentials above to enable browsing
          and bulk SEO updates.
        </div>
      } @else {
        <!-- Resource tabs + list + bulk action -->
        <div class="card">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-3 mb-3">
            <div class="flex flex-wrap items-center gap-1">
              @for (t of resourceTabs; track t.key) {
                <button
                  class="px-3 py-1.5 text-xs font-semibold rounded transition"
                  [class.bg-brand-500]="activeResource() === t.key"
                  [class.text-white]="activeResource() === t.key"
                  [class.bg-ink-100]="activeResource() !== t.key"
                  [class.text-ink-700]="activeResource() !== t.key"
                  (click)="selectResource(t.key)">
                  {{ t.label }}
                </button>
              }
            </div>
            <div class="flex items-center gap-2">
              <input class="input input-sm w-44 text-xs"
                     placeholder="Search…"
                     [(ngModel)]="searchTerm"
                     (keyup.enter)="reload()" />
              <button class="btn-secondary text-xs" (click)="reload()"
                      [disabled]="loadingList()">
                {{ loadingList() ? 'Loading…' : '⚡ Refresh' }}
              </button>
              <button class="btn-primary text-xs" (click)="openCsv()">
                📤 Upload CSV
              </button>
            </div>
          </div>

          <!-- Health filter chips -->
          @if (items().length > 0) {
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
              Loading {{ activeResource() }}s from Shopify…
            </div>
          } @else if (items().length === 0) {
            <div class="text-center py-10 text-ink-400 italic text-sm">
              No {{ activeResource() }}s found.
            </div>
          } @else if (filteredItems().length === 0) {
            <div class="text-center py-10 text-ink-400 italic text-sm">
              No {{ activeResource() }}s match the selected health filters.
            </div>
          } @else {
            <table class="w-full text-sm">
              <thead class="border-b border-ink-100">
                <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500">
                  <th class="py-2 pr-2 font-bold">Title / handle</th>
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
                           [title]="item.handle">{{ item.handle }}</div>
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
              </span>
              @if (hasNextPage()) {
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
                Bulk SEO update — {{ activeResource() }}s
              </h2>
              <p class="text-xs text-ink-500 mt-0.5">
                CSV with header row: <code class="bg-ink-100 px-1 rounded">handle, seo_title, seo_description</code>.
                Empty cells skip that field.
              </p>
            </div>
            <button type="button" (click)="closeCsv()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <!-- Step 1: upload -->
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
                          placeholder="handle,seo_title,seo_description&#10;my-product-1,New SEO title,New SEO description"></textarea>
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

          <!-- Step 2: preview/diff -->
          @if (csvStep() === 'preview') {
            <div class="space-y-3">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">
                    Total rows
                  </div>
                  <div class="text-xl font-black text-ink-900">{{ preview().length }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">
                    Matched
                  </div>
                  <div class="text-xl font-black text-positive-500">{{ matchedCount() }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">
                    Not found
                  </div>
                  <div class="text-xl font-black text-danger-500">{{ notFoundCount() }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">
                    Will change
                  </div>
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
                      <th class="py-1.5 px-2 font-bold">Handle</th>
                      <th class="py-1.5 px-2 font-bold">Current → New title</th>
                      <th class="py-1.5 px-2 font-bold">Current → New description</th>
                      <th class="py-1.5 px-2 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of filteredPreview(); track row.handle) {
                      <tr class="border-t border-ink-100"
                          [class.bg-danger-50]="!row.matched">
                        <td class="py-1.5 px-2 align-top">
                          <input type="checkbox"
                                 [disabled]="!row.matched || (!row.titleChanged && !row.descriptionChanged)"
                                 [checked]="selected().has(row.handle)"
                                 (change)="toggleRow(row.handle, $event)"
                                 class="rounded border-ink-300 text-brand-500 focus:ring-brand-500" />
                        </td>
                        <td class="py-1.5 px-2 font-mono text-[11px] text-ink-700 align-top">
                          {{ row.handle }}
                          @if (row.title) {
                            <div class="text-ink-400 text-[10px] mt-0.5"
                                 [title]="row.title">
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
                <button class="btn-secondary text-xs" (click)="csvStep.set('upload')">
                  ← Back
                </button>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-ink-500">
                    {{ selected().size }} selected
                  </span>
                  <button class="btn-primary"
                          (click)="runApply()"
                          [disabled]="applying() || selected().size === 0">
                    {{ applying() ? 'Applying…' : 'Apply ' + selected().size + ' change(s) →' }}
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Step 3: results -->
          @if (csvStep() === 'results') {
            <div class="space-y-3">
              <div class="grid grid-cols-3 gap-3">
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">
                    Total
                  </div>
                  <div class="text-xl font-black text-ink-900">{{ results().length }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">
                    Success
                  </div>
                  <div class="text-xl font-black text-positive-500">{{ successCount() }}</div>
                </div>
                <div class="card !p-3">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-ink-500 mb-0.5">
                    Failed
                  </div>
                  <div class="text-xl font-black text-danger-500">{{ failedCount() }}</div>
                </div>
              </div>

              <div class="border border-ink-200 rounded overflow-hidden max-h-[50vh] overflow-y-auto">
                <table class="w-full text-xs">
                  <thead class="bg-ink-50 sticky top-0">
                    <tr class="text-left text-[10px] uppercase tracking-wider text-ink-500">
                      <th class="py-1.5 px-2 font-bold">Handle</th>
                      <th class="py-1.5 px-2 font-bold">Result</th>
                      <th class="py-1.5 px-2 font-bold">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of results(); track r.handle) {
                      <tr class="border-t border-ink-100"
                          [class.bg-danger-50]="!r.success">
                        <td class="py-1.5 px-2 font-mono text-[11px]">{{ r.handle }}</td>
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
                <button class="btn-secondary" (click)="restartCsv()">
                  Run another batch
                </button>
                <button class="btn-primary" (click)="closeCsv(); reload()">
                  Done
                </button>
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
                Edit meta tags — {{ activeResource() }}
              </h2>
              <p class="text-xs text-ink-500 mt-0.5">
                {{ item.title }}
              </p>
              <p class="font-mono text-[11px] text-ink-400 mt-0.5">
                {{ item.handle }}
                @if (item.onlineStoreUrl) {
                  · <a [href]="item.onlineStoreUrl" target="_blank" rel="noopener"
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
                  @if (editTitleHealth() === 'warn') {
                    · target 30–60
                  }
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
                  @if (editDescHealth() === 'warn') {
                    · target 120–160
                  }
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
              subtask on one of this client's tasks for audit trail.
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="closeEdit()">Cancel</button>
            <button class="btn-primary" (click)="saveEdit()"
                    [disabled]="savingEdit() || !editHasChanges()">
              {{ savingEdit() ? 'Saving…' : 'Save to Shopify →' }}
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
              <h2 class="text-lg font-bold text-ink-900">
                ✓ Saved to Shopify
              </h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Track this change as a subtask?
              </p>
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
                No tasks exist for this client yet. Create a task first from the Tasks tab.
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
export class ClientShopifyTab implements OnChanges {
  @Input({ required: true }) client!: Client;

  private shopify = inject(ShopifyService);
  private clients = inject(ClientsService);
  private tasksSvc = inject(TasksService);

  resourceTabs: ResourceTabDef[] = [
    { key: 'product', label: '🛒 Products' },
    { key: 'collection', label: '📁 Collections' },
    { key: 'page', label: '📄 Pages' },
    { key: 'article', label: '📰 Articles' },
  ];

  // Health filters
  healthFilters: Array<{ key: HealthKey; label: string }> = [
    { key: 'good', label: '🟢 Good' },
    { key: 'partial', label: '🟡 Partial' },
    { key: 'empty', label: '🔴 Empty' },
  ];
  emptySet: Set<HealthKey> = new Set();
  activeHealth = signal<Set<HealthKey>>(new Set());

  // Connection state
  settingsOpen = signal(false);
  authMode = signal<ShopifyAuthMode>('oauth-client-credentials');
  settingsForm: {
    shopDomain: string;
    clientId: string;
    clientSecret: string;
    accessToken: string;
  } = {
    shopDomain: '',
    clientId: '',
    clientSecret: '',
    accessToken: '',
  };
  testing = signal(false);
  testingRaw = signal(false);
  savingSettings = signal(false);
  settingsError = signal<string | null>(null);
  rawTestResult = signal<ShopifyConnectionInfo | null>(null);
  connStatus = signal<ShopifyConnectionInfo | null>(null);

  // List state
  activeResource = signal<ResourceTabKey>('product');
  items = signal<ShopifyResourceItem[]>([]);
  hasNextPage = signal(false);
  endCursor = signal<string | undefined>(undefined);
  loadingList = signal(false);
  listError = signal<string | null>(null);
  searchTerm = '';

  // CSV state
  csvOpen = signal(false);
  csvStep = signal<'upload' | 'preview' | 'results'>('upload');
  csvFileName = signal<string | null>(null);
  csvText = signal('');
  csvError = signal<string | null>(null);
  previewing = signal(false);
  preview = signal<ShopifySeoPreviewRow[]>([]);
  selected = signal<Set<string>>(new Set());
  onlyChanged = true;
  applying = signal(false);
  results = signal<ShopifyApplyResultRow[]>([]);

  matchedCount = computed(() => this.preview().filter((r) => r.matched).length);
  notFoundCount = computed(() => this.preview().filter((r) => !r.matched).length);
  willChangeCount = computed(
    () =>
      this.preview().filter(
        (r) => r.matched && (r.titleChanged || r.descriptionChanged),
      ).length,
  );
  filteredPreview = computed(() => {
    const p = this.preview();
    if (!this.onlyChanged) return p;
    return p.filter(
      (r) => !r.matched || r.titleChanged || r.descriptionChanged,
    );
  });
  allSelected = computed(() => {
    const eligible = this.preview().filter(
      (r) => r.matched && (r.titleChanged || r.descriptionChanged),
    );
    if (eligible.length === 0) return false;
    const sel = this.selected();
    return eligible.every((r) => sel.has(r.handle));
  });
  successCount = computed(() => this.results().filter((r) => r.success).length);
  failedCount = computed(() => this.results().filter((r) => !r.success).length);

  ngOnChanges() {
    this.settingsForm = {
      shopDomain: this.client.shopifyShopDomain ?? '',
      clientId: this.client.shopifyClientId ?? '',
      clientSecret: this.client.shopifyClientSecret ?? '',
      accessToken: this.client.shopifyAccessToken ?? '',
    };
    // Pick the active mode based on which credentials the client has.
    if (this.client.shopifyClientId && this.client.shopifyClientSecret) {
      this.authMode.set('oauth-client-credentials');
    } else if (this.client.shopifyAccessToken) {
      this.authMode.set('legacy-token');
    } else {
      this.authMode.set('oauth-client-credentials');
    }
    this.items.set([]);
    this.endCursor.set(undefined);
    this.hasNextPage.set(false);
    this.connStatus.set(null);
    this.rawTestResult.set(null);
    if (this.hasAnyCredentials()) {
      this.testConnection();
    }
  }

  hasAnyCredentials(): boolean {
    return !!(
      this.client.shopifyShopDomain &&
      ((this.client.shopifyClientId && this.client.shopifyClientSecret) ||
        this.client.shopifyAccessToken)
    );
  }

  canTestRaw(): boolean {
    if (!this.settingsForm.shopDomain) return false;
    if (this.authMode() === 'oauth-client-credentials') {
      return !!(this.settingsForm.clientId && this.settingsForm.clientSecret);
    }
    return !!this.settingsForm.accessToken;
  }

  toggleSettings() {
    this.settingsOpen.update((v) => !v);
    this.settingsError.set(null);
    this.rawTestResult.set(null);
  }

  testConnection() {
    if (!this.client?._id) return;
    this.testing.set(true);
    this.shopify.test(this.client._id).subscribe({
      next: (r) => {
        this.connStatus.set(r);
        this.testing.set(false);
        if (r.connected) this.reload();
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
    const isOauth = this.authMode() === 'oauth-client-credentials';
    this.shopify
      .testRaw({
        shopDomain: this.settingsForm.shopDomain.trim(),
        clientId: isOauth ? this.settingsForm.clientId.trim() : undefined,
        clientSecret: isOauth ? this.settingsForm.clientSecret.trim() : undefined,
        accessToken: !isOauth ? this.settingsForm.accessToken.trim() : undefined,
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
    const isOauth = this.authMode() === 'oauth-client-credentials';
    // Saving in OAuth mode clears any legacy token (and vice versa) so we
    // don't ship contradictory state.
    const patch: Partial<Client> = {
      shopifyShopDomain: this.settingsForm.shopDomain.trim() || undefined,
      shopifyClientId: isOauth
        ? this.settingsForm.clientId.trim() || undefined
        : undefined,
      shopifyClientSecret: isOauth
        ? this.settingsForm.clientSecret.trim() || undefined
        : undefined,
      shopifyAccessToken: !isOauth
        ? this.settingsForm.accessToken.trim() || undefined
        : undefined,
    };
    this.clients.update(this.client._id, patch).subscribe({
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

  selectResource(r: ResourceTabKey) {
    if (r === this.activeResource()) return;
    this.activeResource.set(r);
    this.items.set([]);
    this.endCursor.set(undefined);
    this.hasNextPage.set(false);
    this.reload();
  }

  reload() {
    if (!this.client?._id || !this.connStatus()?.connected) return;
    this.loadingList.set(true);
    this.listError.set(null);
    this.items.set([]);
    this.endCursor.set(undefined);
    this.shopify
      .list(this.client._id, this.activeResource(), {
        limit: 50,
        q: this.searchTerm.trim() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.items.set(r.items);
          this.hasNextPage.set(r.hasNextPage);
          this.endCursor.set(r.endCursor);
          this.loadingList.set(false);
        },
        error: (err) => {
          this.loadingList.set(false);
          const m = err?.error?.message;
          this.listError.set(
            Array.isArray(m) ? m.join(', ') : m || 'Could not load list',
          );
        },
      });
  }

  loadMore() {
    if (!this.client?._id || !this.endCursor()) return;
    this.loadingList.set(true);
    this.shopify
      .list(this.client._id, this.activeResource(), {
        limit: 50,
        cursor: this.endCursor(),
        q: this.searchTerm.trim() || undefined,
      })
      .subscribe({
        next: (r) => {
          this.items.update((cur) => [...cur, ...r.items]);
          this.hasNextPage.set(r.hasNextPage);
          this.endCursor.set(r.endCursor);
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

  // CSV flow
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
    reader.onload = () => {
      this.csvText.set(String(reader.result || ''));
    };
    reader.readAsText(file);
  }

  runPreview() {
    if (!this.client?._id) return;
    const text = this.csvText().trim();
    if (!text) {
      this.csvError.set('CSV is empty');
      return;
    }
    this.previewing.set(true);
    this.csvError.set(null);
    this.shopify
      .preview(this.client._id, this.activeResource(), this.csvText())
      .subscribe({
        next: (rows) => {
          this.preview.set(rows);
          // Default: select every row that will actually change.
          const pre = new Set<string>();
          for (const r of rows) {
            if (r.matched && (r.titleChanged || r.descriptionChanged)) {
              pre.add(r.handle);
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

  toggleRow(handle: string, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this.selected.update((cur) => {
      const next = new Set(cur);
      if (checked) next.add(handle);
      else next.delete(handle);
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
    this.selected.set(new Set(eligible.map((r) => r.handle)));
  }

  runApply() {
    if (!this.client?._id) return;
    const sel = this.selected();
    const rows = this.preview()
      .filter((r) => sel.has(r.handle) && r.matched && r.id)
      .map((r) => ({
        handle: r.handle,
        id: r.id!,
        newSeoTitle: r.titleChanged ? r.newSeoTitle : undefined,
        newSeoDescription: r.descriptionChanged ? r.newSeoDescription : undefined,
      }));
    if (!rows.length) return;
    this.applying.set(true);
    this.shopify.apply(this.client._id, this.activeResource(), rows).subscribe({
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

  truncate(s: string, n: number): string {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  healthKey(item: ShopifyResourceItem): HealthKey {
    if (!item.seoTitle && !item.seoDescription) return 'empty';
    if (!item.seoTitle || !item.seoDescription) return 'partial';
    const tLen = item.seoTitle.length;
    const dLen = item.seoDescription.length;
    // Same heuristics as healthBadge: out-of-range counts as "partial" since
    // the row needs attention but isn't fully empty.
    if (tLen > 70 || dLen > 160 || tLen < 20 || dLen < 60) return 'partial';
    return 'good';
  }

  healthBadge(item: ShopifyResourceItem): string {
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

  healthBadgeClass(item: ShopifyResourceItem): string {
    const key = this.healthKey(item);
    if (key === 'good') return 'text-[10px] font-semibold text-positive-500';
    if (key === 'partial') return 'text-[10px] font-semibold text-warning-500';
    return 'text-[10px] font-semibold text-danger-500';
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

  // --- Inline edit + track-in-task ---------------------------------------

  editOpen = signal<ShopifyResourceItem | null>(null);
  editOriginal = signal<ShopifyResourceItem | null>(null);
  editForm: { seoTitle: string; seoDescription: string } = {
    seoTitle: '',
    seoDescription: '',
  };
  savingEdit = signal(false);
  editError = signal<string | null>(null);

  trackOpen = signal<TrackContext | null>(null);
  clientTasks = signal<Task[]>([]);
  loadingTasks = signal(false);
  selectedTaskId: string | null = null;
  trackingSave = signal(false);
  trackError = signal<string | null>(null);
  trackSaved = signal(false);

  // These are plain methods (not `computed`) because `editForm` is a plain
  // object — signals only track other signals. Re-evaluation runs on every
  // change-detection tick triggered by ngModel.
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

  openEdit(item: ShopifyResourceItem) {
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
    this.shopify
      .apply(this.client._id, this.activeResource(), [
        {
          handle: item.handle,
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
          // Optimistically reflect the new SEO in the visible list.
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

  private openTrackDialog(item: ShopifyResourceItem) {
    const pageUrl = this.derivePageUrl(item);
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

  private derivePageUrl(item: ShopifyResourceItem): string {
    if (item.onlineStoreUrl) return item.onlineStoreUrl;
    const primary =
      this.connStatus()?.primaryDomain || `https://${this.connStatus()?.shopDomain}`;
    if (!primary) return item.handle;
    const root = primary.replace(/\/$/, '');
    switch (this.activeResource()) {
      case 'product':
        return `${root}/products/${item.handle}`;
      case 'collection':
        return `${root}/collections/${item.handle}`;
      case 'page':
        return `${root}/pages/${item.handle}`;
      case 'article':
        return `${root}/blogs/news/${item.handle}`;
      default:
        return `${root}/${item.handle}`;
    }
  }

  private loadClientTasks() {
    if (!this.client?._id) return;
    this.loadingTasks.set(true);
    this.clientTasks.set([]);
    this.tasksSvc.list({ clientId: this.client._id }).subscribe({
      next: (tasks) => {
        // Filter out completed tasks so the user sees actionable buckets first,
        // but keep them queryable if the user really wants to backfill.
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
      error: () => {
        this.loadingTasks.set(false);
      },
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

  filteredItems = computed(() => {
    const filters = this.activeHealth();
    if (filters.size === 0) return this.items();
    return this.items().filter((i) => filters.has(this.healthKey(i)));
  });

  openRichResults(item: ShopifyResourceItem) {
    const url = this.derivePageUrl(item);
    window.open(
      `https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener',
    );
  }

  viewUrl(item: ShopifyResourceItem): string | null {
    if (item.onlineStoreUrl) return item.onlineStoreUrl;
    // Fall back to derivePageUrl only when we actually have a primary domain
    // to construct from — otherwise the link would point to a bare handle.
    const primary = this.connStatus()?.primaryDomain;
    if (!primary) return null;
    return this.derivePageUrl(item);
  }
}
