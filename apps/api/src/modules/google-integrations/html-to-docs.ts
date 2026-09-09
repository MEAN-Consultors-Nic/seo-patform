import { sanitizeText } from '@seo/shared';

/**
 * Converts the rich HTML our Quill editors produce into the shape the
 * Google Docs API needs: one flat text string plus the ranges that
 * should carry paragraph and character formatting.
 *
 * Why this exists: the Docs API's `insertText` only takes plain text,
 * which used to be read here as "Docs can't do formatting". It can —
 * formatting is applied as SEPARATE requests (`updateParagraphStyle`,
 * `updateTextStyle`, `createParagraphBullets`) that reference index
 * ranges in the text you just inserted. So the old code was throwing
 * away every bold, list and link on the way to the doc. This module
 * computes those ranges.
 *
 * Offsets are relative to the returned `text`. The caller adds its own
 * cursor position to make them absolute. Because the caller inserts
 * `text` in a single `insertText` and then only applies styles (no
 * further insertions), the indices stay valid for the whole batch.
 *
 * Markup handled — both Quill generations, since the database holds
 * content written by each:
 *   - Quill 2: `<ol><li data-list="bullet">` / `data-list="ordered">`
 *   - Quill 1: `<ul><li>` / `<ol><li>`
 *   - nesting via `class="ql-indent-N"`
 *   - blocks: p, div, h1-h6, li, blockquote, pre
 *   - inline: strong/b, em/i, u, s/strike/del, code, a[href]
 *
 * No DOM here (this runs in Node), so it's a hand-rolled tokenizer
 * rather than a parser — which is fine because the input is our own
 * editor's output, not arbitrary web HTML.
 */

export interface DocsInlineStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  /** Monospace run — `<code>` inline. */
  code?: boolean;
  /** Absolute URL for `<a href>` runs. */
  link?: string;
}

export interface DocsInlineRun {
  start: number;
  end: number;
  style: DocsInlineStyle;
}

export type DocsBlockType =
  | 'paragraph'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'number'
  | 'quote'
  | 'code';

export interface DocsBlock {
  start: number;
  end: number;
  type: DocsBlockType;
  /** Quill indent level (ql-indent-N); 0 for top level. */
  indent: number;
}

export interface DocsContent {
  /** Flattened text, blocks separated by "\n". No trailing newline. */
  text: string;
  runs: DocsInlineRun[];
  blocks: DocsBlock[];
}

const EMPTY: DocsContent = { text: '', runs: [], blocks: [] };

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  laquo: '«',
  raquo: '»',
  deg: '°',
  eacute: 'é',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      safeCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      safeCodePoint(parseInt(dec, 10)),
    )
    .replace(/&([a-z][a-z0-9]*);/gi, (whole: string, name: string) => {
      const hit = NAMED_ENTITIES[name.toLowerCase()];
      return hit === undefined ? whole : hit;
    });
}

function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/** Tags that end the current paragraph and begin a new one. */
const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/** Container tags we only track for list-type context. */
const LIST_CONTAINERS = new Set(['ul', 'ol']);

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs);
  if (!m) return undefined;
  return m[2] ?? m[3] ?? '';
}

function indentOf(attrs: string): number {
  const cls = attr(attrs, 'class') ?? '';
  const m = /ql-indent-(\d+)/.exec(cls);
  return m ? Math.min(8, parseInt(m[1], 10) || 0) : 0;
}

/**
 * Resolves the block type for an opening tag given the enclosing list
 * containers. `data-list` on the `<li>` wins (Quill 2), then the
 * container tag (Quill 1), then a plain paragraph.
 */
function blockTypeFor(
  tag: string,
  attrs: string,
  listStack: string[],
): DocsBlockType {
  switch (tag) {
    case 'h1':
    case 'h2':
      return 'heading2';
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading3';
    case 'blockquote':
      return 'quote';
    case 'pre':
      return 'code';
    case 'li': {
      const dataList = attr(attrs, 'data-list');
      if (dataList === 'bullet') return 'bullet';
      if (dataList === 'ordered') return 'number';
      const container = listStack[listStack.length - 1];
      return container === 'ol' ? 'number' : 'bullet';
    }
    default:
      return 'paragraph';
  }
}

