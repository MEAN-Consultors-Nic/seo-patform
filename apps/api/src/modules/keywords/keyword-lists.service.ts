import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  KeywordIntent,
  KeywordListWithStats,
  sanitizeText,
} from '@seo/shared';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';
import { Keyword, KeywordDocument } from './keyword.schema';
import { KeywordList, KeywordListDocument } from './keyword-list.schema';

/** One parsed row from a pasted block or CSV. */
export interface ParsedKeywordRow {
  text: string;
  volume?: number;
  difficulty?: number;
  cpc?: number;
  intent?: KeywordIntent;
  /** Maps to the Keyword's existing `group` (Cluster) field. */
  group?: string;
  targetUrl?: string;
  notes?: string;
}

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
  rows: number;
  warnings: string[];
}

const INTENT_ALIASES: Record<string, KeywordIntent> = {
  informational: 'informational',
  information: 'informational',
  info: 'informational',
  i: 'informational',
  commercial: 'commercial',
  'commercial investigation': 'commercial',
  c: 'commercial',
  transactional: 'transactional',
  transaction: 'transactional',
  t: 'transactional',
  navigational: 'navigational',
  navigation: 'navigational',
  n: 'navigational',
};

/**
 * Header aliases for the bulk importer, lowercased. Covers the column
 * names Ubersuggest, Ahrefs and Semrush use in their CSV exports so a
 * paste straight from any of them maps without hand-editing.
 */
const HEADER_ALIASES: Record<string, keyof ParsedKeywordRow> = {
  keyword: 'text',
  keywords: 'text',
  'keyword phrase': 'text',
  query: 'text',
  term: 'text',
  volume: 'volume',
  'search volume': 'volume',
  'monthly volume': 'volume',
  'avg. monthly searches': 'volume',
  'avg monthly searches': 'volume',
  searches: 'volume',
  vol: 'volume',
  sv: 'volume',
  difficulty: 'difficulty',
  'seo difficulty': 'difficulty',
  'keyword difficulty': 'difficulty',
  kd: 'difficulty',
  'kd %': 'difficulty',
  sd: 'difficulty',
  competition: 'difficulty',
  cpc: 'cpc',
  'cost per click': 'cpc',
  'cpc (usd)': 'cpc',
  intent: 'intent',
  'search intent': 'intent',
  'keyword intent': 'intent',
  // Ahrefs' "Parent Topic" and Ubersuggest's "core" are the same idea as
  // our existing Cluster field, so they import straight into it rather
  // than creating a second grouping concept.
  'parent topic': 'group',
  'parent keyword': 'group',
  topic: 'group',
  core: 'group',
  'keyword core': 'group',
  cluster: 'group',
  group: 'group',
  url: 'targetUrl',
  'target url': 'targetUrl',
  'landing page': 'targetUrl',
  notes: 'notes',
  note: 'notes',
};

@Injectable()
export class KeywordListsService {
  constructor(
    @InjectModel(KeywordList.name)
    private readonly listModel: Model<KeywordListDocument>,
    @InjectModel(Keyword.name)
    private readonly keywordModel: Model<KeywordDocument>,
    private readonly clients: ClientsService,
  ) {}

  // --- Lists ---------------------------------------------------------------

