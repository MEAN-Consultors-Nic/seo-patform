import { Injectable, Logger } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from 'docx';
import {
  Client,
  Cycle,
  Report,
  ReportSectionConfig,
  ReportSectionKey,
  sanitizeText,
} from '@seo/shared';

const DEFAULT_LAYOUT: ReportSectionKey[] = [
  'executive-summary',
  'key-metrics',
  'search-rankings',
  'actions-taken',
  'next-period-plan',
  'backlinks-profile',
  'client-blockers',
  'final-considerations',
];

interface WordContext {
  tasks: Array<{
    title: string;
    category: string;
    status: string;
    priority: string;
    notes?: string;
    description?: string;
  }>;
  keywords: Array<{
    text: string;
    group?: string;
    currentPosition?: number;
    previousPosition?: number;
    volume?: number;
  }>;
  gainers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
  losers: Array<{ keyword: { text: string; currentPosition?: number }; delta: number }>;
  backlinks: {
    total: number;
    dofollow: number;
    perStatus: Array<{ _id: string; count: number; avgDr: number }>;
  };
  layout?: ReportSectionConfig[];
  contentIdeas?: Array<{ title: string; targetKeyword?: string }>;
  contentPublished?: Array<{
    title: string;
    targetKeyword?: string;
    publishedUrl?: string;
    publishedAt?: Date | string;
  }>;
}

const SECTION_LABELS: Record<ReportSectionKey, string> = {
  'executive-summary': 'Executive Summary',
  'key-metrics': 'Key Metrics (KPIs)',
  'search-rankings': 'Keywords and Positions',
  'actions-taken': 'Actions Taken',
  'next-period-plan': 'Next Period Plan',
  'backlinks-profile': 'Backlinks Profile',
  'client-blockers': 'Client Blockers',
  'final-considerations': 'Final Considerations',
  // Sections present in the layout type but not rendered in Word v1:
  'locations-performance': 'Locations Performance',
};

const BRAND = 'FF7A59';
const INK_900 = '0F172A';
const INK_700 = '334155';

@Injectable()
export class WordService {
  private readonly logger = new Logger(WordService.name);

