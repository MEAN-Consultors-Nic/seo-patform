import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Suggestion shape — usually built from a client's service areas.
 * `region` is the state/province; `country` is the 2-letter ISO code.
 */
export interface SearchFromLocation {
  city?: string;
  region?: string;
  country?: string;
}

const COUNTRY_OPTIONS: Array<{
  code: string;
  /** Full country name used inside the UULE canonical string. */
  canonical: string;
  label: string;
  defaultHl: string;
}> = [
  { code: 'us', canonical: 'United States', label: 'United States', defaultHl: 'en' },
  { code: 'ca', canonical: 'Canada', label: 'Canada', defaultHl: 'en' },
  { code: 'mx', canonical: 'Mexico', label: 'Mexico', defaultHl: 'es' },
  { code: 'pr', canonical: 'Puerto Rico', label: 'Puerto Rico', defaultHl: 'es' },
  { code: 'do', canonical: 'Dominican Republic', label: 'Dominican Republic', defaultHl: 'es' },
  { code: 'es', canonical: 'Spain', label: 'Spain', defaultHl: 'es' },
  { code: 'co', canonical: 'Colombia', label: 'Colombia', defaultHl: 'es' },
  { code: 'ar', canonical: 'Argentina', label: 'Argentina', defaultHl: 'es' },
  { code: 'cl', canonical: 'Chile', label: 'Chile', defaultHl: 'es' },
  { code: 'gb', canonical: 'United Kingdom', label: 'United Kingdom', defaultHl: 'en' },
  { code: 'au', canonical: 'Australia', label: 'Australia', defaultHl: 'en' },
];

