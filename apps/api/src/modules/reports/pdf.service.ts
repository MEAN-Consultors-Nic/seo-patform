import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmake = require('pdfmake');
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  Client,
  Cycle,
  DELIVERABLE_FREQUENCY_LABELS,
  Deliverable,
  Report,
  ReportKpis,
  ReportSectionConfig,
  ReportSectionKey,
  UNNUMBERED_REPORT_SECTIONS,
  sanitizeText,
  targetForWindow,
} from '@seo/shared';

// --- Brand palette ----------------------------------------------------------
const BRAND = '#FF7A59';
const BRAND_DARK = '#E5613D';
const INK_900 = '#0F172A';
const INK_700 = '#334155';
const INK_500 = '#6B7280';
const INK_300 = '#D1D5DA';
const INK_200 = '#E4E7EB';
const INK_100 = '#F0F2F5';
const INK_50 = '#F7F8FA';
const POSITIVE = '#16A34A';
const POSITIVE_BG = '#DCFCE7';
const DANGER = '#DC2626';
const DANGER_BG = '#FEE2E2';
const WARNING = '#D97706';
const WARNING_BG = '#FEF3C7';
const SKY = '#0EA5E9';

/**
 * Default section order when the caller doesn't pass a layout. Matches the
 * historical hard-coded order of the PDF so legacy reports look identical.
 */
const DEFAULT_PDF_LAYOUT: ReportSectionKey[] = [
  'kpi-snapshot',
  'executive-summary',
  'key-metrics',
  'search-rankings',
  'top-performing-pages',
  'ranking-movement',
  'serp-preview',
  'package-deliverables',
  'actions-taken',
  'next-period-plan',
  'backlinks-profile',
  'client-blockers',
  'final-considerations',
];

interface PdfContext {
  tasks: Array<{
    title: string;
    category: string;
    status: string;
    priority: string;
    estimatedHours?: number;
    actualHours?: number;
    notes?: string;
    description?: string;
  }>;
  keywords: Array<{
    text: string;
    group?: string;
    currentPosition?: number;
    previousPosition?: number;
    currentRankingUrl?: string;
    volume?: number;
  }>;
  gainers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
  losers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
  /** Queries ranking for the first time this period — feeds Ranking Movement. */
  fresh?: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
  /** GSC page-level rows for Top Performing Pages. Empty until snapshotting lands. */
  topPages?: Array<{ key: string; clicks: number; impressions: number; ctr: number; position: number }>;
  /** Client package + per-deliverable completed counts for the window. */
  packageInfo?: {
    name: string;
    description?: string;
    deliverables: Deliverable[];
  };
  packageProgress?: Array<{ key: string; completed: number }>;
  /** Report window start/end (used to scale weekly/monthly deliverables). */
  reportWindow?: { from: Date; to: Date };
  backlinks: {
    total: number;
    dofollow: number;
    perStatus: Array<{ _id: string; count: number; avgDr: number }>;
  };
  /**
   * Section visibility/order resolved from Settings → Report layout.
   * When omitted, every section renders in the legacy default order.
   */
  layout?: ReportSectionConfig[];
  /** Content pipeline pieces in `idea` status — for Next Period Plan. */
  contentIdeas?: Array<{ title: string; targetKeyword?: string }>;
  /** Pieces published during the cycle — for Actions Taken. */
  contentPublished?: Array<{
    title: string;
    targetKeyword?: string;
    publishedUrl?: string;
    publishedAt?: Date | string;
  }>;
  /**
   * Public share details for the live web report. When present, the
   * cover page renders a "View live report" panel with the URL and
   * (optionally) the access PIN.
   */
  share?: {
    url: string;
    pin?: string;
  };
}

/**
 * Code points above U+00FF that the PDF standard-14 fonts (Helvetica &
 * friends) can actually draw — the WinAnsiEncoding high slots 0x80–0x9F.
 * Every other non-Latin-1 code point resolves to .notdef, which pdfkit
 * measures at advance width 0: the glyph disappears AND the next
 * character is painted on top of the previous one. That is how
 * "hi-quality" came out as "hiquality" with the q sitting on the i.
 */
const WINANSI_ABOVE_LATIN1 = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6,
  0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/**
 * ASCII stand-ins for the unrenderable characters that realistically turn
 * up in pasted report copy — dashes, primes, arrows, math comparators and
 * check marks. Anything not listed here and not in WINANSI_ABOVE_LATIN1
 * is dropped rather than left to collide with its neighbour.
 */
const PDF_TRANSLITERATIONS: Record<string, string> = {
  '‐': '-', '‑': '-', '‒': '-', '―': '-',
  '′': "'", '″': '"',
  '←': '<-', '→': '->', '↔': '<->', '⇒': '=>',
  '↑': '^', '↓': 'v',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',
  // Check / cross marks read as list glyphs in practice; map to the
  // bullet (renderable) and a plain x rather than dropping them.
  '✓': '•', '✔': '•',
  '✗': 'x', '✘': 'x', '✕': 'x', '✖': 'x',
  '●': '•', '▪': '•', '▶': '>',
};

/**
 * Rewrites a single string so every character survives the standard-14
 * fonts. Beyond the non-Latin-1 sweep it also flattens U+00A0 to a plain
 * space: WinAnsiEncoding does map 0xA0 to `space`, but sloppy viewers
 * treat it as .notdef and it reaches the doc on the paths that never see
 * sanitizeText (client names, table cells, chart labels).
 *
 * Nothing else in ASCII is touched, so hex colours, data URLs, font names
 * and style keys pass through byte-identical and this is safe to run over
 * an entire doc definition.
 */
function toPdfSafe(text: string): string {
  const flat = text.includes('\u00A0') ? text.replace(/\u00A0/g, ' ') : text;
  if (!/[\u{100}-\u{10FFFF}]/u.test(flat)) return flat;
  return flat.replace(/[\u{100}-\u{10FFFF}]/gu, (ch) =>
    WINANSI_ABOVE_LATIN1.has(ch.codePointAt(0) as number)
      ? ch
      : PDF_TRANSLITERATIONS[ch] ?? '',
  );
}

/**
 * Walks a pdfmake doc definition and runs every string through
 * toPdfSafe. Applied once at the end of generate() so the guarantee holds
 * for every text path — narrative HTML, client names, table cells, chart
 * labels — instead of only the handful that remember to call a helper.
 * Header/footer are functions, so they're wrapped to sanitize whatever
 * they return per page.
 */