  /**
   * Lists for a client with their rollups. Counts come from one grouped
   * aggregation rather than a query per list, so the rail stays cheap
   * as lists multiply.
   */
  async findByClient(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<KeywordListWithStats[]> {
    if (user) await this.clients.assertAccess(clientId, user);
    const clientObjId = new Types.ObjectId(clientId);

    const lists = await this.listModel
      .find({ clientId: clientObjId })
      .sort({ name: 1 })
      .lean()
      .exec();
    if (lists.length === 0) return [];

    const stats = await this.keywordModel.aggregate<{
      _id: Types.ObjectId;
      keywordCount: number;
      trackedCount: number;
      totalVolume: number;
    }>([
      { $match: { clientId: clientObjId, listIds: { $ne: [] } } },
      { $unwind: '$listIds' },
      {
        $group: {
          _id: '$listIds',
          keywordCount: { $sum: 1 },
          trackedCount: {
            $sum: { $cond: [{ $ne: ['$tracked', false] }, 1, 0] },
          },
          totalVolume: { $sum: { $ifNull: ['$volume', 0] } },
        },
      },
    ]);
    const byList = new Map(stats.map((s) => [String(s._id), s]));

    return lists.map((l) => {
      const hit = byList.get(String(l._id));
      return {
        ...(l as unknown as KeywordListWithStats),
        _id: String(l._id),
        clientId: String(l.clientId),
        keywordCount: hit?.keywordCount ?? 0,
        trackedCount: hit?.trackedCount ?? 0,
        totalVolume: hit?.totalVolume ?? 0,
      };
    });
  }

  async create(
    clientId: string,
    dto: { name: string; description?: string },
    user?: AuthenticatedUser,
  ) {
    if (user) await this.clients.assertAccess(clientId, user);
    const name = sanitizeText(dto.name || '').trim();
    if (!name) throw new BadRequestException('List name is required.');
    const existing = await this.listModel
      .findOne({ clientId: new Types.ObjectId(clientId), name })
      .lean()
      .exec();
    if (existing) {
      throw new BadRequestException(`A list called "${name}" already exists.`);
    }
    return this.listModel.create({
      clientId: new Types.ObjectId(clientId),
      name,
      description: sanitizeText(dto.description || '').trim() || undefined,
    });
  }

  async update(
    listId: string,
    dto: { name?: string; description?: string },
    user?: AuthenticatedUser,
  ) {
    const list = await this.assertList(listId, user);
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = sanitizeText(dto.name).trim();
      if (!name) throw new BadRequestException('List name is required.');
      const clash = await this.listModel
        .findOne({ clientId: list.clientId, name, _id: { $ne: list._id } })
        .lean()
        .exec();
      if (clash) {
        throw new BadRequestException(`A list called "${name}" already exists.`);
      }
      patch.name = name;
    }
    if (dto.description !== undefined) {
      patch.description = sanitizeText(dto.description).trim() || undefined;
    }
    return this.listModel
      .findByIdAndUpdate(listId, { $set: patch }, { new: true })
      .lean()
      .exec();
  }

  /**
   * Deletes the list. Keywords are never deleted — they're just pulled
   * out of it, because the same keyword is very likely tracked or
   * sitting in another list. Orphaned research keywords stay findable
   * via the Keywords tab's untracked filter.
   */
  async remove(listId: string, user?: AuthenticatedUser) {
    const list = await this.assertList(listId, user);
    await this.keywordModel
      .updateMany(
        { clientId: list.clientId, listIds: list._id },
        { $pull: { listIds: list._id } },
      )
      .exec();
    await this.listModel.findByIdAndDelete(listId).exec();
    return { ok: true };
  }

  // --- Membership ----------------------------------------------------------

  /** Keywords in a list, newest-value-first so the big terms lead. */
  async keywords(listId: string, user?: AuthenticatedUser) {
    const list = await this.assertList(listId, user);
    return this.keywordModel
      .find({ clientId: list.clientId, listIds: list._id })
      .sort({ volume: -1, text: 1 })
      .lean()
      .exec();
  }

  async addExisting(
    listId: string,
    keywordIds: string[],
    user?: AuthenticatedUser,
  ) {
    const list = await this.assertList(listId, user);
    const ids = (keywordIds ?? [])
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (ids.length === 0) return { added: 0 };
    const res = await this.keywordModel
      .updateMany(
        { _id: { $in: ids }, clientId: list.clientId },
        { $addToSet: { listIds: list._id } },
      )
      .exec();
    return { added: res.modifiedCount ?? 0 };
  }

  async removeKeyword(
    listId: string,
    keywordId: string,
    user?: AuthenticatedUser,
  ) {
    const list = await this.assertList(listId, user);
    await this.keywordModel
      .updateOne(
        { _id: new Types.ObjectId(keywordId), clientId: list.clientId },
        { $pull: { listIds: list._id } },
      )
      .exec();
    return { ok: true };
  }

