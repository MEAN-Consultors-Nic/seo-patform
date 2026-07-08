import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import {
  Client,
  ClientContact,
  ClientKnowledge,
  ClientTier,
  Competitor,
  HOURS_PER_TIER,
  Keyword,
  KeywordIntent,
  Package,
  ReportKpis,
} from '@seo/shared';
import { ClientsService } from '../../core/clients.service';
import { KeywordsService } from '../../core/keywords.service';
import { CompetitorsService } from '../../core/competitors.service';
import { PackagesService } from '../../core/packages.service';
import { UsersService } from '../../core/users.service';
import { AuthService } from '../../core/auth.service';
import { User } from '@seo/shared';

interface WizardStep {
  key: string;
  label: string;
  optional?: boolean;
}

@Component({
  selector: 'app-new-client-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, RouterLink],
  template: `
    <div class="min-h-screen bg-ink-50">
      <!-- Top bar -->
      <header class="bg-white border-b border-ink-200 sticky top-0 z-30">
        <div class="max-w-5xl mx-auto px-8 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button (click)="cancel()" class="text-sm text-ink-500 hover:text-ink-900">
              ← Cancel
            </button>
            <div class="h-5 w-px bg-ink-200"></div>
            <h1 class="text-base font-bold text-ink-900">New client onboarding</h1>
          </div>
          <div class="text-xs text-ink-500">
            Step <strong class="text-ink-900">{{ currentStepIdx() + 1 }}</strong> of {{ steps.length }}
          </div>
        </div>
        <!-- Progress bar -->
        <div class="h-1 bg-ink-100">
          <div class="h-full bg-brand-500 transition-all"
               [style.width.%]="((currentStepIdx() + 1) / steps.length) * 100"></div>
        </div>
        <!-- Step indicators -->
        <div class="max-w-5xl mx-auto px-8 py-3 flex items-center gap-2 overflow-x-auto">
          @for (s of steps; track s.key; let i = $index) {
            <button
              (click)="goToStep(i)"
              [class]="'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition ' +
                (i === currentStepIdx()
                  ? 'bg-brand-50 text-brand-700'
                  : i < currentStepIdx()
                    ? 'text-ink-700 hover:bg-ink-100'
                    : 'text-ink-400 cursor-not-allowed')"
              [disabled]="i > currentStepIdx() && !canSubmit()">
              <span [class]="'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ' +
                (i < currentStepIdx() ? 'bg-positive-500 text-white' :
                 i === currentStepIdx() ? 'bg-brand-500 text-white' : 'bg-ink-200 text-ink-500')">
                {{ i < currentStepIdx() ? '✓' : i + 1 }}
              </span>
              {{ s.label }}
              @if (s.optional) {
                <span class="text-[9px] text-ink-400 font-normal">(opt.)</span>
              }
            </button>
          }
        </div>
      </header>

      <main class="max-w-5xl mx-auto px-8 py-8">
        <!-- STEP 1: Basics -->
        @if (currentStepIdx() === 0) {
          <div class="card max-w-3xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Basic information</h2>
            <p class="text-sm text-ink-500 mb-6">The essentials. You can edit any field later.</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="md:col-span-2">
                <label class="label">Client name <span class="text-danger-500">*</span></label>
                <input class="input" [(ngModel)]="form.name" placeholder="e.g. American Storage PR" />
              </div>
              <div class="md:col-span-2">
                <label class="label">Website URL <span class="text-danger-500">*</span></label>
                <input class="input" [(ngModel)]="form.url" placeholder="https://example.com" />
              </div>
              <div>
                <label class="label">Package <span class="text-danger-500">*</span></label>
                <select class="input" [ngModel]="form.packageId"
                        (ngModelChange)="onPackagePick($event)">
                  <option value="">— Pick a package —</option>
                  @for (p of packages(); track p._id) {
                    <option [value]="p._id">{{ p.name }}</option>
                  }
                </select>
                <p class="text-[10px] text-ink-500 mt-1">
                  <a routerLink="/core/packages" class="text-brand-500 hover:underline">
                    Manage packages
                  </a>
                  @if (selectedPackage(); as p) {
                    · {{ p.deliverables.length }} deliverable{{ p.deliverables.length === 1 ? '' : 's' }}
                    @if (p.hoursPerPeriod !== undefined) { · {{ p.hoursPerPeriod }}h/period }
                  }
                </p>
              </div>
              <div>
                <label class="label">Industry</label>
                <input class="input" [(ngModel)]="form.industry" placeholder="e.g. Logistics, Dental, Storage" />
              </div>
              <div class="md:col-span-2">
                <label class="label">Logo URL (optional)</label>
                <input class="input" [(ngModel)]="form.logoUrl" placeholder="https://..." />
              </div>
              @if (auth.isManager()) {
                <div class="md:col-span-2">
                  <label class="label">Owner (SEO Strategist)</label>
                  <select class="input" [(ngModel)]="form.ownerId">
                    <option [ngValue]="''">— Assign later —</option>
                    @for (u of assignableUsers(); track u._id) {
                      <option [ngValue]="u._id">{{ u.name }} ({{ u.email }})</option>
                    }
                  </select>
                  <p class="text-[10px] text-ink-500 mt-1">
                    Only the owner and managers can edit this client.
                  </p>
                </div>
              }
            </div>
          </div>
        }

        <!-- STEP 2: Knowledge base -->
        @if (currentStepIdx() === 1) {
          <div class="card max-w-3xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Knowledge base</h2>
            <p class="text-sm text-ink-500 mb-6">
              Brand voice, target persona, and rules you'll reference every time you work with this client.
            </p>
            <div class="space-y-4">
              <div>
                <label class="label">Brand voice / Tone</label>
                <textarea class="input" rows="2" [(ngModel)]="knowledge.brandVoice"
                  placeholder="e.g. Professional, direct, no jargon. Address the reader informally."></textarea>
              </div>
              <div>
                <label class="label">Target persona</label>
                <textarea class="input" rows="2" [(ngModel)]="knowledge.targetPersona"
                  placeholder="e.g. SMB owners, 35-55, who value time-saving solutions."></textarea>
              </div>
              <div>
                <label class="label">Anchor text rules</label>
                <textarea class="input" rows="2" [(ngModel)]="knowledge.anchorRules"
                  placeholder="e.g. 60% branded, 30% partial-match, 10% exact-match."></textarea>
              </div>
              <div>
                <label class="label">Internal linking strategy</label>
                <textarea class="input" rows="2" [(ngModel)]="knowledge.internalLinkingStrategy"
                  placeholder="e.g. Pillar → cluster pages with descriptive anchors."></textarea>
              </div>
              <div>
                <label class="label">Internal notes</label>
                <textarea class="input" rows="3" [(ngModel)]="knowledge.internalNotes"
                  placeholder="History, past decisions, context worth remembering."></textarea>
              </div>
            </div>
          </div>
        }

        <!-- STEP 3: Contacts -->
        @if (currentStepIdx() === 2) {
          <div class="card max-w-3xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Client contacts</h2>
            <p class="text-sm text-ink-500 mb-6">
              People you'll communicate with. Add at least one — they'll receive reports.
            </p>
            <div class="space-y-2 mb-4">
              @for (c of contacts(); track $index; let i = $index) {
                <div class="grid grid-cols-12 gap-2 items-center">
                  <input class="input col-span-3" [(ngModel)]="c.name" placeholder="Name" />
                  <input class="input col-span-4" [(ngModel)]="c.email" placeholder="Email" type="email" />
                  <input class="input col-span-4" [(ngModel)]="c.role" placeholder="Role (e.g. CEO)" />
                  <button (click)="removeContact(i)" class="text-danger-500 hover:text-red-700 col-span-1 text-lg">×</button>
                </div>
              }
            </div>
            <button class="btn-secondary" (click)="addContact()">+ Add contact</button>
          </div>
        }

        <!-- STEP 4: Access -->
        @if (currentStepIdx() === 3) {
          <div class="card max-w-3xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Access confirmation</h2>
            <p class="text-sm text-ink-500 mb-6">
              Which tools/accounts do you already have access to?
            </p>
            <div class="grid grid-cols-2 gap-3">
              @for (key of accessKeys; track key) {
                <label class="flex items-center gap-3 p-3 border border-ink-200 rounded-md cursor-pointer hover:bg-ink-50">
                  <input type="checkbox" [(ngModel)]="access[key]" />
                  <span class="uppercase text-xs font-semibold text-ink-700">{{ key }}</span>
                </label>
              }
            </div>
            <div class="mt-4">
              <label class="label">Access notes</label>
              <textarea class="input" rows="2" [(ngModel)]="access.notes"
                placeholder="Pending invites, accounts shared via shared drive, etc."></textarea>
            </div>
          </div>
        }

        <!-- STEP 5: Baseline KPIs -->
        @if (currentStepIdx() === 4) {
          <div class="card max-w-3xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Baseline KPIs</h2>
            <p class="text-sm text-ink-500 mb-6">
              Current numbers <strong>before you start working</strong>. These are used as the comparison
              point for the first cycle's report. You can leave blank what you don't have yet.
            </p>

            @for (group of kpiGroups; track group.label) {
              <div class="mb-5">
                <div class="text-xs font-bold uppercase tracking-wider text-ink-700 pb-2 border-b border-ink-100 mb-3">
                  {{ group.label }}
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                  @for (k of group.fields; track k.key) {
                    <div>
                      <label class="label">{{ k.label }}</label>
                      <input type="number" class="input" step="any"
                             [(ngModel)]="baselineKpis[k.key]" placeholder="—" />
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- STEP 6: Keywords -->
        @if (currentStepIdx() === 5) {
          <div class="card max-w-5xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Target keywords</h2>
            <p class="text-sm text-ink-500 mb-6">
              Keywords you want to track positions for. You can add more later from the client detail.
            </p>

            <div class="space-y-2 mb-3">
              @for (k of keywords(); track $index; let i = $index) {
                <div class="grid grid-cols-12 gap-2 items-center">
                  <input class="input col-span-3" [(ngModel)]="k.text" placeholder="Keyword" />
                  <input class="input col-span-3" [(ngModel)]="k.targetUrl" placeholder="/target-url" />
                  <input class="input col-span-1" type="number" [(ngModel)]="k.volume" placeholder="Vol." />
                  <input class="input col-span-1" type="number" [(ngModel)]="k.difficulty" placeholder="KD" />
                  <select class="input col-span-2" [(ngModel)]="k.intent">
                    <option [ngValue]="undefined">Intent</option>
                    @for (i of intents; track i) {
                      <option [ngValue]="i">{{ i }}</option>
                    }
                  </select>
                  <input class="input col-span-1" [(ngModel)]="k.group" placeholder="Group" />
                  <button (click)="removeKeyword(i)" class="text-danger-500 hover:text-red-700 col-span-1 text-lg">×</button>
                </div>
              }
            </div>
            <button class="btn-secondary" (click)="addKeyword()">+ Add keyword</button>
          </div>
        }

        <!-- STEP 7: Competitors -->
        @if (currentStepIdx() === 6) {
          <div class="card max-w-4xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Competitors</h2>
            <p class="text-sm text-ink-500 mb-6">
              Direct competitors you want to monitor. Helps for benchmark comparisons.
            </p>

            <div class="space-y-2 mb-3">
              @for (c of competitors(); track $index; let i = $index) {
                <div class="grid grid-cols-12 gap-2 items-center">
                  <input class="input col-span-3" [(ngModel)]="c.name" placeholder="Competitor name" />
                  <input class="input col-span-5" [(ngModel)]="c.url" placeholder="https://..." />
                  <input class="input col-span-1" type="number" [(ngModel)]="c.domainRating" placeholder="DR" />
                  <input class="input col-span-2" type="number" [(ngModel)]="c.estimatedTraffic" placeholder="Est. traffic" />
                  <button (click)="removeCompetitor(i)" class="text-danger-500 hover:text-red-700 col-span-1 text-lg">×</button>
                </div>
              }
            </div>
            <button class="btn-secondary" (click)="addCompetitor()">+ Add competitor</button>
          </div>
        }

        <!-- STEP 8: Review -->
        @if (currentStepIdx() === 7) {
          <div class="card max-w-3xl mx-auto">
            <h2 class="text-xl font-bold text-ink-900 mb-1">Review &amp; create</h2>
            <p class="text-sm text-ink-500 mb-6">
              Quick summary of what will be saved. You can edit anything from the client detail after creation.
            </p>

            <div class="space-y-4">
              <div class="border-l-4 border-brand-500 pl-4">
                <div class="text-[10px] uppercase tracking-wider text-ink-500 font-bold">Client</div>
                <div class="font-bold text-ink-900 text-lg">{{ form.name || '(no name)' }}</div>
                <div class="text-xs text-ink-500">
                  {{ selectedPackage()?.name || 'No package' }} · {{ form.industry || 'no industry' }} ·
                  <a [href]="form.url" target="_blank" class="text-sky-500 hover:underline">{{ form.url }}</a>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4 text-sm">
                <div class="border border-ink-200 rounded-lg p-4">
                  <div class="text-[10px] uppercase font-bold text-ink-500">Contacts</div>
                  <div class="text-2xl font-bold text-ink-900">{{ filledContactsCount() }}</div>
                </div>
                <div class="border border-ink-200 rounded-lg p-4">
                  <div class="text-[10px] uppercase font-bold text-ink-500">Access confirmed</div>
                  <div class="text-2xl font-bold text-ink-900">{{ accessConfirmedCount() }}</div>
                </div>
                <div class="border border-ink-200 rounded-lg p-4">
                  <div class="text-[10px] uppercase font-bold text-ink-500">Baseline KPIs</div>
                  <div class="text-2xl font-bold text-ink-900">{{ baselineKpisFilled() }}</div>
                </div>
                <div class="border border-ink-200 rounded-lg p-4">
                  <div class="text-[10px] uppercase font-bold text-ink-500">Keywords</div>
                  <div class="text-2xl font-bold text-ink-900">{{ filledKeywordsCount() }}</div>
                </div>
                <div class="border border-ink-200 rounded-lg p-4">
                  <div class="text-[10px] uppercase font-bold text-ink-500">Competitors</div>
                  <div class="text-2xl font-bold text-ink-900">{{ filledCompetitorsCount() }}</div>
                </div>
                <div class="border border-ink-200 rounded-lg p-4">
                  <div class="text-[10px] uppercase font-bold text-ink-500">Knowledge fields</div>
                  <div class="text-2xl font-bold text-ink-900">{{ knowledgeFilled() }}</div>
                </div>
              </div>

              @if (submitError()) {
                <div class="rounded-md bg-danger-100 border border-danger-500/20 px-3 py-2 text-sm text-danger-500">
                  {{ submitError() }}
                </div>
              }
            </div>
          </div>
        }

        <!-- Footer nav -->
        <div class="max-w-3xl mx-auto mt-6 flex items-center justify-between">
          <button class="btn-secondary" (click)="prev()" [disabled]="currentStepIdx() === 0">
            ← Back
          </button>
          <div class="flex items-center gap-2">
            @if (currentStepIdx() < steps.length - 1) {
              @if (steps[currentStepIdx()].optional) {
                <button class="btn-ghost" (click)="next()">Skip</button>
              }
              <button class="btn-primary" (click)="next()" [disabled]="!canAdvance()">
                Continue →
              </button>
            } @else {
              <button class="btn-primary" (click)="submit()" [disabled]="!canSubmit() || submitting()">
                @if (submitting()) {
                  <span class="spinner mr-1"></span>
                  Creating client…
                } @else {
                  ✓ Create client
                }
              </button>
            }
          </div>
        </div>
      </main>
    </div>
  `,
})
export class NewClientWizardComponent {
  private clientsSvc = inject(ClientsService);
  private keywordsSvc = inject(KeywordsService);
  private competitorsSvc = inject(CompetitorsService);
  private usersSvc = inject(UsersService);
  private packagesSvc = inject(PackagesService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  constructor() {
    if (this.auth.isManager()) {
      this.usersSvc.assignable().subscribe({
        next: (list) => this.assignableUsers.set(list),
        error: () => null,
      });
    }
    this.packagesSvc.list().subscribe({
      next: (list) => this.packages.set(list),
      error: () => this.packages.set([]),
    });
  }

  steps: WizardStep[] = [
    { key: 'basics', label: 'Basics' },
    { key: 'knowledge', label: 'Knowledge', optional: true },
    { key: 'contacts', label: 'Contacts', optional: true },
    { key: 'access', label: 'Access', optional: true },
    { key: 'baseline', label: 'Baseline KPIs', optional: true },
    { key: 'keywords', label: 'Keywords', optional: true },
    { key: 'competitors', label: 'Competitors', optional: true },
    { key: 'review', label: 'Review' },
  ];

  tierOptions: ClientTier[] = ['A', 'B', 'C'];
  intents: KeywordIntent[] = ['informational', 'commercial', 'transactional', 'navigational'];

  currentStepIdx = signal(0);
  submitting = signal(false);
  submitError = signal<string | null>(null);

  form = {
    name: '',
    url: '',
    packageId: '' as string,
    tier: '' as ClientTier | '', // legacy fallback; new clients pick a package instead
    industry: '',
    logoUrl: '',
    hoursPerCycle: 0,
    ownerId: '' as string,
  };

  packages = signal<Package[]>([]);
  selectedPackage = computed<Package | null>(() => {
    const id = this.form.packageId;
    if (!id) return null;
    return this.packages().find((p) => p._id === id) ?? null;
  });

  assignableUsers = signal<User[]>([]);

  knowledge: ClientKnowledge = {};
  contacts = signal<ClientContact[]>([{ name: '', email: '', role: '' }]);
  access: { gsc?: boolean; ga4?: boolean; gbp?: boolean; cms?: boolean; ahrefs?: boolean; semrush?: boolean; notes?: string } = {};
  accessKeys = ['gsc', 'ga4', 'gbp', 'cms', 'ahrefs', 'semrush'] as const;
  baselineKpis: Record<string, number | null | undefined> = {};
  keywords = signal<Array<Partial<Keyword>>>([{ text: '' }]);
  competitors = signal<Array<Partial<Competitor>>>([{ name: '', url: '' }]);

  kpiGroups = [
    {
      label: 'Organic traffic',
      fields: [
        { key: 'organicSessions', label: 'Organic sessions' },
        { key: 'newUsers', label: 'New users' },
        { key: 'engagementRate', label: 'Engagement rate (%)' },
        { key: 'avgEngagementTime', label: 'Avg engagement time (s)' },
        { key: 'conversions', label: 'Conversions' },
        { key: 'conversionRate', label: 'Conversion rate (%)' },
      ],
    },
    {
      label: 'Search Console',
      fields: [
        { key: 'impressions', label: 'Impressions' },
        { key: 'clicks', label: 'Clicks' },
        { key: 'ctr', label: 'CTR (%)' },
        { key: 'avgPosition', label: 'Avg position' },
        { key: 'indexedPages', label: 'Indexed pages' },
        { key: 'nonIndexedPages', label: 'Non-indexed pages' },
      ],
    },
    {
      label: 'Google Business Profile',
      fields: [
        { key: 'gbpSearches', label: 'Searches' },
        { key: 'gbpCalls', label: 'Calls' },
        { key: 'gbpDirections', label: 'Directions' },
        { key: 'gbpWebsiteClicks', label: 'Website clicks' },
        { key: 'gbpReviews', label: 'Reviews' },
      ],
    },
  ];

  hoursForTier(t: ClientTier): number {
    return HOURS_PER_TIER[t];
  }

  updateHours() {
    if (this.form.tier) this.form.hoursPerCycle = HOURS_PER_TIER[this.form.tier];
  }

  onPackagePick(packageId: string) {
    this.form.packageId = packageId;
    const pkg = this.selectedPackage();
    if (pkg?.hoursPerPeriod !== undefined) {
      this.form.hoursPerCycle = pkg.hoursPerPeriod;
    }
  }

  canAdvance(): boolean {
    if (this.currentStepIdx() === 0) {
      return !!(this.form.name.trim() && this.form.url.trim() && this.form.packageId);
    }
    return true;
  }

  canSubmit(): boolean {
    return !!(this.form.name.trim() && this.form.url.trim() && this.form.packageId);
  }

  goToStep(i: number) {
    if (i <= this.currentStepIdx() || this.canSubmit()) {
      this.currentStepIdx.set(i);
    }
  }

  next() {
    if (!this.canAdvance()) return;
    this.currentStepIdx.update((i) => Math.min(i + 1, this.steps.length - 1));
  }

  prev() {
    this.currentStepIdx.update((i) => Math.max(i - 1, 0));
  }

  addContact() {
    this.contacts.update((arr) => [...arr, { name: '', email: '', role: '' }]);
  }
  removeContact(i: number) {
    this.contacts.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  addKeyword() {
    this.keywords.update((arr) => [...arr, { text: '' }]);
  }
  removeKeyword(i: number) {
    this.keywords.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  addCompetitor() {
    this.competitors.update((arr) => [...arr, { name: '', url: '' }]);
  }
  removeCompetitor(i: number) {
    this.competitors.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  filledContactsCount(): number {
    return this.contacts().filter((c) => c.name?.trim() && c.email?.trim()).length;
  }

  accessConfirmedCount(): number {
    return this.accessKeys.filter((k) => !!(this.access as Record<string, unknown>)[k]).length;
  }

  baselineKpisFilled(): number {
    return Object.values(this.baselineKpis).filter(
      (v) => typeof v === 'number' && !Number.isNaN(v),
    ).length;
  }

  filledKeywordsCount(): number {
    return this.keywords().filter((k) => k.text?.trim()).length;
  }

  filledCompetitorsCount(): number {
    return this.competitors().filter((c) => c.name?.trim() && c.url?.trim()).length;
  }

  knowledgeFilled(): number {
    return Object.values(this.knowledge).filter((v) => v?.trim()).length;
  }

  private cleanBaseline(): ReportKpis {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.baselineKpis)) {
      if (typeof v === 'number' && !Number.isNaN(v)) out[k] = v;
    }
    return out as ReportKpis;
  }

  cancel() {
    if (
      this.form.name ||
      this.form.url ||
      this.filledKeywordsCount() ||
      this.filledCompetitorsCount()
    ) {
      if (!confirm('Discard the data you entered?')) return;
    }
    this.router.navigate(['/clients']);
  }

  submit() {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.submitError.set(null);

    const payload: Partial<Client> = {
      name: this.form.name.trim(),
      url: this.form.url.trim(),
      packageId: this.form.packageId,
      industry: this.form.industry?.trim() || undefined,
      logoUrl: this.form.logoUrl?.trim() || undefined,
      ownerId: this.form.ownerId || undefined,
      contacts: this.contacts().filter((c) => c.name?.trim() && c.email?.trim()),
      access: this.accessKeys.reduce(
        (acc, k) => {
          acc[k] = !!(this.access as Record<string, unknown>)[k];
          return acc;
        },
        { notes: this.access.notes || undefined } as Record<string, boolean | string | undefined>,
      ) as any,
      knowledge: this.knowledge,
      baselineKpis: this.cleanBaseline(),
      baselineDate: new Date(),
      active: true,
    };

    this.clientsSvc.create(payload).subscribe({
      next: (client) => {
        const clientId = client._id!;
        const kwToCreate = this.keywords().filter((k) => k.text?.trim());
        const compToCreate = this.competitors().filter(
          (c) => c.name?.trim() && c.url?.trim(),
        );

        const kwReqs = kwToCreate.map((k) =>
          this.keywordsSvc.create({ ...k, clientId } as Partial<Keyword>),
        );
        const compReqs = compToCreate.map((c) =>
          this.competitorsSvc.create({ ...c, clientId } as Partial<Competitor>),
        );

        const all = [...kwReqs, ...compReqs];
        if (!all.length) {
          this.router.navigate(['/clients', clientId]);
          return;
        }
        forkJoin(all).subscribe({
          next: () => this.router.navigate(['/clients', clientId]),
          error: () => this.router.navigate(['/clients', clientId]),
        });
      },
      error: (err) => {
        this.submitting.set(false);
        this.submitError.set(err?.error?.message || 'Could not create the client');
      },
    });
  }
}