export function htmlToDocsContent(html: string | undefined | null): DocsContent {
  if (!html || typeof html !== 'string') return EMPTY;

  // Run the shared invisibles sanitizer first so NBSP contamination and
  // zero-width junk never reach the doc — same guarantee the plain-text
  // path used to give.
  const src = sanitizeText(html);
  if (!src.trim()) return EMPTY;

  let text = '';
  const runs: DocsInlineRun[] = [];
  const blocks: DocsBlock[] = [];

  const styleStack: InlineStackEntry[] = [];
  const listStack: string[] = [];

  // Current block being accumulated.
  let blockType: DocsBlockType = 'paragraph';
  let blockIndent = 0;
  let blockStart = 0;
  let blockOpen = false;

  const currentStyle = (): DocsInlineStyle =>
    styleStack.reduce<DocsInlineStyle>((acc, e) => ({ ...acc, ...e.style }), {});

  const hasStyle = (s: DocsInlineStyle): boolean =>
    !!(s.bold || s.italic || s.underline || s.strikethrough || s.code || s.link);

  function openBlock(type: DocsBlockType, indent: number) {
    closeBlock();
    blockType = type;
    blockIndent = indent;
    blockStart = text.length;
    blockOpen = true;
  }

  function closeBlock() {
    if (!blockOpen) return;
    blockOpen = false;
    // Drop blocks with no visible content — Quill emits `<p><br></p>`
    // for every blank line, and letting those through is what produced
    // the stray empty paragraphs in the doc.
    const body = text.slice(blockStart);
    if (!body.trim()) {
      text = text.slice(0, blockStart);
      // also discard runs that pointed into the removed text
      while (runs.length && runs[runs.length - 1].start >= blockStart) {
        runs.pop();
      }
      return;
    }
    blocks.push({
      start: blockStart,
      end: text.length,
      type: blockType,
      indent: blockIndent,
    });
    text += '\n';
  }

  function pushText(raw: string) {
    if (!raw) return;
    let chunk = decodeEntities(raw);
    // Collapse HTML whitespace the way a browser would, but keep the
    // explicit newlines that <br> handling inserts.
    chunk = chunk.replace(/[ \t\r\f]*\n[ \t\r\f]*/g, '\n');
    chunk = chunk.replace(/[ \t]{2,}/g, ' ');
    if (!chunk) return;
    if (!blockOpen) openBlock('paragraph', 0);
    // Leading whitespace at the very start of a block is noise.
    if (text.length === blockStart) chunk = chunk.replace(/^[ \t]+/, '');
    if (!chunk) return;
    const start = text.length;
    text += chunk;
    const style = currentStyle();
    if (hasStyle(style)) runs.push({ start, end: text.length, style });
  }

  // --- tokenize ------------------------------------------------------------
  const TOKEN = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = TOKEN.exec(src)) !== null) {
    if (m.index > last) pushText(src.slice(last, m.index));
    last = TOKEN.lastIndex;

    const closing = m[0].startsWith('</');
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? '';

    if (tag === 'br') {
      // Soft break inside a block. Docs has no intra-paragraph break,
      // so this becomes a paragraph boundary of the same type.
      if (blockOpen && text.slice(blockStart).trim()) {
        const type = blockType;
        const indent = blockIndent;
        closeBlock();
        openBlock(type, indent);
      }
      continue;
    }

    if (LIST_CONTAINERS.has(tag)) {
      if (closing) {
        closeBlock();
        listStack.pop();
      } else {
        closeBlock();
        listStack.push(tag);
      }
      continue;
    }

    if (BLOCK_TAGS.has(tag)) {
      if (closing) {
        closeBlock();
      } else {
        openBlock(blockTypeFor(tag, attrs, listStack), indentOf(attrs));
      }
      continue;
    }

    // --- inline ---
    const key = inlineKeyFor(tag);
    if (!key) continue;
    if (closing) {
      // Pop the most recent entry opened by the same tag family, so
      // malformed nesting can't corrupt the rest of the run.
      for (let i = styleStack.length - 1; i >= 0; i--) {
        if (styleStack[i].key === key) {
          styleStack.splice(i, 1);
          break;
        }
      }
    } else {
      // Always push, even when the tag yields no usable style (a
      // javascript:/relative href, say) — the stack depth has to mirror
      // the markup or the matching close would pop someone else's style.
      styleStack.push({ key, style: inlineStyleFor(tag, attrs) });
    }
  }

  if (last < src.length) pushText(src.slice(last));
  closeBlock();

  // Trailing block separator isn't wanted — the caller decides how the
  // description joins whatever follows it.
  if (text.endsWith('\n')) text = text.slice(0, -1);

  return { text, runs, blocks };
}

interface InlineStackEntry {
  key: InlineKey;
  style: DocsInlineStyle;
}

type InlineKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link';

/**
 * Which style family a tag belongs to. Derived from the tag name only,
 * because closing tags carry no attributes — that asymmetry is what
 * used to let a link bleed past its `</a>`.
 */
function inlineKeyFor(tag: string): InlineKey | undefined {
  switch (tag) {
    case 'strong':
    case 'b':
      return 'bold';
    case 'em':
    case 'i':
      return 'italic';
    case 'u':
    case 'ins':
      return 'underline';
    case 's':
    case 'strike':
    case 'del':
      return 'strikethrough';
    case 'code':
      return 'code';
    case 'a':
      return 'link';
    default:
      return undefined;
  }
}

/** The actual style an opening tag contributes. May be empty. */
function inlineStyleFor(tag: string, attrs: string): DocsInlineStyle {
  const key = inlineKeyFor(tag);
  if (!key) return {};
  if (key !== 'link') return { [key]: true } as DocsInlineStyle;
  const href = (attr(attrs, 'href') ?? '').trim();
  // Only real absolute links — a relative or javascript: href would
  // make the Docs API reject the whole batch.
  if (!/^https?:\/\//i.test(href)) return {};
  return { link: href };
}

/**
 * Merges runs of consecutive same-type list blocks into single ranges.
 *
 * `createParagraphBullets` applies to a range, so one request per run
 * produces one continuous Docs list. Emitting a request per item would
 * instead restart the numbering at every line.
 */
export function groupListBlocks(
  blocks: DocsBlock[],
): Array<{ type: 'bullet' | 'number'; start: number; end: number }> {
  const out: Array<{ type: 'bullet' | 'number'; start: number; end: number }> =
    [];
  let cur: { type: 'bullet' | 'number'; start: number; end: number } | null =
    null;
  for (const b of blocks) {
    if (b.type === 'bullet' || b.type === 'number') {
      if (cur && cur.type === b.type) {
        cur.end = b.end;
      } else {
        if (cur) out.push(cur);
        cur = { type: b.type, start: b.start, end: b.end };
      }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}
