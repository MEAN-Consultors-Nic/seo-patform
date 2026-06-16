/**
 * Normalizes pasted-in text/HTML before it lands in storage or in a rendered
 * report. Targets the contamination that arrives from Word, Google Docs, and
 * Claude Desktop pastes — most of which sneak in invisibly and end up
 * fusing adjacent words in the PDF / public report.
 *
 * Two categories of characters are normalized:
 *
 * 1) Unicode "space separator" characters that look like a regular space
 *    but are NOT one. pdfmake renders these with different metrics than
 *    U+0020 so a paragraph rendered with U+00A0 between every word shows
 *    a visible double-space artifact ("auto  generated"). The whole
 *    family — U+00A0, U+1680, U+2000–200A, U+202F, U+205F, U+3000 — is
 *    converted to a regular U+0020 space.
 *
 * 2) Invisible "format" characters (soft hyphens, zero-width spaces,
 *    word joiners, bidi marks, BOM, variation selectors). With plain
 *    removal these fuse adjacent words — "SEO[soft-hyphen]friendly"
 *    becomes "SEOfriendly". We replace them with a space instead, then
 *    collapse runs of horizontal spaces back to one. The net effect:
 *    invisibles disappear from the output without fusing word
 *    boundaries.
 *
 * Preserved on purpose: regular spaces, tabs, newlines, HTML tags,
 * regular hyphens, punctuation, accented characters, emoji base code
 * points (variation selectors stripped, base emoji kept).
 *
 * Use this everywhere a user can paste text into the system — both at
 * save time (clean DB) AND render time (cover legacy data).
 */

const NBSP_FAMILY = new RegExp(
  '[' +
    ' ' + // NO-BREAK SPACE
    ' ' + // OGHAM SPACE MARK
    '       ' + // EN/EM QUADS + per-em spaces
    ' ' + // FIGURE SPACE
    '   ' + // PUNCTUATION / THIN / HAIR SPACE
    ' ' + // NARROW NO-BREAK SPACE
    ' ' + // MEDIUM MATHEMATICAL SPACE
    '　' + // IDEOGRAPHIC SPACE
    ']',
  'g',
);

const INVISIBLE_BREAKERS = new RegExp(
  '[' +
    '­' + // SOFT HYPHEN
    '​‌‍' + // ZERO WIDTH SPACE / NON-JOINER / JOINER
    '‎‏' + // LTR / RTL MARK
    '‪‫‬‭‮' + // bidi embedding / override
    '⁠⁡⁢⁣⁤' + // WORD JOINER + invisible math
    '⁦⁧⁨⁩' + // bidi isolates
    '﻿' + // BOM / ZERO WIDTH NO-BREAK SPACE
    ']',
  'g',
);

// Variation selectors (modify the rendering of the preceding char — most
// often emoji presentation). They have no width of their own and pdfmake
// doesn't honor them, so they're dropped entirely.
const VARIATION_SELECTORS = new RegExp(
  '[︀-️᠋-᠍]',
  'g',
);

/**
 * Private-use marker used as a temporary placeholder while sanitizeText
 * decides whether each invisible run should collapse to a space (between
 * two word chars) or to nothing (next to punctuation/whitespace).
 * Picked from the BMP private-use area so it can't collide with any
 * legitimate user input.
 */
const MARKER = '\uE000';

/**
 * Applies the full normalization pipeline. Safe for any value type — if
 * the input isn't a string, it's returned untouched so callers can use it
 * directly inside optional-field assignments.
 */
export function sanitizeText<T extends string | undefined | null>(
  value: T,
): T {
  if (typeof value !== 'string') return value;
  // Stage 1: stamp every invisible-breaker run with a single private-use
  // marker so we can decide what to replace it with based on context.
  // Stage 2: a marker BETWEEN two word chars becomes a single space
  // (preserves word boundaries when invisibles replaced a real space).
  // Stage 3: any other marker — adjacent to punctuation like "-" or to
  // existing whitespace — is removed without inserting a space, so
  // compound words like "non-SEO-friendly" don't grow to "non - SEO -
  // friendly" just because the source had ZWSPs flanking the hyphens.
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&shy;/gi, MARKER)
    .replace(NBSP_FAMILY, ' ')
    .replace(INVISIBLE_BREAKERS, MARKER)
    .replace(VARIATION_SELECTORS, '')
    .replace(/(\w)\uE000+(\w)/g, '$1 $2')
    .replace(/\uE000+/g, '')
    .replace(/  +/g, ' ') as T;
}

/**
 * Walks an object and sanitizes every string field named in `keys`.
 * Useful for cleaning DTOs before save and lean docs before serving
 * without per-field boilerplate at every call site.
 */
export function sanitizeFields<T extends Record<string, unknown>>(
  doc: T | null | undefined,
  keys: readonly string[],
): T | null | undefined {
  if (!doc || typeof doc !== 'object') return doc;
  for (const k of keys) {
    const v = doc[k];
    if (typeof v === 'string') {
      (doc as Record<string, unknown>)[k] = sanitizeText(v);
    }
  }
  return doc;
}