  // --- Bulk import ---------------------------------------------------------

  /**
   * Upserts a batch of parsed rows into the client's keyword pool and
   * adds every one of them to the list.
   *
   * Upsert rather than insert because the keyword may already exist —
   * tracked, or in another list. In that case we merge: the row's
   * metrics fill gaps and refresh stale values, but tracking state,
   * positions and existing list membership are left alone. A pasted
   * research export must never quietly untrack a keyword.
   */
  async importRows(
    clientId: string,
    rows: ParsedKeywordRow[],
    opts: { listId?: string; tracked?: boolean; overwrite?: boolean } = {},
    user?: AuthenticatedUser,
  ): Promise<BulkImportResult> {
    // The list is optional: a paste can land straight in the client's
    // keyword pool without being filed anywhere.
    const list = opts.listId
      ? await this.assertList(opts.listId, user)
      : null;
    if (!list && user) await this.clients.assertAccess(clientId, user);
    const clientObjId = list ? list.clientId : new Types.ObjectId(clientId);
    const warnings: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Collapse duplicates inside the paste itself, keeping the richest
    // row for each term so a later blank column can't erase an earlier
    // value.
    const merged = new Map<string, ParsedKeywordRow>();
    for (const row of rows) {
      const text = sanitizeText(row.text || '').trim().toLowerCase();
      if (!text) {
        skipped++;
        continue;
      }
      const prev = merged.get(text);
      merged.set(text, prev ? { ...prev, ...prune(row), text } : { ...row, text });
    }

    for (const row of merged.values()) {
      const existing = await this.keywordModel
        .findOne({ clientId: clientObjId, text: row.text })
        .exec();

      if (!existing) {
        await this.keywordModel.create({
          clientId: clientObjId,
          text: row.text,
          volume: row.volume,
          difficulty: row.difficulty,
          cpc: row.cpc,
          intent: row.intent,
          group: row.group,
          targetUrl: row.targetUrl,
          notes: row.notes,
          listIds: list ? [list._id] : [],
          // Imported research defaults to untracked so it doesn't land
          // in the position cron or the tracking table uninvited.
          tracked: opts.tracked === true,
          status: 'idea',
          source: 'manual',
        });
        created++;
        continue;
      }

      const patch: Record<string, unknown> = {};
      for (const key of [
        'volume',
        'difficulty',
        'cpc',
        'intent',
        'group',
        'targetUrl',
        'notes',
      ] as const) {
        const incoming = row[key];
        if (incoming === undefined || incoming === '') continue;
        // Without overwrite we only fill gaps, so a thin export can't
        // wipe numbers someone curated by hand.
        if (!opts.overwrite && existing.get(key) !== undefined) continue;
        patch[key] = incoming;
      }
      await this.keywordModel
        .updateOne(
          { _id: existing._id },
          list
            ? { $set: patch, $addToSet: { listIds: list._id } }
            : { $set: patch },
        )
        .exec();
      updated++;
    }

    if (skipped > 0) {
      warnings.push(`${skipped} row(s) had no keyword text and were skipped.`);
    }
    return { created, updated, skipped, rows: merged.size, warnings };
  }

