import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as cheerio from 'cheerio';
import {
  WordpressApplyResultRow,
  WordpressConnectionInfo,
  WordpressPostType,
  WordpressResourceItem,
  WordpressSeoCsvRow,
  WordpressSeoPlugin,
  WordpressSeoPreviewRow,
} from '@seo/shared';
import { Client, ClientDocument } from '../clients/client.schema';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';

// Map of plugin → (read keys, write keys). Plugins that store SEO data in
// post meta must register them via `register_meta(..., show_in_rest: true)`
// so they show up in REST responses. Yoast/RankMath/AIOSEO all do this in
// recent versions; if a site's plugin version is too old, the values will
// come back empty.
interface PluginMetaMap {
  titleKey: string;
  descriptionKey: string;
}

const PLUGIN_META: Record<Exclude<WordpressSeoPlugin, 'native'>, PluginMetaMap> = {
  yoast: {
    titleKey: '_yoast_wpseo_title',
    descriptionKey: '_yoast_wpseo_metadesc',
  },
  rankmath: {
    titleKey: 'rank_math_title',
    descriptionKey: 'rank_math_description',
  },
  aioseo: {
    titleKey: '_aioseo_title',
    descriptionKey: '_aioseo_description',
  },
};

interface WpType {
  name: string;
  slug: string;
  rest_base?: string;
  rest_namespace?: string;
  hierarchical?: boolean;
  _builtin?: boolean;
}

interface WpPostRaw {
  id: number;
  slug: string;
  link?: string;
  status?: string;
  modified?: string;
  modified_gmt?: string;
  type?: string;
  title?: { rendered?: string; raw?: string };
  meta?: Record<string, unknown>;
  yoast_head_json?: {
    title?: string;
    og_description?: string;
    description?: string;
    og_title?: string;
  };
}