@Component({
  selector: 'app-usearchfrom-button',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <button type="button"
            [class]="buttonClass || 'btn-secondary text-[11px] !py-1 !px-2'"
            (click)="open()"
            [title]="'Run this search as if you were in ' + (location?.city || 'a chosen location')">
      🌎 Search
    </button>

    @if (modalOpen()) {
      <div class="fixed inset-0 bg-ink-900/60 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
           (click)="close()">
        <div class="bg-white sm:rounded-xl rounded-t-xl shadow-xl w-full max-w-lg p-4 sm:p-6 max-h-[95vh] overflow-y-auto"
             (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div>
              <h2 class="text-lg font-bold text-ink-900">🌎 Search from location</h2>
              <p class="text-xs text-ink-500 mt-0.5">
                Runs the query on google.com as if you were in the city below.
                Personalization and ad testing are off so results match what a
                fresh local user would see.
              </p>
            </div>
            <button type="button" (click)="close()"
                    class="text-ink-400 hover:text-ink-900 text-2xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="label">Keyword</label>
              <input class="input" [(ngModel)]="kw" placeholder="search query" />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="sm:col-span-1">
                <label class="label">City</label>
                <input class="input" [(ngModel)]="city" placeholder="Austin" />
              </div>
              <div class="sm:col-span-1">
                <label class="label">Region / state</label>
                <input class="input" [(ngModel)]="region" placeholder="Texas" />
              </div>
              <div class="sm:col-span-1">
                <label class="label">Country</label>
                <select class="input" [(ngModel)]="country">
                  @for (c of countryOptions; track c.code) {
                    <option [value]="c.code">{{ c.label }}</option>
                  }
                </select>
              </div>
            </div>

            <details class="rounded-md border border-ink-200 px-3 py-2">
              <summary class="text-xs font-semibold text-ink-700 cursor-pointer select-none">
                Advanced options
              </summary>
              <div class="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Language (hl)</label>
                  <input class="input" [(ngModel)]="hl" placeholder="en" />
                </div>
                <div>
                  <label class="label">Results (num)</label>
                  <input type="number" class="input" min="10" max="100" step="10"
                         [(ngModel)]="num" />
                </div>
              </div>
              <div class="mt-3 space-y-2">
                <label class="inline-flex items-center gap-2 cursor-pointer text-xs text-ink-700">
                  <input type="checkbox" [(ngModel)]="disablePersonalization"
                         class="rounded border-ink-300 text-brand-500 focus:ring-brand-500" />
                  <span>Disable personalization (<code class="text-[10px]">pws=0</code>)</span>
                </label>
                <label class="inline-flex items-center gap-2 cursor-pointer text-xs text-ink-700">
                  <input type="checkbox" [(ngModel)]="disableAdsTest"
                         class="rounded border-ink-300 text-brand-500 focus:ring-brand-500" />
                  <span>Disable ads testing (<code class="text-[10px]">adtest=off</code>)</span>
                </label>
              </div>
            </details>

            <div class="rounded-md bg-ink-50 border border-ink-200 p-2 text-[10px] text-ink-500 break-all font-mono">
              {{ previewUrl() }}
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100">
            <button class="btn-secondary" (click)="close()">Cancel</button>
            <button class="btn-primary"
                    (click)="runSearch()"
                    [disabled]="!kw.trim() || !city.trim() || !country">
              🔍 Open Google ↗
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsearchfromButtonComponent {
  @Input() keyword = '';
  @Input() location?: SearchFromLocation;
  @Input() buttonClass?: string;

  countryOptions = COUNTRY_OPTIONS;

  modalOpen = signal(false);
  kw = '';
  city = '';
  region = '';
  country = 'us';
  hl = 'en';
  num = 10;
  disablePersonalization = true;
  disableAdsTest = true;

  open() {
    this.kw = this.keyword;
    this.city = this.location?.city ?? '';
    this.region = this.location?.region ?? '';
    const codeRaw = this.location?.country?.toLowerCase().trim() || '';
    // Tolerate a couple of common spellings before falling back to US.
    const found = COUNTRY_OPTIONS.find(
      (c) =>
        c.code === codeRaw ||
        c.label.toLowerCase() === codeRaw ||
        c.canonical.toLowerCase() === codeRaw,
    );
    this.country = found?.code ?? 'us';
    this.hl = found?.defaultHl ?? 'en';
    this.modalOpen.set(true);
  }

  close() {
    this.modalOpen.set(false);
  }

  /**
   * Google's UULE format for canonical-name locations:
   *   "w+CAIQICI" + <length-char> + base64(canonical name)
   * The length char is a single character from a 64-char alphabet that
   * encodes the string length (works for names up to 64 chars).
   */
  private encodeUule(canonical: string): string {
    const ALPHABET =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const lenChar = ALPHABET[canonical.length] ?? '?';
    const b64 = btoa(canonical).replace(/=+$/, '');
    return `w+CAIQICI${lenChar}${b64}`;
  }

  private canonicalLocation(): string {
    const c = this.country || 'us';
    const found = COUNTRY_OPTIONS.find((x) => x.code === c);
    const parts = [
      this.city.trim(),
      this.region.trim(),
      found?.canonical ?? 'United States',
    ].filter((p) => p.length > 0);
    return parts.join(',');
  }

  previewUrl = computed(() => this.buildUrl());

  private buildUrl(): string {
    if (!this.kw.trim() || !this.city.trim()) return '—';
    const params = new URLSearchParams();
    params.set('q', this.kw.trim());
    params.set('gl', this.country);
    params.set('hl', this.hl || 'en');
    if (this.disableAdsTest) params.set('adtest', 'off');
    if (this.disablePersonalization) params.set('pws', '0');
    const canonical = this.canonicalLocation();
    if (canonical) params.set('uule', this.encodeUule(canonical));
    const n = Math.max(10, Math.min(100, Number(this.num) || 10));
    params.set('num', String(n));
    return `https://www.google.com/search?${params.toString()}`;
  }

  runSearch() {
    const url = this.buildUrl();
    if (url === '—') return;
    window.open(url, '_blank', 'noopener');
    this.close();
  }
}