  /**
   * Parses a pasted block into rows.
   *
   * Accepts tab-separated (what you get copying a table out of
   * Ubersuggest / Ahrefs / a spreadsheet), comma-separated, or a plain
   * one-keyword-per-line list. When the first line looks like a header
   * its columns are mapped via HEADER_ALIASES; otherwise the first
   * column is the keyword and the rest are read positionally as
   * volume / difficulty / cpc, which is the shape every export happens
   * to use.
   */
  parseBlock(raw: string): { rows: ParsedKeywordRow[]; warnings: string[] } {
    const warnings: string[] = [];
    const text = sanitizeText(raw || '').replace(/\r\n?/g, '\n');
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return { rows: [], warnings };

    const delimiter = pickDelimiter(lines);
    const split = (line: string) =>
      delimiter === null
        ? [line]
        : splitDelimited(line, delimiter).map((c) => c.trim());

    let header: (keyof ParsedKeywordRow | null)[] | null = null;
    const firstCells = split(lines[0]);
    const mapped = firstCells.map(
      (c) => HEADER_ALIASES[c.toLowerCase().replace(/\s+/g, ' ')] ?? null,
    );
    // Treat line 1 as a header only if it names the keyword column and
    // carries no number in the keyword slot — "keyword, 90, 40" is data.
    if (mapped[0] === 'text' && !isNumeric(firstCells[0])) {
      header = mapped;
      const unknown = firstCells.filter((c, i) => mapped[i] === null && c);
      if (unknown.length) {
        warnings.push(`Ignored unrecognised column(s): ${unknown.join(', ')}.`);
      }
    }

    const body = header ? lines.slice(1) : lines;
    const rows: ParsedKeywordRow[] = [];
    for (const line of body) {
      const cells = split(line);
      const row: ParsedKeywordRow = { text: '' };
      if (header) {
        header.forEach((field, i) => {
          if (!field) return;
          assign(row, field, cells[i]);
        });
      } else {
        row.text = cells[0] ?? '';
        // Positional fallback: keyword, volume, difficulty, cpc.
        assign(row, 'volume', cells[1]);
        assign(row, 'difficulty', cells[2]);
        assign(row, 'cpc', cells[3]);
      }
      if (row.text.trim()) rows.push(row);
    }
    return { rows, warnings };
  }

  // --- helpers -------------------------------------------------------------

  private async assertList(
    listId: string,
    user?: AuthenticatedUser,
  ): Promise<KeywordListDocument> {
    if (!Types.ObjectId.isValid(listId)) {
      throw new NotFoundException(`Keyword list ${listId} not found`);
    }
    const list = await this.listModel.findById(listId).exec();
    if (!list) throw new NotFoundException(`Keyword list ${listId} not found`);
    if (user) await this.clients.assertAccess(list.clientId.toString(), user);
    return list;
  }
}

// --- module-level parsing helpers ------------------------------------------

function prune(row: ParsedKeywordRow): Partial<ParsedKeywordRow> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out as Partial<ParsedKeywordRow>;
}

function isNumeric(v: string | undefined): boolean {
  if (!v) return false;
  return /^[\d.,\s$%]+$/.test(v.trim());
}

/**
 * Numbers in these exports arrive as "1,300", "12.5%", "$3.40" or
 * "1 300". Strip everything that isn't part of the value, and treat a
 * comma as a thousands separator unless it's clearly a decimal comma.
 */
function toNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  let s = v.trim().replace(/[$%\s]/g, '');
  if (!s) return undefined;
  const decimalComma = /^\d+,\d{1,2}$/.test(s);
  s = decimalComma ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function assign(
  row: ParsedKeywordRow,
  field: keyof ParsedKeywordRow,
  value: string | undefined,
) {
  if (value === undefined) return;
  const v = value.trim();
  if (!v) return;
  switch (field) {
    case 'volume':
    case 'difficulty':
    case 'cpc': {
      const n = toNumber(v);
      if (n !== undefined) row[field] = n;
      return;
    }
    case 'intent': {
      const hit = INTENT_ALIASES[v.toLowerCase()];
      if (hit) row.intent = hit;
      return;
    }
    default:
      row[field] = v as never;
  }
}

/** Picks the delimiter that splits the sample most consistently. */
function pickDelimiter(lines: string[]): '\t' | ',' | ';' | null {
  const sample = lines.slice(0, 10);
  for (const d of ['\t', ';', ','] as const) {
    const counts = sample.map((l) => splitDelimited(l, d).length);
    if (counts.every((c) => c > 1) && new Set(counts).size <= 2) return d;
  }
  return null;
}

/** Split honouring double-quoted cells, which CSV exports use. */
function splitDelimited(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}