function makeDocPdfSafe<T>(node: T): T {
  if (typeof node === 'string') return toPdfSafe(node) as unknown as T;
  if (Array.isArray(node)) return node.map(makeDocPdfSafe) as unknown as T;
  if (typeof node === 'function') {
    const fn = node as (...a: unknown[]) => unknown;
    return ((...a: unknown[]) => makeDocPdfSafe(fn(...a))) as unknown as T;
  }
  if (node && typeof node === 'object') {
    if (node instanceof Date || Buffer.isBuffer(node)) return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = makeDocPdfSafe(v);
    return out as unknown as T;
  }
  return node;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor() {
    pdfmake.setFonts({
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });
    pdfmake.setLocalAccessPolicy(() => true);
    pdfmake.setUrlAccessPolicy(() => false);
  }

  private async fetchAsDataUrl(url: string): Promise<string | null> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/')) return null;
      if (contentType.includes('webp')) {
        this.logger.warn(`Logo in webp format not supported by pdfmake: ${url}`);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${contentType};base64,${buf.toString('base64')}`;
    } catch (err) {
      this.logger.warn(`Failed to fetch logo ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  async generate(
    client: Client,
    cycle: Cycle,
    report: Report,
    ctx: PdfContext,
  ): Promise<Buffer> {
    // Client logos disabled in the report — many client logo URLs are blocked
    // by hotlink/firewall protection, which breaks PDF generation.
    const logoDataUrl: string | null = null;

    const tierColor =
      client.tier === 'A' ? INK_900 : client.tier === 'B' ? SKY : BRAND;

    const generatedAt = new Date();

    // Cover image (uploaded via the editor). Fetched here so a slow /
    // failing Cloudinary node doesn't stall the whole PDF build. Falls
    // back to null on any error and the section renders without it.
    const coverImageDataUrl = report.coverImageUrl
      ? await this.fetchAsDataUrl(report.coverImageUrl)
      : null;

    const docDefinition = {
      pageSize: 'LETTER',
      pageMargins: [40, 70, 40, 60],
      defaultStyle: { fontSize: 9, color: INK_700, font: 'Roboto', lineHeight: 1.35 },
      info: {
        title: `SEO Report ${client.name} ${cycle.label}`,
        author: 'Media Spearhead',
        subject: `SEO Report — ${cycle.label}`,
      },
      styles: this.styles(),
      header: (currentPage: number) =>
        currentPage === 1 ? null : this.pageHeader(client, cycle),
      footer: (currentPage: number, pageCount: number) =>
        this.pageFooter(currentPage, pageCount, client, generatedAt),
      content: this.buildSections(
        client,
        cycle,
        report,
        ctx,
        logoDataUrl,
        tierColor,
        generatedAt,
        coverImageDataUrl,
      ),
    };

    const pdfDoc = pdfmake.createPdf(makeDocPdfSafe(docDefinition));
    return pdfDoc.getBuffer();
  }

  /**
   * Assemble the PDF content array honoring Settings → Report layout. The
   * layout drives both the **order** sections appear in and which sections
   * are **omitted**. Sections that the PDF doesn't currently render
   * (locations-performance) are skipped silently. Section number prefix
   * counts only visible-rendered sections so the prefix is always
   * sequential ("01", "02"…) regardless of which sections are hidden.
   */
  private buildSections(
    client: Client,
    cycle: Cycle,
    report: Report,
    ctx: PdfContext,
    logoDataUrl: string | null,
    tierColor: string,
    generatedAt: Date,
    coverImageDataUrl: string | null,
  ): unknown[] {
    const layout = ctx.layout?.length
      ? ctx.layout
      : DEFAULT_PDF_LAYOUT.map((k) => ({ key: k, visible: true }));

    const content: unknown[] = [
      this.coverPage(client, cycle, logoDataUrl, tierColor, generatedAt, ctx.share),
    ];

    let counter = 0;
    const num = () => String(++counter).padStart(2, '0');

    for (const section of layout) {
      if (!section.visible) continue;
      // Unnumbered sections (like the hero KPI snapshot) render but
      // don't advance the counter so the analytical sections keep
      // their expected "01, 02…" sequence.
      const nextNum = UNNUMBERED_REPORT_SECTIONS.includes(section.key)
        ? () => ''
        : num;
      const block = this.renderSection(
        section.key,
        nextNum,
        report,
        ctx,
        coverImageDataUrl,
        client,
      );
      if (block) content.push(...block);
    }
    return content;
  }

  private renderSection(
    key: ReportSectionKey,
    num: () => string,
    report: Report,
    ctx: PdfContext,
    coverImageDataUrl: string | null,
    client: Client,
  ): unknown[] | null {
    switch (key) {
      case 'kpi-snapshot':
        return [this.kpiSnapshotBlock(report, ctx.keywords)];
      case 'executive-summary':
        return [
          // Cover image sits at the top of the Executive Summary page.
          // Only rendered when the user uploaded an image AND the fetch
          // succeeded — silent skip otherwise so a Cloudinary hiccup
          // never breaks the whole PDF.
          ...(coverImageDataUrl
            ? [
                {
                  image: coverImageDataUrl,
                  width: 515, // Full content width for LETTER minus 40+40 margins.
                  margin: [0, 0, 0, 16] as [number, number, number, number],
                  alignment: 'center' as const,
                },
              ]
            : []),
          this.sectionHeader(num(), 'Executive Summary'),
          this.executiveSummaryBlock(report),
        ];
      case 'key-metrics':
        return [
          this.sectionHeader(num(), 'Key Metrics (KPIs)'),
          this.kpisGrid(report),
          this.kpisDetailedTable(report),
        ];
      case 'search-rankings':
        if (ctx.keywords.length === 0) return null;
        return [
          { text: '', pageBreak: 'before' as const },
          this.sectionHeader(num(), 'Keywords and positions'),
          this.keywordsSummary(ctx.keywords),
          this.keywordsTable(ctx.keywords),
          ...(ctx.gainers.length || ctx.losers.length
            ? [this.movementsTable(ctx.gainers, ctx.losers)]
            : []),
        ];
      case 'top-performing-pages':
        return [
          this.sectionHeader(num(), 'Pages driving the month'),
          this.topPagesBlock(ctx.topPages ?? []),
        ];
      case 'ranking-movement':
        return [
          this.sectionHeader(num(), 'Ranking movement'),
          this.rankingMovementBlock(
            (ctx.gainers ?? []).filter((g) => g.delta >= 2),
            ctx.fresh ?? [],
            ctx.keywords.filter(
              (k) => typeof k.currentPosition === 'number' && (k.currentPosition as number) <= 10,
            ).length,
          ),
        ];
      case 'serp-preview':
        return [
          this.sectionHeader(num(), 'How you appear on Google'),
          this.serpPreviewBlock(client, this.pickTopQuery(ctx.keywords)),
        ];
      case 'package-deliverables':
        if (!ctx.packageInfo?.deliverables?.length) return null;
        return [
          this.sectionHeader(num(), `${ctx.packageInfo.name} — deliverables`),
          this.packageDeliverablesBlock(ctx),
        ];
      case 'actions-taken': {
        const published = ctx.contentPublished ?? [];
        return [
          { text: '', pageBreak: 'before' as const },
          this.sectionHeader(num(), 'Actions Taken'),
          this.completedTasksTable(ctx.tasks),
          ...(published.length > 0
            ? [
                {
                  text: `CONTENT PUBLISHED THIS PERIOD  ·  ${published.length} live`,
                  color: INK_500,
                  fontSize: 8,
                  bold: true,
                  characterSpacing: 1.5,
                  margin: [0, 12, 0, 6],
                },
                this.contentPublishedTable(published),
              ]
            : []),
        ];
      }
      case 'next-period-plan': {
        const ideas = ctx.contentIdeas ?? [];
        return [
          this.sectionHeader(num(), 'Next Period Plan'),
          this.upcomingTasksTable(ctx.tasks),
          ...(ideas.length > 0
            ? [
                this.subsectionHeader(
                  `Content Pipeline · Ideas (${ideas.length})`,
                ),
                this.contentIdeasTable(ideas),
              ]
            : []),
        ];
      }
      case 'backlinks-profile':
        if (ctx.backlinks.total === 0) return null;
        return [
          {
            stack: [
              this.sectionHeader(num(), 'Backlinks Profile'),
              this.backlinksBlock(ctx.backlinks),
            ],
            unbreakable: true,
          },
        ];
      case 'client-blockers': {
        const text = this.htmlToText(report.clientBlockers).trim();
        if (!text) return null;
        return [
          {
            stack: [
              this.sectionHeader(num(), 'Client Pending Items'),
              {
                table: {
                  widths: ['*'],
                  body: [
                    [
                      {
                        text,
                        margin: [14, 10, 14, 10],
                        color: INK_700,
                      },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 0,
                  vLineWidth: () => 0,
                  fillColor: () => WARNING_BG,
                },
                margin: [0, 4, 0, 12],
              },
            ],
            unbreakable: true,
          },
        ];
      }
      case 'final-considerations': {
        const text = this.htmlToText(report.finalConsiderations || '').trim();
        if (!text) return null;
        return [
          {
            stack: [
              this.sectionHeader(num(), 'Final Considerations'),
              {
                text,
                color: INK_700,
                fontSize: 10,
                lineHeight: 1.5,
                margin: [0, 4, 0, 12],
              },
            ],
            unbreakable: true,
          },
        ];
      }
      case 'locations-performance':
        // Not implemented in the PDF — service areas are web-only for now.
        return null;
      default:
        return null;
    }
  }

  // --- Styles ----------------------------------------------------------------
  private styles() {
    return {
      coverTitle: { fontSize: 32, bold: true, color: INK_900, lineHeight: 1.1 },
      coverClient: { fontSize: 22, bold: true, color: INK_900 },
      coverLabel: {
        fontSize: 8,
        color: INK_500,
        bold: true,
        characterSpacing: 1,
      },
      coverValue: { fontSize: 12, color: INK_900, bold: true },
      sectionNum: {
        fontSize: 9,
        color: BRAND,
        bold: true,
        characterSpacing: 1.5,
      },
      sectionTitle: { fontSize: 18, bold: true, color: INK_900 },
      h3: { fontSize: 11, bold: true, color: INK_900 },
      meta: { fontSize: 8.5, color: INK_500 },
      kpiLabel: {
        fontSize: 7.5,
        color: INK_500,
        bold: true,
        characterSpacing: 1,
      },
      kpiValue: { fontSize: 16, bold: true, color: INK_900 },
      kpiDelta: { fontSize: 9, bold: true },
      tableHeader: {
        fontSize: 8,
        bold: true,
        color: INK_700,
        characterSpacing: 0.5,
      },
      tableCell: { fontSize: 9, color: INK_700 },
      tableCellBold: { fontSize: 9, color: INK_900, bold: true },
      badge: { fontSize: 7.5, bold: true, characterSpacing: 0.5 },
      pageNum: { fontSize: 8, color: INK_500 },
    };
  }

  // --- Cover page ------------------------------------------------------------
  private coverPage(
    client: Client,
    cycle: Cycle,
    logoDataUrl: string | null,
    tierColor: string,
    generatedAt: Date,
    share?: { url: string; pin?: string },
  ) {
    return {
      stack: [
        // Top brand band — bigger, with darker accent underline
        {
          canvas: [
            { type: 'rect', x: -40, y: -70, w: 612, h: 24, color: INK_900 },
            { type: 'rect', x: -40, y: -46, w: 612, h: 4, color: BRAND },
          ],
        },

        // Top branding — "MEDIA SPEARHEAD" small label centered top
        {
          text: 'MEDIA SPEARHEAD',
          color: INK_500,
          fontSize: 9,
          bold: true,
          characterSpacing: 3,
          alignment: 'center',
          margin: [0, 28, 0, 0],
        },

        // Decorative orange square mark
        {
          canvas: [
            { type: 'rect', x: 261, y: 12, w: 36, h: 36, color: BRAND, r: 6 },
          ],
        },
        {
          text: 'S',
          color: '#FFFFFF',
          fontSize: 22,
          bold: true,
          alignment: 'center',
          margin: [0, -33, 0, 0],
        },

        // Hero title block
        {
          stack: [
            {
              text: 'SEO REPORT',
              color: BRAND,
              fontSize: 10,
              bold: true,
              characterSpacing: 4,
              alignment: 'center',
              margin: [0, 70, 0, 18],
            },
            {
              text: client.name,
              fontSize: 38,
              bold: true,
              color: INK_900,
              alignment: 'center',
              lineHeight: 1.05,
              margin: [0, 0, 0, 12],
            },
            {
              text: client.url,
              color: SKY,
              fontSize: 11,
              alignment: 'center',
              margin: [0, 0, 0, 18],
            },
            // Decorative center divider
            {
              canvas: [
                {
                  type: 'rect',
                  x: 256,
                  y: 0,
                  w: 60,
                  h: 3,
                  color: BRAND,
                  r: 1.5,
                },
              ],
              margin: [0, 0, 0, 36],
            },
          ],
        },

        // Reporting period card — centered with subtle background
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  stack: [
                    {
                      text: 'REPORTING PERIOD',
                      color: BRAND,
                      fontSize: 9,
                      bold: true,
                      characterSpacing: 2.5,
                      alignment: 'center',
                      margin: [0, 0, 0, 10],
                    },
                    {
                      text: `${format(cycle.startDate, 'MMMM dd', { locale: enUS })} – ${format(cycle.endDate, 'MMMM dd, yyyy', { locale: enUS })}`,
                      fontSize: 18,
                      bold: true,
                      color: INK_900,
                      alignment: 'center',
                      margin: [0, 0, 0, 4],
                    },
                    {
                      text: cycle.label,
                      fontSize: 10,
                      color: INK_500,
                      alignment: 'center',
                    },
                  ],
                  margin: [20, 22, 20, 22],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            fillColor: () => INK_50,
          },
          margin: [40, 0, 40, 0],
        },

        // Live-report access panel (only when the report has been shared).
        // Sits between the reporting-period card and the footer so a
        // client opening the PDF immediately knows where to view the
        // interactive web version with charts, locations data, etc.
        ...(share ? [this.liveReportPanel(share)] : []),

        // Spacer between the cards above and the GENERATED footer.
        // Tuned so the cover fits on a single LETTER page in both
        // share/no-share variants — when the live-report panel is
        // present it already takes ~140pt, so the spacer shrinks.
        { text: '', margin: [0, share ? 40 : 110, 0, 0] },

        // Footer: generated timestamp only, right-aligned. The
        // PREPARED BY column was removed at the user's request to
        // keep the cover neutral / impersonal.
        {
          stack: [
            {
              text: 'GENERATED',
              color: INK_500,
              fontSize: 8,
              bold: true,
              characterSpacing: 1.5,
              alignment: 'right',
              margin: [0, 0, 0, 6],
            },
            {
              text: format(generatedAt, 'MMMM dd, yyyy', { locale: enUS }),
              fontSize: 11,
              color: INK_900,
              bold: true,
              alignment: 'right',
            },
            {
              text: format(generatedAt, 'HH:mm'),
              fontSize: 9,
              color: INK_500,
              alignment: 'right',
              margin: [0, 2, 0, 0],
            },
          ],
        },

        // Bottom band — matching top accent. Anchored to the actual
        // bottom of the LETTER page (792pt tall, 60pt bottom margin),
        // so the band is flush at the page edge no matter how tall the
        // cover stack ends up. Without absolutePosition the band sat at
        // the cursor and left a visible white gap below it.
        {
          absolutePosition: { x: 40, y: 758 },
          canvas: [
            { type: 'rect', x: -40, y: 0, w: 612, h: 4, color: BRAND },
            { type: 'rect', x: -40, y: 4, w: 612, h: 24, color: INK_900 },
          ],
        },
      ],
      pageBreak: 'after',
    };
  }

  /**
   * Small panel on the cover page pointing the client to the live web
   * report (charts, location data, interactive elements that don't
   * translate to a flat PDF). Rendered only when the report has a
   * shareToken so it stays out of the way for un-shared drafts.
   */
  private liveReportPanel(share: { url: string; pin?: string }) {
    const rows: unknown[] = [
      [
        {
          text: 'VIEW LIVE REPORT',
          color: BRAND,
          fontSize: 9,
          bold: true,
          characterSpacing: 2.5,
          alignment: 'center',
          margin: [0, 0, 0, 8],
        },
      ],
      [
        {
          text: 'Interactive version with charts, location data and the full activity timeline.',
          color: INK_500,
          fontSize: 9,
          italics: true,
          alignment: 'center',
          margin: [0, 0, 0, 10],
        },
      ],
      [
        {
          text: share.url,
          link: share.url,
          color: SKY,
          fontSize: 11,
          bold: true,
          alignment: 'center',
          decoration: 'underline',
          margin: [0, 0, 0, share.pin ? 8 : 0],
        },
      ],
    ];
    if (share.pin) {
      rows.push([
        {
          columns: [
            { text: '', width: '*' },
            {
              width: 'auto',
              stack: [
                {
                  text: 'ACCESS PIN',
                  color: INK_500,
                  fontSize: 8,
                  bold: true,
                  characterSpacing: 2,
                  alignment: 'center',
                  margin: [0, 0, 0, 4],
                },
                {
                  text: share.pin,
                  color: INK_900,
                  fontSize: 22,
                  bold: true,
                  characterSpacing: 4,
                  alignment: 'center',
                },
              ],
            },
            { text: '', width: '*' },
          ],
        },
      ]);
    }
    return {
      table: { widths: ['*'], body: rows },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => '#FFF7F3',
      },
      margin: [40, 14, 40, 0],
    };
  }

  // --- Page header (after cover) --------------------------------------------
  private pageHeader(client: Client, cycle: Cycle) {
    return {
      margin: [40, 30, 40, 0],
      columns: [
        {
          stack: [
            { text: client.name, fontSize: 9, bold: true, color: INK_900 },
            { text: `SEO Report · ${cycle.label}`, fontSize: 8, color: INK_500 },
          ],
        },
        {
          text: 'MEDIA SPEARHEAD',
          fontSize: 8,
          color: BRAND,
          bold: true,
          characterSpacing: 2,
          alignment: 'right',
          margin: [0, 4, 0, 0],
        },
      ],
    };
  }

  // --- Page footer -----------------------------------------------------------
  private pageFooter(
    currentPage: number,
    pageCount: number,
    client: Client,
    generatedAt: Date,
  ) {
    if (currentPage === 1) return null;
    return {
      margin: [40, 20, 40, 0],
      columns: [
        {
          text: `Report ${client.name} · ${format(generatedAt, 'MMM dd, yyyy', { locale: enUS })}`,
          style: 'pageNum',
        },
        {
          text: `${currentPage} / ${pageCount}`,
          style: 'pageNum',
          alignment: 'right',
        },
      ],
    };
  }

  // --- Section header --------------------------------------------------------
  private sectionHeader(num: string, title: string) {
    return {
      stack: [
        { text: num, style: 'sectionNum' },
        { text: title, style: 'sectionTitle', margin: [0, 2, 0, 6] },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 40,
              y2: 0,
              lineWidth: 2,
              lineColor: BRAND,
            },
          ],
        },
      ],
      margin: [0, 16, 0, 14],
    };
  }

  /**
   * Same visual weight as sectionHeader (bold title + coral underline)
   * but no section number — used for sub-sections that sit inside a
   * numbered parent section, like Content Pipeline Ideas nested under
   * Next Period Plan. Keeps the number sequence intact while still
   * giving the sub-block a strong, scannable heading.
   */
  private subsectionHeader(title: string) {
    return {
      stack: [
        { text: title, style: 'sectionTitle', margin: [0, 0, 0, 6] },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 40,
              y2: 0,
              lineWidth: 2,
              lineColor: BRAND,
            },
          ],
        },
      ],
      margin: [0, 20, 0, 12],
    };
  }

  // --- Executive summary -----------------------------------------------------

  /**
   * Strips HTML tags and decodes entities for plain-text rendering inside
   * pdfmake. Runs the shared sanitizeText pipeline first so every flavour
   * of invisible / Unicode-space contamination is normalized before tags
   * are stripped.
   *
   * Intra-word hyphens are deliberately left as plain U+002D. An earlier
   * version swapped them for U+2011 (non-breaking hyphen) to stop
   * "high-priority" wrapping mid-word, but the standard-14 fonts carry no
   * glyph for U+2011 and pdfkit measures the miss at width 0 — the hyphen
   * vanished and the next letter was drawn on top of the previous one
   * ("hi-quality" -> "hiquality"). Breaking after a hyphen is ordinary
   * typography; a collapsed word is data corruption. See toPdfSafe for
   * the general guard.
   */
  private htmlToText(html: string | undefined | null): string {
    if (!html) return '';
    if (typeof html !== 'string') return '';
    return sanitizeText(html)
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private executiveSummaryBlock(report: Report) {
    let summaryText = '';
    const raw = report.executiveSummary as unknown;
    if (Array.isArray(raw)) summaryText = raw.join(' ');
    else if (typeof raw === 'string') summaryText = this.htmlToText(raw);
    if (!summaryText.trim()) summaryText = 'No executive summary registered for this period.';

    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: summaryText,
              color: INK_700,
              fontSize: 11,
              lineHeight: 1.55,
              margin: [16, 14, 16, 14],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? 3 : 0),
        vLineColor: () => BRAND,
        fillColor: () => INK_50,
      },
      margin: [0, 0, 0, 14],
    };
  }

  // --- Up/down arrow icons (drawn as canvas to avoid unicode font issues) ---
  private upArrow(color: string = POSITIVE, size = 5) {
    return {
      canvas: [
        {
          type: 'polyline',
          closePath: true,
          points: [
            { x: 0, y: size },
            { x: size, y: size },
            { x: size / 2, y: 0 },
          ],
          color,
        },
      ],
      width: size,
    };
  }

  private downArrow(color: string = DANGER, size = 5) {
    return {
      canvas: [
        {
          type: 'polyline',
          closePath: true,
          points: [
            { x: 0, y: 0 },
            { x: size, y: 0 },
            { x: size / 2, y: size },
          ],
          color,
        },
      ],
      width: size,
    };
  }

  // --- KPIs grid (Ahrefs-style cards) ---------------------------------------
  private kpisGrid(report: Report) {
    const main: Array<[keyof ReportKpis, string]> = [
      ['organicSessions', 'Organic sessions'],
      ['impressions', 'Impressions'],
      ['clicks', 'Clicks'],
      ['ctr', 'CTR (%)'],
      ['avgPosition', 'Avg position'],
      ['conversions', 'Conversions'],
    ];
    const showCompare = (report as { comparePeriods?: boolean }).comparePeriods !== false;
    const hidden = new Set(
      (report as { hiddenKpis?: string[] }).hiddenKpis ?? [],
    );
    const cards = main
      .filter(([k]) => !hidden.has(k))
      .filter(([k]) => report.kpis?.[k] !== undefined || report.kpisPrevious?.[k] !== undefined)
      .map(([k, label]) =>
        this.kpiCard(
          label,
          report.kpis?.[k],
          showCompare ? report.kpisPrevious?.[k] : undefined,
          k === 'avgPosition',
          showCompare,
        ),
      );

    if (!cards.length) {
      return {
        text: 'No KPIs registered for this period.',
        style: 'meta',
        margin: [0, 0, 0, 12],
        italics: true,
      };
    }

    // Layout as 3 cards per row
    const rows: unknown[] = [];
    for (let i = 0; i < cards.length; i += 3) {
      rows.push({
        columns: cards.slice(i, i + 3),
        columnGap: 8,
        margin: [0, 0, 0, 8],
      });
    }
    return { stack: rows };
  }

  private kpiCard(
    label: string,
    current?: number,
    previous?: number,
    inverse = false,
    showCompare = true,
  ) {
    let deltaText: string | null = null;
    let deltaColor = INK_500;
    let isUp = false;
    if (typeof current === 'number' && typeof previous === 'number' && previous !== 0) {
      const pct = ((current - previous) / previous) * 100;
      isUp = current > previous;
      const good = inverse ? !isUp : isUp;
      deltaText = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
      deltaColor = good ? POSITIVE : DANGER;
    }

    const deltaRow = deltaText
      ? {
          columns: [
            isUp ? this.upArrow(deltaColor, 6) : this.downArrow(deltaColor, 6),
            {
              text: ` ${deltaText}`,
              color: deltaColor,
              style: 'kpiDelta',
            },
          ],
          margin: [0, 4, 0, 0],
        }
      : showCompare
        ? {
            text: 'no previous period',
            style: 'meta',
            margin: [0, 4, 0, 0],
          }
        : { text: '', margin: [0, 0, 0, 0] };

    return {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: label.toUpperCase(),
                  style: 'kpiLabel',
                  margin: [0, 0, 0, 4],
                },
                {
                  text: this.formatNumber(current),
                  style: 'kpiValue',
                },
                deltaRow,
              ],
              margin: [12, 10, 12, 10],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => INK_200,
        vLineColor: () => INK_200,
        fillColor: () => '#FFFFFF',
      },
    };
  }

  private kpisDetailedTable(report: Report) {
    const labels: Array<[keyof ReportKpis, string, boolean?]> = [
      ['organicSessions', 'Organic sessions'],
      ['impressions', 'Impressions (GSC)'],
      ['clicks', 'Clicks (GSC)'],
      ['ctr', 'CTR (%)'],
      ['avgPosition', 'Avg position', true],
      ['conversions', 'Conversions'],
      ['indexedPages', 'Indexed pages'],
      ['gbpSearches', 'GBP — Searches'],
      ['gbpCalls', 'GBP — Calls'],
      ['gbpDirections', 'GBP — Directions'],
      ['gbpWebsiteClicks', 'GBP — Website clicks'],
      ['gbpReviews', 'GBP — New reviews'],
    ];
    const hidden2 = new Set(
      (report as { hiddenKpis?: string[] }).hiddenKpis ?? [],
    );
    const rows = labels
      .filter(([k]) => !hidden2.has(k as string))
      .filter(
        ([k]) => report.kpis?.[k] !== undefined || report.kpisPrevious?.[k] !== undefined,
      )
      .map(([k, label, inverse]) => {
        const current = report.kpis?.[k];
        const previous = report.kpisPrevious?.[k];
        let deltaCell: unknown = { text: '—', style: 'tableCell', alignment: 'right' };
        if (typeof current === 'number' && typeof previous === 'number' && previous !== 0) {
          const pct = ((current - previous) / previous) * 100;
          const isUp = current > previous;
          const good = inverse ? !isUp : isUp;
          const deltaColor = good ? POSITIVE : DANGER;
          deltaCell = {
            columns: [
              { text: '', width: '*' },
              isUp ? this.upArrow(deltaColor, 5) : this.downArrow(deltaColor, 5),
              {
                text: ` ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
                color: deltaColor,
                bold: true,
                fontSize: 9,
                width: 'auto',
              },
            ],
          };
        }
        return [
          { text: label, style: 'tableCell' },
          { text: this.formatNumber(current), style: 'tableCellBold', alignment: 'right' },
          { text: this.formatNumber(previous), style: 'tableCell', alignment: 'right' },
          deltaCell,
        ];
      });

    if (!rows.length) return { text: '' };

    return {
      table: {
        widths: ['*', 60, 60, 80],
        headerRows: 1,
        body: [
          [
            { text: 'METRIC', style: 'tableHeader' },
            { text: 'CURRENT', style: 'tableHeader', alignment: 'right' },
            { text: 'PREVIOUS', style: 'tableHeader', alignment: 'right' },
            { text: 'CHANGE', style: 'tableHeader', alignment: 'right' },
          ],
          ...rows,
        ],
      },
      layout: this.zebraTableLayout(),
      margin: [0, 14, 0, 0],
    };
  }

  // --- Keywords --------------------------------------------------------------
  private keywordsSummary(keywords: PdfContext['keywords']) {
    const ranked = keywords.filter((k) => typeof k.currentPosition === 'number');
    const top3 = ranked.filter((k) => (k.currentPosition || 999) <= 3).length;
    const top10 = ranked.filter((k) => (k.currentPosition || 999) <= 10).length;
    const avg = ranked.length
      ? ranked.reduce((acc, k) => acc + (k.currentPosition || 0), 0) / ranked.length
      : null;

    return {
      columns: [
        this.kpiCard('Total keywords', keywords.length),
        this.kpiCard('Top 3', top3),
        this.kpiCard('Top 10', top10),
        this.kpiCard('Avg position', avg ?? undefined, undefined, true),
      ],
      columnGap: 8,
      margin: [0, 0, 0, 12],
    };
  }

  private keywordsTable(keywords: PdfContext['keywords']) {
    const sorted = [...keywords].sort(
      (a, b) => (a.currentPosition ?? 999) - (b.currentPosition ?? 999),
    );
    const top = sorted.slice(0, 20);

    const rows = top.map((k) => {
      const pos = k.currentPosition;
      const prev = k.previousPosition;
      let deltaCell: unknown = { text: '—', style: 'tableCell', alignment: 'right' };
      if (typeof pos === 'number' && typeof prev === 'number' && pos !== prev) {
        const diff = prev - pos;
        const isUp = diff > 0;
        const color = isUp ? POSITIVE : DANGER;
        deltaCell = {
          columns: [
            { text: '', width: '*' },
            isUp ? this.upArrow(color, 5) : this.downArrow(color, 5),
            {
              text: ` ${Math.abs(diff)}`,
              color,
              bold: true,
              fontSize: 9,
              width: 'auto',
            },
          ],
        };
      }
      const posColor =
        pos === undefined
          ? INK_500
          : pos <= 3
            ? POSITIVE
            : pos <= 10
              ? SKY
              : pos <= 20
                ? WARNING
                : INK_700;
      return [
        { text: k.text, style: 'tableCellBold' },
        { text: k.group || '—', style: 'tableCell' },
        { text: k.volume?.toString() || '—', style: 'tableCell', alignment: 'right' },
        {
          text: pos !== undefined ? pos.toString() : '—',
          color: posColor,
          bold: true,
          fontSize: 10,
          alignment: 'right',
        },
        { text: prev?.toString() || '—', style: 'tableCell', alignment: 'right' },
        deltaCell,
        {
          text: k.currentRankingUrl ? this.shortenUrl(k.currentRankingUrl) : '—',
          style: 'tableCell',
          fontSize: 8,
        },
      ];
    });

    const headerLabel = top.length === 1 ? '1 keyword tracked' : `Top ${top.length} keywords by position`;

    return {
      stack: [
        {
          text: headerLabel,
          style: 'h3',
          margin: [0, 4, 0, 6],
        },
        {
          table: {
            widths: ['*', 50, 40, 30, 35, 50, 130],
            headerRows: 1,
            body: [
              [
                { text: 'KEYWORD', style: 'tableHeader' },
                { text: 'GROUP', style: 'tableHeader' },
                { text: 'VOL.', style: 'tableHeader', alignment: 'right' },
                { text: 'POS.', style: 'tableHeader', alignment: 'right' },
                { text: 'PREV.', style: 'tableHeader', alignment: 'right' },
                { text: 'CHANGE', style: 'tableHeader', alignment: 'right' },
                { text: 'RANKING URL', style: 'tableHeader' },
              ],
              ...rows,
            ],
          },
          layout: this.zebraTableLayout(),
        },
      ],
      margin: [0, 0, 0, 14],
    };
  }

  private movementsTable(
    gainers: PdfContext['gainers'],
    losers: PdfContext['losers'],
  ) {
    const gainerDelta = (delta: number) => ({
      columns: [
        { text: '', width: '*' },
        this.upArrow(POSITIVE, 5),
        { text: ` ${delta}`, color: POSITIVE, bold: true, fontSize: 9, width: 'auto' },
      ],
    });
    const loserDelta = (delta: number) => ({
      columns: [
        { text: '', width: '*' },
        this.downArrow(DANGER, 5),
        { text: ` ${Math.abs(delta)}`, color: DANGER, bold: true, fontSize: 9, width: 'auto' },
      ],
    });

    return {
      columns: [
        {
          stack: [
            {
              text: 'KEYWORDS WITH IMPROVED POSITION',
              color: POSITIVE,
              bold: true,
              fontSize: 9,
              characterSpacing: 0.5,
              margin: [0, 0, 0, 6],
            },
            {
              table: {
                widths: ['*', 40, 30],
                body: [
                  [
                    { text: 'KEYWORD', style: 'tableHeader' },
                    { text: 'CHANGE', style: 'tableHeader', alignment: 'right' },
                    { text: 'POS.', style: 'tableHeader', alignment: 'right' },
                  ],
                  ...gainers.slice(0, 5).map((g) => [
                    { text: g.keyword.text, style: 'tableCellBold' },
                    gainerDelta(g.delta),
                    {
                      text: g.keyword.currentPosition?.toString() || '—',
                      style: 'tableCell',
                      alignment: 'right',
                    },
                  ]),
                ],
              },
              layout: this.zebraTableLayout(POSITIVE_BG),
            },
          ],
        },
        {
          stack: [
            {
              text: 'KEYWORDS WITH DROPPED POSITION',
              color: DANGER,
              bold: true,
              fontSize: 9,
              characterSpacing: 0.5,
              margin: [0, 0, 0, 6],
            },
            losers.length
              ? {
                  table: {
                    widths: ['*', 40, 30],
                    body: [
                      [
                        { text: 'KEYWORD', style: 'tableHeader' },
                        { text: 'CHANGE', style: 'tableHeader', alignment: 'right' },
                        { text: 'POS.', style: 'tableHeader', alignment: 'right' },
                      ],
                      ...losers.slice(0, 5).map((l) => [
                        { text: l.keyword.text, style: 'tableCellBold' },
                        loserDelta(l.delta),
                        {
                          text: l.keyword.currentPosition?.toString() || '—',
                          style: 'tableCell',
                          alignment: 'right',
                        },
                      ]),
                    ],
                  },
                  layout: this.zebraTableLayout(DANGER_BG),
                }
              : {
                  text: 'No keyword dropped in position during this period.',
                  style: 'meta',
                  italics: true,
                  margin: [0, 6, 0, 0],
                },
          ],
        },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 12],
    };
  }

  // --- KPI snapshot (unnumbered hero row) ----------------------------------

  private kpiSnapshotBlock(report: Report, keywords: PdfContext['keywords']) {
    const kpis = report.kpis || ({} as ReportKpis);
    const prev = report.kpisPrevious || ({} as ReportKpis);
    const show = report.comparePeriods !== false;
    const fmtInt = (n: number) =>
      new Intl.NumberFormat('en-US').format(Math.round(n));
    const fmtPos = (n: number) => n.toFixed(1);

    type Card = {
      label: string;
      current: string;
      previous: string;
      delta: string;
      good: boolean;
      hasDelta: boolean;
    };
    const cards: Card[] = [];
    const push = (
      label: string,
      current: number | undefined,
      previous: number | undefined,
      opts: { format: (n: number) => string; lowerIsBetter?: boolean },
    ) => {
      if (typeof current !== 'number') return;
      const hasPrev = typeof previous === 'number' && show;
      if (!hasPrev) {
        cards.push({
          label,
          current: opts.format(current),
          previous: '',
          delta: '',
          good: true,
          hasDelta: false,
        });
        return;
      }
      const p = previous!;
      const pct = p === 0 ? null : ((current - p) / Math.abs(p)) * 100;
      const sign = current > p ? 1 : current < p ? -1 : 0;
      const good = opts.lowerIsBetter ? sign <= 0 : sign >= 0;
      const arrow = sign > 0 ? '▲' : sign < 0 ? '▼' : '·';
      cards.push({
        label,
        current: opts.format(current),
        previous: opts.format(p),
        delta:
          pct === null ? `${arrow} —` : `${arrow} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
        good,
        hasDelta: true,
      });
    };

    push('Clicks', kpis.clicks, prev.clicks, { format: fmtInt });
    push('Impressions', kpis.impressions, prev.impressions, { format: fmtInt });
    push('Avg position', kpis.avgPosition, prev.avgPosition, {
      format: fmtPos,
      lowerIsBetter: true,
    });
    const currentTop10 = keywords.filter(
      (k) => typeof k.currentPosition === 'number' && (k.currentPosition as number) <= 10,
    ).length;
    const previousTop10 = keywords.filter(
      (k) => typeof k.previousPosition === 'number' && (k.previousPosition as number) <= 10,
    ).length;
    push('Top-10 keywords', currentTop10, show ? previousTop10 : undefined, {
      format: (n) => String(n),
    });

    if (cards.length === 0) return { text: '', margin: [0, 0, 0, 0] as [number, number, number, number] };

    const columns = cards.map((c) => ({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: c.label.toUpperCase(), color: INK_500, fontSize: 7, bold: true, characterSpacing: 1 },
                { text: c.current, color: INK_900, fontSize: 18, bold: true, margin: [0, 2, 0, 2] as [number, number, number, number] },
                c.hasDelta
                  ? {
                      text: `${c.delta}  ·  prev ${c.previous}`,
                      color: c.good ? POSITIVE : DANGER,
                      fontSize: 7,
                      bold: true,
                    }
                  : { text: 'no previous period', color: INK_500, fontSize: 7, italics: true },
              ],
              margin: [8, 8, 8, 8] as [number, number, number, number],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => INK_200,
        vLineColor: () => INK_200,
      },
    }));

    return {
      columns,
      columnGap: 6,
      margin: [0, 0, 0, 14] as [number, number, number, number],
    };
  }

  // --- Top-performing pages / Ranking movement / SERP preview --------------

  private topPagesBlock(pages: NonNullable<PdfContext['topPages']>) {
    if (!pages.length) {
      return {
        text: 'No page-level data available for this period.',
        style: 'meta',
        italics: true,
        alignment: 'center' as const,
        margin: [0, 12, 0, 12],
      };
    }
    const body: unknown[] = [
      [
        { text: 'Page', style: 'th' },
        { text: 'Clicks', style: 'th', alignment: 'right' as const },
        { text: 'Impr.', style: 'th', alignment: 'right' as const },
        { text: 'CTR', style: 'th', alignment: 'right' as const },
        { text: 'Pos.', style: 'th', alignment: 'right' as const },
      ],
    ];
    for (const p of pages) {
      body.push([
        { text: p.key, style: 'td', fontSize: 8 },
        { text: this.formatNumber(p.clicks), style: 'td', alignment: 'right' as const },
        { text: this.formatNumber(p.impressions), style: 'td', alignment: 'right' as const },
        { text: `${p.ctr.toFixed(1)}%`, style: 'td', alignment: 'right' as const },
        { text: p.position.toFixed(1), style: 'td', alignment: 'right' as const },
      ]);
    }
    return {
      table: { widths: ['*', 50, 55, 45, 40], body, headerRows: 1 },
      layout: this.zebraTableLayout(),
      margin: [0, 4, 0, 12],
    };
  }

  private rankingMovementBlock(
    majorWins: PdfContext['gainers'],
    newRankings: NonNullable<PdfContext['fresh']>,
    top10Count: number,
  ) {
    const kpiCard = (n: number, title: string, subtitle: string, tint: string) => ({
      table: {
        widths: [30, '*'],
        body: [
          [
            {
              text: String(n),
              fontSize: 18,
              bold: true,
              color: tint,
              alignment: 'center' as const,
              margin: [0, 4, 0, 4] as [number, number, number, number],
            },
            {
              stack: [
                { text: title, bold: true, color: INK_900, fontSize: 9 },
                { text: subtitle, color: INK_500, fontSize: 7 },
              ],
              margin: [4, 6, 0, 0] as [number, number, number, number],
            },
          ],
        ],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => INK_200 },
      margin: [0, 0, 0, 0],
    });

    const tableFor = (
      title: string,
      subtitle: string,
      rows: PdfContext['gainers'],
      showDelta: boolean,
    ) => {
      const body: unknown[] = [
        [
          { text: 'Query', style: 'th' },
          ...(showDelta ? [{ text: 'Movement', style: 'th', alignment: 'right' as const }] : []),
          { text: 'Pos.', style: 'th', alignment: 'right' as const },
        ],
      ];
      if (rows.length === 0) {
        body.push([
          {
            text: 'No data for this period.',
            colSpan: showDelta ? 3 : 2,
            style: 'meta',
            italics: true,
            alignment: 'center' as const,
          },
          ...(showDelta ? [{}, {}] : [{}]),
        ]);
      } else {
        for (const r of rows) {
          const row: unknown[] = [{ text: r.keyword.text, style: 'td' }];
          if (showDelta) row.push({ text: `+${r.delta}`, style: 'td', color: POSITIVE, bold: true, alignment: 'right' as const });
          row.push({ text: String(r.keyword.currentPosition ?? '—'), style: 'td', alignment: 'right' as const });
          body.push(row);
        }
      }
      return {
        stack: [
          { text: title, bold: true, color: INK_900, fontSize: 10, margin: [0, 6, 0, 0] as [number, number, number, number] },
          { text: subtitle, color: INK_500, fontSize: 8, margin: [0, 0, 0, 4] as [number, number, number, number] },
          {
            table: {
              widths: showDelta ? ['*', 60, 40] : ['*', 40],
              body,
              headerRows: 1,
            },
            layout: this.zebraTableLayout(),
          },
        ],
        margin: [0, 0, 0, 10] as [number, number, number, number],
      };
    };

    return {
      stack: [
        {
          columns: [
            kpiCard(majorWins.length, 'Major ranking wins', 'moved up ≥2 positions', SKY),
            kpiCard(newRankings.length, 'New rankings', 'newly tracked keywords', POSITIVE),
            kpiCard(top10Count, 'Top-10 keywords', 'positions #1–#10', WARNING),
          ],
          columnGap: 8,
          margin: [0, 4, 0, 10],
        },
        tableFor('Major ranking wins', 'Existing keywords that climbed this period', majorWins, true),
        tableFor('Newly ranking keywords', 'Queries ranking this period for the first time', newRankings, false),
      ],
      margin: [0, 0, 0, 12],
    };
  }

  private pickTopQuery(keywords: PdfContext['keywords']): string {
    if (!keywords.length) return 'your top query';
    const ranked = [...keywords]
      .filter((k) => typeof k.currentPosition === 'number')
      .sort((a, b) => (a.currentPosition ?? 999) - (b.currentPosition ?? 999));
    return ranked[0]?.text || keywords[0]?.text || 'your top query';
  }

  private serpPreviewBlock(client: Client, query: string) {
    const domain =
      (client.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ||
      'yourdomain.com';
    return {
      stack: [
        {
          text: `Live SERP for "${query}".`,
          color: INK_500,
          fontSize: 9,
          italics: true,
          margin: [0, 0, 0, 8] as [number, number, number, number],
        },
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  stack: [
                    { text: `Google  ·  ${query}`, color: INK_500, fontSize: 9, margin: [0, 0, 0, 6] as [number, number, number, number] },
                    { text: 'All   Images   Maps   News   Videos   Shopping', color: INK_500, fontSize: 7, margin: [0, 0, 0, 8] as [number, number, number, number] },
                    { text: `${domain}  ·  ${domain}`, color: INK_700, fontSize: 8 },
                    {
                      text: `${client.name} — organic listing`,
                      color: SKY,
                      fontSize: 12,
                      bold: true,
                      margin: [0, 2, 0, 2] as [number, number, number, number],
                    },
                    {
                      text: 'We track this listing through Search Console. Replace with a live SERP screenshot before sending to show the client exactly how they appear today.',
                      color: INK_700,
                      fontSize: 8,
                    },
                  ],
                  margin: [10, 10, 10, 10],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => INK_200,
            vLineColor: () => INK_200,
          },
          margin: [0, 0, 0, 12] as [number, number, number, number],
        },
      ],
    };
  }

  // --- Package deliverables (with progress) --------------------------------

  private packageDeliverablesBlock(ctx: PdfContext) {
    const info = ctx.packageInfo!;
    const progress = new Map<string, number>();
    for (const p of ctx.packageProgress ?? []) progress.set(p.key, p.completed);
    const windowDays = ctx.reportWindow
      ? Math.max(
          0,
          Math.round(
            (ctx.reportWindow.to.getTime() - ctx.reportWindow.from.getTime()) /
              86400000,
          ) + 1,
        )
      : 0;

    const body: unknown[] = [
      [
        { text: 'Deliverable', style: 'th' },
        { text: 'Target', style: 'th', alignment: 'right' as const },
        { text: 'Completed', style: 'th', alignment: 'right' as const },
        { text: 'Progress', style: 'th', alignment: 'right' as const },
      ],
    ];
    for (const del of info.deliverables) {
      const target = targetForWindow(del, windowDays);
      const completed = progress.get(del.key) ?? 0;
      const pct = target > 0 ? Math.round((completed / target) * 100) : 0;
      const color = pct >= 100 ? POSITIVE : pct >= 50 ? SKY : WARNING;
      body.push([
        {
          stack: [
            { text: del.label, style: 'td', bold: true },
            {
              text: `${del.quantity} ${del.unit} · ${DELIVERABLE_FREQUENCY_LABELS[del.frequency]}`,
              style: 'meta',
              fontSize: 8,
            },
          ],
        },
        {
          text: `${target} ${del.unit}`,
          style: 'td',
          alignment: 'right' as const,
        },
        {
          text: String(completed),
          style: 'td',
          alignment: 'right' as const,
        },
        {
          text: `${pct}%`,
          style: 'td',
          alignment: 'right' as const,
          color,
          bold: true,
        },
      ]);
    }
    const blocks: unknown[] = [];
    if (info.description) {
      blocks.push({
        text: info.description,
        color: INK_500,
        fontSize: 9,
        italics: true,
        margin: [0, 0, 0, 6] as [number, number, number, number],
      });
    }
    blocks.push({
      table: {
        widths: ['*', 60, 60, 50],
        body,
        headerRows: 1,
      },
      layout: this.zebraTableLayout(),
      margin: [0, 0, 0, 12] as [number, number, number, number],
    });
    return { stack: blocks };
  }

  // --- Tasks -----------------------------------------------------------------
  private completedTasksTable(tasks: PdfContext['tasks']) {
    // Actions Taken covers everything that consumed period effort:
    // completed tasks AND in-progress tasks (they've been worked on
    // during the period even though they didn't close). The in-progress
    // ones get an inline 'IN PROGRESS' tag so the reader can tell the
    // difference without hunting.
    const done = tasks.filter((t) => t.status === 'completed');
    const inProgress = tasks.filter((t) => t.status === 'in_progress');
    const actions = [...done, ...inProgress];
    if (!actions.length) {
      return {
        text: 'No actions worked on in this period.',
        style: 'meta',
        italics: true,
        margin: [0, 0, 0, 12],
      };
    }

    const summaryParts: string[] = [];
    if (done.length)
      summaryParts.push(
        `${done.length} completed`,
      );
    if (inProgress.length)
      summaryParts.push(
        `${inProgress.length} in progress`,
      );
    const summary = `${summaryParts.join(' · ')} in this period`;

    return {
      stack: [
        {
          text: summary,
          style: 'h3',
          margin: [0, 0, 0, 8],
        },
        {
          table: {
            widths: [80, '*'],
            headerRows: 1,
            body: [
              [
                { text: 'CATEGORY', style: 'tableHeader' },
                { text: 'ACTION', style: 'tableHeader' },
              ],
              ...actions.map((t) => {
                const desc = this.htmlToText(t.description).trim();
                const titleRow: unknown[] = [
                  { text: t.title, style: 'tableCellBold' },
                ];
                if (t.status === 'in_progress') {
                  titleRow.push({
                    text: ' IN PROGRESS ',
                    color: '#B45309',
                    background: '#FEF3C7',
                    fontSize: 7,
                    bold: true,
                    characterSpacing: 0.8,
                    margin: [4, 0, 0, 0],
                  });
                }
                return [
                  this.categoryBadge(t.category),
                  {
                    stack: [
                      { text: titleRow },
                      ...(desc
                        ? [
                            {
                              text: desc,
                              style: 'tableCell',
                              margin: [0, 3, 0, 0],
                            },
                          ]
                        : []),
                      ...(t.notes
                        ? [
                            {
                              text: t.notes,
                              style: 'meta',
                              italics: true,
                              margin: [0, 2, 0, 0],
                            },
                          ]
                        : []),
                    ],
                  },
                ];
              }),
            ],
          },
          layout: this.zebraTableLayout(),
        },
      ],
      margin: [0, 0, 0, 14],
    };
  }

  private upcomingTasksTable(tasks: PdfContext['tasks']) {
    // Only pending + blocked belong here — in-progress already
    // consumed period effort and lives in Actions Taken above.
    const planned = tasks.filter(
      (t) => t.status === 'pending' || t.status === 'blocked',
    );
    if (!planned.length) {
      return {
        text: 'No pending actions in the pipeline.',
        style: 'meta',
        italics: true,
        margin: [0, 0, 0, 12],
      };
    }

    const high = planned.filter((t) => t.priority === 'high');
    const medium = planned.filter((t) => t.priority === 'medium');
    const low = planned.filter((t) => t.priority === 'low');

    const rows = [...high, ...medium, ...low].map((t) => {
      const desc = this.htmlToText(t.description).trim();
      return [
        this.priorityBadge(t.priority),
        this.categoryBadge(t.category),
        {
          stack: [
            { text: t.title, style: 'tableCellBold' },
            ...(desc
              ? [
                  {
                    text: desc,
                    style: 'tableCell',
                    margin: [0, 3, 0, 0],
                  },
                ]
              : []),
          ],
        },
      ];
    });

    return {
      stack: [
        {
          text: `${planned.length} actions planned for next cycle`,
          style: 'h3',
          margin: [0, 0, 0, 8],
        },
        {
          table: {
            widths: [55, 70, '*'],
            headerRows: 1,
            body: [
              [
                { text: 'PRIORITY', style: 'tableHeader' },
                { text: 'CATEGORY', style: 'tableHeader' },
                { text: 'ACTION', style: 'tableHeader' },
              ],
              ...rows,
            ],
          },
          layout: this.zebraTableLayout(),
        },
      ],
      margin: [0, 0, 0, 14],
    };
  }

  // --- Content pipeline (Next Period Plan + Actions Taken) -------------------

  private contentIdeasTable(
    ideas: NonNullable<PdfContext['contentIdeas']>,
  ): unknown {
    return {
      table: {
        widths: ['*', 220],
        headerRows: 1,
        body: [
          [
            { text: 'PIECE TITLE', style: 'tableHeader' },
            { text: 'TARGET KEYWORD', style: 'tableHeader' },
          ],
          ...ideas.map((p) => [
            { text: p.title, style: 'tableCell' },
            {
              // Emoji glyphs aren't in Helvetica — they overlap with the
              // text in the PDF. Use plain text instead.
              text: p.targetKeyword || '—',
              style: 'tableCell',
              color: p.targetKeyword ? BRAND : INK_500,
            },
          ]),
        ],
      },
      layout: this.zebraTableLayout(),
      margin: [0, 0, 0, 14],
    };
  }

  private contentPublishedTable(
    published: NonNullable<PdfContext['contentPublished']>,
  ): unknown {
    return {
      table: {
        widths: ['*', 180, 80],
        headerRows: 1,
        body: [
          [
            { text: 'PIECE TITLE', style: 'tableHeader' },
            { text: 'TARGET KEYWORD', style: 'tableHeader' },
            { text: 'PUBLISHED', style: 'tableHeader', alignment: 'right' },
          ],
          ...published.map((p) => [
            p.publishedUrl
              ? {
                  text: p.title,
                  link: p.publishedUrl,
                  color: BRAND,
                  decoration: 'underline',
                  style: 'tableCell',
                }
              : { text: p.title, style: 'tableCell' },
            {
              text: p.targetKeyword || '—',
              style: 'tableCell',
              color: p.targetKeyword ? BRAND : INK_500,
            },
            {
              text: p.publishedAt
                ? format(new Date(p.publishedAt), 'MMM d, yyyy', { locale: enUS })
                : '—',
              style: 'tableCell',
              alignment: 'right',
              color: INK_500,
            },
          ]),
        ],
      },
      layout: this.zebraTableLayout(),
      margin: [0, 0, 0, 14],
    };
  }

  // --- Backlinks -------------------------------------------------------------
  private backlinksBlock(backlinks: PdfContext['backlinks']) {
    const live = backlinks.perStatus.find((s) => s._id === 'live');
    const lost = backlinks.perStatus.find((s) => s._id === 'lost');
    const pending = backlinks.perStatus.find((s) => s._id === 'pending');

    return {
      columns: [
        this.kpiCard('Total backlinks', backlinks.total),
        this.kpiCard('Dofollow', backlinks.dofollow),
        this.kpiCard('Live', live?.count || 0),
        this.kpiCard('Avg DR', live?.avgDr),
      ],
      columnGap: 8,
      margin: [0, 0, 0, 14],
    };
  }

  // --- Helpers ---------------------------------------------------------------
  private categoryBadge(category: string) {
    const colorMap: Record<string, [string, string]> = {
      technical: [INK_900, '#E2E8F0'],
      onpage: [SKY, '#E0F2FE'],
      content: [BRAND, '#FFE3DA'],
      offpage: [WARNING, WARNING_BG],
      'local-gbp': [POSITIVE, POSITIVE_BG],
      monitoring: [INK_700, INK_100],
      reporting: ['#7C3AED', '#EDE9FE'],
    };
    const [color, bg] = colorMap[category] || [INK_700, INK_100];
    return {
      text: category.toUpperCase(),
      style: 'badge',
      color,
      fillColor: bg,
      alignment: 'center',
      margin: [0, 2, 0, 2],
    };
  }

  private priorityBadge(priority: string) {
    const map: Record<string, [string, string, string]> = {
      high: [DANGER, DANGER_BG, 'HIGH'],
      medium: [WARNING, WARNING_BG, 'MEDIUM'],
      low: [INK_500, INK_100, 'LOW'],
    };
    const [color, bg, label] = map[priority] || [INK_500, INK_100, priority];
    return {
      text: label,
      style: 'badge',
      color,
      fillColor: bg,
      alignment: 'center',
      margin: [0, 2, 0, 2],
    };
  }

  private zebraTableLayout(headerBg: string = INK_50) {
    return {
      hLineWidth: (i: number) => (i === 1 ? 1 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => INK_200,
      fillColor: (rowIndex: number) =>
        rowIndex === 0 ? headerBg : rowIndex % 2 === 0 ? INK_50 : null,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    };
  }

  private formatNumber(n: number | undefined | null): string {
    if (n === undefined || n === null) return '—';
    if (Math.abs(n) >= 1000)
      return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    if (Number.isInteger(n)) return n.toString();
    return n.toFixed(2);
  }

  private shortenUrl(url: string): string {
    try {
      const u = new URL(url);
      let path = u.pathname.replace(/\/$/, '') || '/';
      if (path.length > 30) path = path.slice(0, 27) + '…';
      return u.hostname.replace(/^www\./, '') + path;
    } catch {
      return url;
    }
  }
}