  async generate(
    client: Client,
    cycle: Cycle,
    report: Report,
    ctx: WordContext,
  ): Promise<Buffer> {
    const children: (Paragraph | Table)[] = [];

    // Cover -----------------------------------------------------------------
    const coverImg = await this.fetchImageBuffer(report.coverImageUrl);
    if (coverImg) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: coverImg.buffer,
              transformation: { width: 540, height: 300 },
              type: coverImg.type,
            }),
          ],
          spacing: { after: 240 },
        }),
      );
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.TITLE,
        children: [
          new TextRun({
            text: `SEO Report`,
            color: INK_900,
            bold: true,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: client.name,
            color: BRAND,
            bold: true,
            size: 36,
          }),
        ],
        spacing: { after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${cycle.label}  ·  ${this.formatDate(cycle.startDate)} – ${this.formatDate(cycle.endDate)}`,
            color: INK_700,
            size: 22,
          }),
        ],
        spacing: { after: 480 },
      }),
    );

    // Sections (honoring layout) -------------------------------------------
    const layout: ReportSectionConfig[] = ctx.layout?.length
      ? ctx.layout
      : DEFAULT_LAYOUT.map((k) => ({ key: k, visible: true }));

    let counter = 0;
    const num = () => String(++counter).padStart(2, '0');
    for (const section of layout) {
      if (!section.visible) continue;
      const body = this.renderSectionBody(section.key, report, ctx);
      if (!body.length) continue;
      children.push(
        this.sectionHeader(num(), SECTION_LABELS[section.key]),
        ...body,
      );
    }

    const doc = new Document({
      creator: 'Media Spearhead',
      title: `SEO Report ${client.name} ${cycle.label}`,
      subject: `SEO Report — ${cycle.label}`,
      numbering: {
        config: [
          {
            reference: 'bullets',
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: '•',
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 360, hanging: 200 } } },
              },
            ],
          },
        ],
      },
      sections: [{ properties: {}, children }],
    });

    return Packer.toBuffer(doc);
  }

  /**
   * Builds just the body of a section (no header). Returns an empty
   * array when the section has nothing meaningful to render — the caller
   * skips the whole section (header and counter) when that happens, so
   * the Word doc never contains "No content registered" placeholders or
   * gaps in section numbering.
   */
  private renderSectionBody(
    key: ReportSectionKey,
    report: Report,
    ctx: WordContext,
  ): (Paragraph | Table)[] {
    switch (key) {
      case 'executive-summary':
        return this.richTextBlock(report.executiveSummary);
      case 'key-metrics':
        return this.hasAnyKpi(report) ? [this.kpisTable(report)] : [];
      case 'search-rankings': {
        const body: (Paragraph | Table)[] = [];
        if (ctx.keywords.length) body.push(this.keywordsTable(ctx.keywords));
        if (ctx.gainers.length || ctx.losers.length)
          body.push(this.movementsTable(ctx.gainers, ctx.losers));
        return body;
      }
      case 'actions-taken': {
        const completed = ctx.tasks.filter((t) => t.status === 'completed');
        const published = ctx.contentPublished ?? [];
        if (!completed.length && !published.length) return [];
        const body: (Paragraph | Table)[] = [];
        if (completed.length) {
          body.push(...this.tasksList(completed));
        }
        if (published.length) {
          body.push(this.heading3('Content Published'));
          body.push(
            ...published.map(
              (p) =>
                new Paragraph({
                  numbering: { reference: 'bullets', level: 0 },
                  children: [new TextRun(p.title)],
                }),
            ),
          );
        }
        return body;
      }
      case 'next-period-plan': {
        const ideas = ctx.contentIdeas ?? [];
        const text = this.richTextBlock(report.nextPeriodPlan);
        if (!text.length && !ideas.length) return [];
        const body: (Paragraph | Table)[] = [...text];
        if (ideas.length) {
          body.push(this.heading3('Content Pipeline'));
          body.push(
            ...ideas.map(
              (p) =>
                new Paragraph({
                  numbering: { reference: 'bullets', level: 0 },
                  children: [new TextRun(p.title)],
                }),
            ),
          );
        }
        return body;
      }
      case 'backlinks-profile':
        return ctx.backlinks.total > 0 ? this.backlinksBlock(ctx.backlinks) : [];
      case 'client-blockers':
        return this.richTextBlock(report.clientBlockers);
      case 'final-considerations':
        return this.richTextBlock(report.finalConsiderations);
      case 'locations-performance':
        // Not rendered in Word v1
        return [];
    }
  }

  /** True when at least one stored KPI is a non-zero finite number. */
  private hasAnyKpi(report: Report): boolean {
    const k = (report.kpis || {}) as Record<string, unknown>;
    return Object.values(k).some(
      (v) => typeof v === 'number' && Number.isFinite(v) && v !== 0,
    );
  }

  // --- Building blocks ----------------------------------------------------

  private sectionHeader(num: string, label: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 120 },
      children: [
        new TextRun({
          text: `${num}  ${label}`,
          color: INK_900,
          bold: true,
          size: 28,
        }),
      ],
    });
  }

  private heading3(label: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 240, after: 80 },
      children: [
        new TextRun({ text: label, color: INK_900, bold: true, size: 22 }),
      ],
    });
  }

  /**
   * Flattens Quill HTML into newline-separated plain text. Runs the
   * shared invisibles sanitizer first, then turns every block boundary
   * (`<br>`, `</p>`, `</div>`, `</li>`, `</h1>`–`</h6>`) into a newline
   * so downstream paragraph splitting preserves list structure, strips
   * the remaining tags, and decodes the common HTML entities Quill
   * emits — `&quot;` / `&#39;` / `&amp;` / `&lt;` / `&gt;` / `&nbsp;`.
   * Returns "" for empty/null input.
   */
  private htmlToPlain(html: unknown): string {
    let raw = '';
    if (Array.isArray(html)) raw = html.join(' ');
    else if (typeof html === 'string') raw = html;
    if (!raw) return '';

    return sanitizeText(raw)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&shy;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCodePoint(parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        String.fromCodePoint(parseInt(hex, 16)),
      )
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Decomposes Quill-style HTML into a list of Word paragraphs. Returns
   * an empty array when the input has no real content so the caller can
   * skip the whole section instead of emitting a placeholder.
   */
  private richTextBlock(html: unknown): Paragraph[] {
    const clean = this.htmlToPlain(html);
    if (!clean) return [];
    return clean
      .split(/\n+/)
      .filter((p) => p.trim())
      .map(
        (p) =>
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: p.trim(), color: INK_700, size: 22 }),
            ],
          }),
      );
  }

  private kpisTable(report: Report): Table {
    const k = (report.kpis || {}) as Record<string, number | null | undefined>;
    const rows = [
      ['Organic sessions', k.organicSessions],
      ['New users', k.newUsers],
      ['Engagement rate (%)', k.engagementRate],
      ['Avg engagement time (s)', k.avgEngagementTime],
      ['Conversions', k.conversions],
      ['Conversion rate (%)', k.conversionRate],
      ['Impressions', k.impressions],
      ['Clicks', k.clicks],
      ['CTR (%)', k.ctr],
      ['Avg position', k.avgPosition],
      ['Indexed pages', k.indexedPages],
      ['Non-indexed pages', k.nonIndexedPages],
    ] as const;

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            this.headerCell('KPI'),
            this.headerCell('Value', AlignmentType.RIGHT),
          ],
        }),
        ...rows.map(
          ([label, value]) =>
            new TableRow({
              children: [
                this.bodyCell(label),
                this.bodyCell(
                  typeof value === 'number' && !Number.isNaN(value)
                    ? this.formatKpi(value)
                    : '—',
                  AlignmentType.RIGHT,
                ),
              ],
            }),
        ),
      ],
    });
  }

  private keywordsTable(
    keywords: WordContext['keywords'],
  ): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            this.headerCell('Keyword'),
            this.headerCell('Group'),
            this.headerCell('Position', AlignmentType.RIGHT),
            this.headerCell('Δ', AlignmentType.RIGHT),
            this.headerCell('Volume', AlignmentType.RIGHT),
          ],
        }),
        ...keywords.slice(0, 30).map((kw) => {
          const cur = kw.currentPosition;
          const prev = kw.previousPosition;
          const delta =
            typeof cur === 'number' && typeof prev === 'number'
              ? prev - cur
              : null;
          const deltaStr = delta === null ? '—' : delta > 0 ? `+${delta}` : `${delta}`;
          return new TableRow({
            children: [
              this.bodyCell(kw.text),
              this.bodyCell(kw.group || '—'),
              this.bodyCell(
                typeof cur === 'number' ? String(cur) : '—',
                AlignmentType.RIGHT,
              ),
              this.bodyCell(deltaStr, AlignmentType.RIGHT),
              this.bodyCell(
                typeof kw.volume === 'number' ? kw.volume.toLocaleString() : '—',
                AlignmentType.RIGHT,
              ),
            ],
          });
        }),
      ],
    });
  }

  private movementsTable(
    gainers: WordContext['gainers'],
    losers: WordContext['losers'],
  ): Table {
    const rows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          this.headerCell('Gainers'),
          this.headerCell('Δ', AlignmentType.RIGHT),
          this.headerCell('Losers'),
          this.headerCell('Δ', AlignmentType.RIGHT),
        ],
      }),
    ];
    const top = Math.max(gainers.length, losers.length, 1);
    for (let i = 0; i < Math.min(top, 8); i++) {
      const g = gainers[i];
      const l = losers[i];
      rows.push(
        new TableRow({
          children: [
            this.bodyCell(g?.keyword.text || '—'),
            this.bodyCell(
              g ? (g.delta > 0 ? `+${g.delta}` : `${g.delta}`) : '—',
              AlignmentType.RIGHT,
            ),
            this.bodyCell(l?.keyword.text || '—'),
            this.bodyCell(
              l ? (l.delta > 0 ? `+${l.delta}` : `${l.delta}`) : '—',
              AlignmentType.RIGHT,
            ),
          ],
        }),
      );
    }
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    });
  }

  private tasksList(tasks: WordContext['tasks']): Paragraph[] {
    if (!tasks.length) return [];
    const out: Paragraph[] = [];
    for (const t of tasks) {
      out.push(
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          spacing: { after: 60 },
          children: [
            new TextRun({
              text: `[${t.category.toUpperCase()}] `,
              color: BRAND,
              bold: true,
              size: 18,
            }),
            new TextRun({ text: t.title, color: INK_900, size: 22 }),
          ],
        }),
      );
      const desc = this.htmlToPlain(t.description);
      if (desc) {
        for (const line of desc.split('\n').filter((l) => l.trim())) {
          out.push(
            new Paragraph({
              indent: { left: 720 },
              spacing: { after: 60 },
              children: [
                new TextRun({ text: line.trim(), color: INK_700, size: 20 }),
              ],
            }),
          );
        }
      }
    }
    return out;
  }

  private backlinksBlock(b: WordContext['backlinks']): Paragraph[] {
    return [
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: `Total backlinks: ${b.total.toLocaleString()}  ·  Do-follow: ${b.dofollow.toLocaleString()}`,
            color: INK_700,
            size: 22,
          }),
        ],
      }),
      ...b.perStatus.map(
        (s) =>
          new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            children: [
              new TextRun({
                text: `${s._id}: ${s.count.toLocaleString()} (avg DR ${s.avgDr.toFixed(0)})`,
                color: INK_700,
                size: 20,
              }),
            ],
          }),
      ),
    ];
  }

  private headerCell(text: string, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT): TableCell {
    return new TableCell({
      shading: { fill: 'F0F2F5' },
      borders: this.cellBorders(),
      children: [
        new Paragraph({
          alignment: align,
          children: [
            new TextRun({ text, bold: true, color: INK_900, size: 20 }),
          ],
        }),
      ],
    });
  }

  private bodyCell(text: string, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT): TableCell {
    return new TableCell({
      borders: this.cellBorders(),
      children: [
        new Paragraph({
          alignment: align,
          children: [new TextRun({ text, color: INK_700, size: 20 })],
        }),
      ],
    });
  }

  private cellBorders() {
    const b = { style: BorderStyle.SINGLE, size: 4, color: 'E4E7EB' };
    return { top: b, bottom: b, left: b, right: b };
  }

  // --- Helpers -----------------------------------------------------------

  /**
   * Fetches an image URL into a Buffer that docx can embed. Returns null
   * on any error so the cover gracefully falls back to a no-image cover.
   * Supports png/jpg/gif/bmp — webp is rejected because docx@9 doesn't
   * decode it.
   */
  private async fetchImageBuffer(
    url: string | undefined | null,
  ): Promise<{ buffer: Buffer; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null> {
    if (!url) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await res.arrayBuffer());
      const type: 'png' | 'jpg' | 'gif' | 'bmp' | null = ct.includes('jpeg') || ct.includes('jpg')
        ? 'jpg'
        : ct.includes('gif')
          ? 'gif'
          : ct.includes('bmp')
            ? 'bmp'
            : ct.includes('png')
              ? 'png'
              : null;
      if (!type) {
        this.logger.warn(`Word cover image: unsupported mime ${ct} for ${url}`);
        return null;
      }
      return { buffer: buf, type };
    } catch (err) {
      this.logger.warn(
        `Word cover image fetch failed for ${url}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private formatDate(d: Date | string): string {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  private formatKpi(n: number): string {
    if (!isFinite(n)) return '—';
    if (Math.abs(n) >= 1000) return n.toLocaleString();
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2);
  }
}