@Injectable()
export class WordpressService {
  private readonly logger = new Logger(WordpressService.name);

  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    private readonly clients: ClientsService,
  ) {}

  private async loadClient(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<Client> {
    if (user) await this.clients.assertAccess(clientId, user);
    const client = await this.clientModel.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    return client;
  }

  private getCreds(client: Client): {
    siteUrl: string;
    username: string;
    appPassword: string;
    plugin: WordpressSeoPlugin;
  } {
    const siteUrl = (client.wordpressSiteUrl ?? '').trim();
    const username = (client.wordpressUsername ?? '').trim();
    const appPassword = (client.wordpressAppPassword ?? '').trim();
    if (!siteUrl || !username || !appPassword) {
      throw new BadRequestException(
        'Client is missing wordpressSiteUrl, wordpressUsername, or wordpressAppPassword',
      );
    }
    return {
      siteUrl: this.normalizeSiteUrl(siteUrl),
      username,
      appPassword,
      plugin: client.wordpressSeoPlugin ?? 'native',
    };
  }

  private normalizeSiteUrl(input: string): string {
    let s = input.trim();
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    return s.replace(/\/$/, '');
  }

  private buildBasicAuth(username: string, appPassword: string): string {
    // WordPress Application Passwords are displayed with spaces (e.g.
    // "AbCd EfGh IjKl MnOp"). Spaces are visual sugar — they must be
    // stripped before forming the credential pair.
    const password = appPassword.replace(/\s+/g, '');
    return (
      'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    );
  }

  private async wpFetch<T>(
    siteUrl: string,
    username: string,
    appPassword: string,
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const url = path.startsWith('http')
      ? path
      : `${siteUrl}/wp-json${path.startsWith('/') ? path : `/${path}`}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: this.buildBasicAuth(username, appPassword),
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `WordPress network error: ${(err as Error).message}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException(
          `WordPress auth failed (${res.status}). Verify username and Application Password and that REST API is reachable.`,
        );
      }
      if (res.status === 404) {
        throw new BadRequestException(
          `WordPress endpoint not found (404). Confirm REST API is enabled at ${siteUrl}/wp-json.`,
        );
      }
      throw new InternalServerErrorException(
        `WordPress HTTP ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new InternalServerErrorException(
        `WordPress returned non-JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  // --- Connection ---------------------------------------------------------

  async verifyAccess(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<WordpressConnectionInfo> {
    try {
      const client = await this.loadClient(clientId, user);
      const creds = this.getCreds(client);
      return this.verifyCreds(
        creds.siteUrl,
        creds.username,
        creds.appPassword,
        creds.plugin,
      );
    } catch (err) {
      return { connected: false, error: (err as Error).message };
    }
  }

  async verifyRaw(input: {
    siteUrl?: string;
    username?: string;
    appPassword?: string;
    seoPlugin?: WordpressSeoPlugin;
  }): Promise<WordpressConnectionInfo> {
    const siteUrl = (input.siteUrl ?? '').trim();
    const username = (input.username ?? '').trim();
    const appPassword = (input.appPassword ?? '').trim();
    if (!siteUrl || !username || !appPassword) {
      return {
        connected: false,
        error: 'siteUrl, username, and appPassword are required',
      };
    }
    try {
      return await this.verifyCreds(
        this.normalizeSiteUrl(siteUrl),
        username,
        appPassword,
        input.seoPlugin ?? 'native',
      );
    } catch (err) {
      return { connected: false, error: (err as Error).message };
    }
  }

  private async verifyCreds(
    siteUrl: string,
    username: string,
    appPassword: string,
    plugin: WordpressSeoPlugin,
  ): Promise<WordpressConnectionInfo> {
    const me = await this.wpFetch<{
      id: number;
      name: string;
      slug: string;
    }>(siteUrl, username, appPassword, '/wp/v2/users/me?context=edit');
    // Fetch site info for display
    let siteName = '';
    try {
      const settings = await this.wpFetch<{ title?: string }>(
        siteUrl,
        username,
        appPassword,
        '/wp/v2/settings',
      );
      siteName = settings?.title ?? '';
    } catch {
      // /wp/v2/settings requires administrator role; safe to skip
    }
    return {
      connected: true,
      siteUrl,
      siteName: siteName || undefined,
      user: me?.name,
      seoPlugin: plugin,
    };
  }

  // --- Post types ---------------------------------------------------------

  async listPostTypes(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<WordpressPostType[]> {
    const client = await this.loadClient(clientId, user);
    const creds = this.getCreds(client);
    const raw = await this.wpFetch<Record<string, WpType>>(
      creds.siteUrl,
      creds.username,
      creds.appPassword,
      '/wp/v2/types?context=edit',
    );
    // Filter out internal-only types like attachment, wp_block, etc. Keep
    // anything with a REST endpoint that's not noise.
    const SKIP_BUILTIN = new Set([
      'attachment',
      'nav_menu_item',
      'wp_block',
      'wp_template',
      'wp_template_part',
      'wp_global_styles',
      'wp_navigation',
    ]);
    return Object.values(raw)
      .filter((t) => !SKIP_BUILTIN.has(t.slug))
      .filter((t) => !!t.rest_base)
      .map((t) => ({
        slug: t.slug,
        name: t.name,
        restBase: t.rest_base as string,
        hierarchical: t.hierarchical,
        builtin: t._builtin,
      }));
  }

  // --- Listing ------------------------------------------------------------

  async list(
    clientId: string,
    postType: string,
    opts: { page?: number; perPage?: number; search?: string },
    user?: AuthenticatedUser,
  ): Promise<{
    items: WordpressResourceItem[];
    totalPages: number;
    page: number;
  }> {
    const client = await this.loadClient(clientId, user);
    const creds = this.getCreds(client);

    const restBase = await this.resolveRestBase(creds, postType);
    const perPage = Math.min(Math.max(opts.perPage ?? 50, 1), 100);
    const page = Math.max(opts.page ?? 1, 1);
    const qs = new URLSearchParams({
      context: 'edit',
      per_page: String(perPage),
      page: String(page),
      status: 'any',
      _fields:
        'id,slug,link,status,modified,modified_gmt,type,title,meta,yoast_head_json',
    });
    if (opts.search) qs.set('search', opts.search);

    // wp-json sends X-WP-TotalPages header — but `fetch` returns a Response
    // we don't expose here. Re-do a fetch that gives us headers.
    const url = `${creds.siteUrl}/wp-json/wp/v2/${restBase}?${qs.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.buildBasicAuth(creds.username, creds.appPassword),
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException(
          `WordPress auth failed (${res.status}) for ${postType}.`,
        );
      }
      throw new InternalServerErrorException(
        `WordPress HTTP ${res.status} on ${postType}: ${text.slice(0, 300)}`,
      );
    }
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1', 10);
    const raw = (await res.json()) as WpPostRaw[];

    const items = raw.map((p) => this.mapPost(p, creds.plugin, postType));
    // Fallback: SEO plugins like RankMath don't always register their post
    // meta with show_in_rest, so the meta object can come back empty even
    // when the page does have meta tags rendered on the live site. For any
    // published item missing seoTitle/seoDescription, fetch the rendered HTML
    // and parse <title> + <meta name="description"> as a last resort.
    await this.hydrateMissingMetaFromHtml(items);

    return {
      items,
      totalPages: isNaN(totalPages) ? 1 : totalPages,
      page,
    };
  }

  private async hydrateMissingMetaFromHtml(
    items: WordpressResourceItem[],
  ): Promise<void> {
    const candidates = items.filter(
      (i) =>
        (i.status === 'publish' || !i.status) &&
        !!i.link &&
        (!i.seoTitle || !i.seoDescription),
    );
    if (!candidates.length) return;
    const CONCURRENCY = 5;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (item) => {
          const meta = await this.fetchRenderedMeta(item.link as string);
          if (!item.seoTitle && meta.title) item.seoTitle = meta.title;
          if (!item.seoDescription && meta.description)
            item.seoDescription = meta.description;
        }),
      );
    }
  }

  private async fetchRenderedMeta(
    url: string,
  ): Promise<{ title?: string; description?: string }> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; MediaSpearheadSEOBot/1.0; +https://mediaspearhead.com)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(8000),
        redirect: 'follow',
      });
      if (!res.ok) return {};
      const html = await res.text();
      const $ = cheerio.load(html);
      const title =
        $('meta[property="og:title"]').first().attr('content')?.trim() ||
        $('title').first().text().trim() ||
        undefined;
      const description =
        $('meta[name="description"]').first().attr('content')?.trim() ||
        $('meta[property="og:description"]').first().attr('content')?.trim() ||
        undefined;
      return { title, description };
    } catch {
      return {};
    }
  }

  private async resolveRestBase(
    creds: { siteUrl: string; username: string; appPassword: string },
    postType: string,
  ): Promise<string> {
    // Common builtins have well-known rest bases — short-circuit to avoid
    // an extra round-trip.
    if (postType === 'post') return 'posts';
    if (postType === 'page') return 'pages';
    const types = await this.wpFetch<Record<string, WpType>>(
      creds.siteUrl,
      creds.username,
      creds.appPassword,
      `/wp/v2/types/${postType}?context=edit`,
    ).catch(() => null);
    // The detail endpoint actually returns a single type object, not a map.
    // We accept both shapes for safety.
    const t = (types as unknown as WpType) ?? null;
    if (t?.rest_base) return t.rest_base;
    return postType; // last-ditch fallback
  }

  private mapPost(
    p: WpPostRaw,
    plugin: WordpressSeoPlugin,
    postType: string,
  ): WordpressResourceItem {
    const meta = (p.meta ?? {}) as Record<string, unknown>;
    let seoTitle: string | undefined;
    let seoDescription: string | undefined;

    if (plugin === 'yoast') {
      seoTitle = this.firstStr(
        meta[PLUGIN_META.yoast.titleKey],
        p.yoast_head_json?.title,
        p.yoast_head_json?.og_title,
      );
      seoDescription = this.firstStr(
        meta[PLUGIN_META.yoast.descriptionKey],
        p.yoast_head_json?.description,
        p.yoast_head_json?.og_description,
      );
    } else if (plugin === 'rankmath') {
      seoTitle = this.firstStr(meta[PLUGIN_META.rankmath.titleKey]);
      seoDescription = this.firstStr(meta[PLUGIN_META.rankmath.descriptionKey]);
    } else if (plugin === 'aioseo') {
      seoTitle = this.firstStr(meta[PLUGIN_META.aioseo.titleKey]);
      seoDescription = this.firstStr(meta[PLUGIN_META.aioseo.descriptionKey]);
    }
    // For native WP, leave both undefined — the post title shows but there's
    // no separate SEO title/description field to surface.

    return {
      id: p.id,
      slug: p.slug,
      title: p.title?.rendered || p.title?.raw || p.slug,
      link: p.link,
      status: p.status,
      modified: p.modified_gmt
        ? `${p.modified_gmt}Z`
        : p.modified,
      postType: p.type || postType,
      seoTitle,
      seoDescription,
    };
  }

  private firstStr(...vals: unknown[]): string | undefined {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return v;
    }
    return undefined;
  }

  // --- Lookup by slug -----------------------------------------------------

  async lookupBySlug(
    creds: { siteUrl: string; username: string; appPassword: string; plugin: WordpressSeoPlugin },
    postType: string,
    slug: string,
  ): Promise<WpPostRaw | null> {
    const restBase = await this.resolveRestBase(creds, postType);
    const qs = new URLSearchParams({
      context: 'edit',
      slug,
      status: 'any',
      _fields:
        'id,slug,link,status,modified,type,title,meta,yoast_head_json',
    });
    const arr = await this.wpFetch<WpPostRaw[]>(
      creds.siteUrl,
      creds.username,
      creds.appPassword,
      `/wp/v2/${restBase}?${qs.toString()}`,
    );
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[0];
  }

  // --- Write meta ---------------------------------------------------------

  async updateSeo(
    clientId: string,
    postType: string,
    id: number,
    seoTitle: string | undefined,
    seoDescription: string | undefined,
    user?: AuthenticatedUser,
  ): Promise<{ id: number } | { error: string }> {
    const client = await this.loadClient(clientId, user);
    const creds = this.getCreds(client);
    if (creds.plugin === 'native') {
      return {
        error:
          'No SEO plugin configured (plugin=native). WordPress core has no separate meta title/description — install Yoast, RankMath, or AIOSEO and select it under Connection settings.',
      };
    }
    const m = PLUGIN_META[creds.plugin];
    const meta: Record<string, string> = {};
    if (typeof seoTitle === 'string') meta[m.titleKey] = seoTitle;
    if (typeof seoDescription === 'string')
      meta[m.descriptionKey] = seoDescription;
    if (!Object.keys(meta).length) return { error: 'Nothing to update' };

    const restBase = await this.resolveRestBase(creds, postType);
    try {
      const updated = await this.wpFetch<{ id: number }>(
        creds.siteUrl,
        creds.username,
        creds.appPassword,
        `/wp/v2/${restBase}/${id}`,
        { method: 'POST', body: JSON.stringify({ meta }) },
      );
      return { id: updated.id };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  // --- CSV preview + apply ------------------------------------------------

  parseCsv(csvText: string): WordpressSeoCsvRow[] {
    const text = csvText.replace(/﻿/g, '');
    const lines = this.splitCsvLines(text);
    if (!lines.length) return [];
    const header = this.splitCsvRow(lines[0]).map((c) =>
      c.trim().toLowerCase(),
    );
    const sIdx = header.findIndex((h) => h === 'slug' || h === 'handle');
    const tIdx = header.findIndex((h) =>
      ['seo_title', 'seo title', 'meta_title', 'meta title', 'title'].includes(
        h,
      ),
    );
    const dIdx = header.findIndex((h) =>
      [
        'seo_description',
        'seo description',
        'meta_description',
        'meta description',
        'description',
      ].includes(h),
    );
    if (sIdx === -1) {
      throw new BadRequestException(
        'CSV must include a "slug" column. Headers found: ' + header.join(', '),
      );
    }
    if (tIdx === -1 && dIdx === -1) {
      throw new BadRequestException(
        'CSV must include at least one of: seo_title, seo_description',
      );
    }
    const out: WordpressSeoCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = this.splitCsvRow(line);
      const slug = (cols[sIdx] ?? '').trim();
      if (!slug) continue;
      const row: WordpressSeoCsvRow = { slug };
      if (tIdx !== -1) {
        const v = (cols[tIdx] ?? '').trim();
        if (v) row.seoTitle = v;
      }
      if (dIdx !== -1) {
        const v = (cols[dIdx] ?? '').trim();
        if (v) row.seoDescription = v;
      }
      out.push(row);
    }
    return out;
  }

  private splitCsvLines(text: string): string[] {
    const lines: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuote && text[i + 1] === '"') {
          cur += '""';
          i++;
        } else {
          inQuote = !inQuote;
          cur += c;
        }
      } else if ((c === '\n' || c === '\r') && !inQuote) {
        if (c === '\r' && text[i + 1] === '\n') i++;
        lines.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  private splitCsvRow(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (c === ',' && !inQuote) {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  async previewBulkSeo(
    clientId: string,
    postType: string,
    csvText: string,
    user?: AuthenticatedUser,
  ): Promise<WordpressSeoPreviewRow[]> {
    const client = await this.loadClient(clientId, user);
    const creds = this.getCreds(client);
    if (creds.plugin === 'native') {
      throw new BadRequestException(
        'No SEO plugin configured (plugin=native). Select Yoast, RankMath, or AIOSEO in Connection settings.',
      );
    }
    const rows = this.parseCsv(csvText);
    if (!rows.length) throw new BadRequestException('CSV has no data rows');

    const out: WordpressSeoPreviewRow[] = [];
    for (const row of rows) {
      try {
        const node = await this.lookupBySlug(creds, postType, row.slug);
        if (!node) {
          out.push({
            slug: row.slug,
            matched: false,
            titleChanged: false,
            descriptionChanged: false,
            error: 'Slug not found in WordPress',
          });
          continue;
        }
        const item = this.mapPost(node, creds.plugin, postType);
        // Same HTML-rendered fallback used by `list` so the diff is honest
        // even when RankMath/AIOSEO don't expose meta via REST.
        if ((!item.seoTitle || !item.seoDescription) && item.link) {
          const rendered = await this.fetchRenderedMeta(item.link);
          if (!item.seoTitle && rendered.title) item.seoTitle = rendered.title;
          if (!item.seoDescription && rendered.description)
            item.seoDescription = rendered.description;
        }
        const currentTitle = item.seoTitle ?? '';
        const currentDesc = item.seoDescription ?? '';
        out.push({
          slug: row.slug,
          matched: true,
          id: item.id,
          title: item.title,
          currentSeoTitle: currentTitle || undefined,
          currentSeoDescription: currentDesc || undefined,
          newSeoTitle: row.seoTitle,
          newSeoDescription: row.seoDescription,
          titleChanged:
            typeof row.seoTitle === 'string' && row.seoTitle !== currentTitle,
          descriptionChanged:
            typeof row.seoDescription === 'string' &&
            row.seoDescription !== currentDesc,
        });
      } catch (err) {
        out.push({
          slug: row.slug,
          matched: false,
          titleChanged: false,
          descriptionChanged: false,
          error: (err as Error).message,
        });
      }
    }
    return out;
  }

  async applyBulkSeo(
    clientId: string,
    postType: string,
    rows: Array<{
      slug: string;
      id: number;
      newSeoTitle?: string;
      newSeoDescription?: string;
    }>,
    user?: AuthenticatedUser,
  ): Promise<WordpressApplyResultRow[]> {
    if (!rows.length) throw new BadRequestException('No rows to apply');
    const results: WordpressApplyResultRow[] = [];
    for (const row of rows) {
      if (!row.id) {
        results.push({
          slug: row.slug,
          success: false,
          error: 'Missing WordPress id (run preview first)',
        });
        continue;
      }
      if (row.newSeoTitle === undefined && row.newSeoDescription === undefined) {
        results.push({
          slug: row.slug,
          id: row.id,
          success: false,
          error: 'No changes to apply',
        });
        continue;
      }
      const r = await this.updateSeo(
        clientId,
        postType,
        row.id,
        row.newSeoTitle,
        row.newSeoDescription,
        user,
      );
      if ('error' in r) {
        results.push({
          slug: row.slug,
          id: row.id,
          success: false,
          error: r.error,
        });
      } else {
        results.push({ slug: row.slug, id: r.id, success: true });
      }
    }
    return results;
  }
}
