import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as cheerio from 'cheerio';
import {
  LinkGraphSnapshot,
  LinkGraphSnapshotDocument,
} from './link-graph.schema';
import { ClientsService } from '../clients/clients.service';
import { AuthenticatedUser } from '../auth/roles.guard';

const USER_AGENT =
  'MediaSpearheadCrawler/1.0 (+https://mediaspearhead.com/bot)';
const REQUEST_TIMEOUT_MS = 12000;
const CONCURRENCY = 4;
const DEFAULT_PAGE_CAP = 500;

interface CrawlContext {
  origin: string;
  disallowed: string[];
  visited: Set<string>;
  edges: Array<{ from: string; to: string; anchor?: string }>;
  nodes: Map<string, {
    url: string;
    title?: string;
    statusCode?: number;
    depth: number;
    contentLength?: number;
    contentType?: string;
    errorMessage?: string;
  }>;
  pageCap: number;
  warnings: string[];
  capHit: boolean;
}

@Injectable()
export class LinkGraphService {
  private readonly logger = new Logger(LinkGraphService.name);

  constructor(
    @InjectModel(LinkGraphSnapshot.name)
    private readonly model: Model<LinkGraphSnapshotDocument>,
    private readonly clients: ClientsService,
  ) {}

  async listSnapshots(clientId: string, user: AuthenticatedUser) {
    await this.clients.assertAccess(clientId, user);
    return this.model
      .find(
        { clientId: new Types.ObjectId(clientId) },
        {
          nodes: 0,
          edges: 0,
        },
      )
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();
  }

  async getSnapshot(
    clientId: string,
    snapshotId: string,
    user: AuthenticatedUser,
  ) {
    await this.clients.assertAccess(clientId, user);
    const doc = await this.model
      .findOne({
        _id: new Types.ObjectId(snapshotId),
        clientId: new Types.ObjectId(clientId),
      })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Snapshot not found');
    return doc;
  }

  /**
   * Kicks off an async crawl. Returns the snapshot doc immediately
   * with status='running' — the caller polls `getSnapshot()` until
   * status flips to 'completed' or 'failed'. Prevents concurrent
   * crawls for the same client so we don't hammer the origin.
   */
  async startCrawl(
    clientId: string,
    opts: { pageCap?: number },
    user: AuthenticatedUser,
  ): Promise<LinkGraphSnapshotDocument> {
    await this.clients.assertAccess(clientId, user);

    const running = await this.model
      .exists({
        clientId: new Types.ObjectId(clientId),
        status: 'running',
      })
      .exec();
    if (running) {
      throw new BadRequestException(
        'A crawl is already running for this client. Wait for it to finish.',
      );
    }

    const client = await this.clients.findOne(clientId, user);
    const seed = (client as { url?: string }).url;
    if (!seed) {
      throw new BadRequestException(
        'Client has no URL configured. Set it in Edit client first.',
      );
    }

    const snapshot = await this.model.create({
      clientId: new Types.ObjectId(clientId),
      seedUrl: seed,
      status: 'running',
      startedAt: new Date(),
      pageCap: opts.pageCap ?? DEFAULT_PAGE_CAP,
    });

    // Fire-and-forget background crawl. Errors are captured into the
    // snapshot doc, not propagated — the frontend polls to see status.
    this.runCrawl(snapshot._id as Types.ObjectId, seed, opts.pageCap ?? DEFAULT_PAGE_CAP).catch(
      (err) => {
        this.logger.error(
          `Crawl ${snapshot._id} threw: ${(err as Error).message}`,
          (err as Error).stack,
        );
      },
    );

    return snapshot;
  }

  /**
   * Actual crawl loop. Runs entirely async, updates the snapshot doc
   * on completion. Never throws upstream — failures land in the
   * snapshot's errorMessage + status='failed'.
   */
  private async runCrawl(
    snapshotId: Types.ObjectId,
    seedUrl: string,
    pageCap: number,
  ): Promise<void> {
    const started = Date.now();
    const ctx: CrawlContext = {
      origin: '',
      disallowed: [],
      visited: new Set<string>(),
      edges: [],
      nodes: new Map(),
      pageCap,
      warnings: [],
      capHit: false,
    };

    try {
      const seedNormalized = this.normalizeUrl(seedUrl);
      if (!seedNormalized) throw new Error(`Invalid seed URL: ${seedUrl}`);
      const parsed = new URL(seedNormalized);
      ctx.origin = parsed.origin;

      // 1. robots.txt — fetch and parse Disallow rules for our UA.
      try {
        ctx.disallowed = await this.fetchRobotsDisallow(parsed.origin);
      } catch (err) {
        ctx.warnings.push(
          `robots.txt fetch failed: ${(err as Error).message}. Proceeding without robots restrictions.`,
        );
      }

      // 2. Sitemap seed — try /sitemap.xml, /sitemap_index.xml, and any
      // referenced by robots.txt. All URLs from sitemaps get depth=1
      // as a starting frontier (they'll be overridden by shorter paths
      // as BFS discovers them via internal links).
      const sitemapUrls = await this.harvestSitemapUrls(
        parsed.origin,
        ctx.warnings,
      );

      // 3. BFS: queue starts with seed at depth 0, then sitemap URLs
      // seeded at a placeholder depth (they'll be filled by actual
      // BFS traversal from the seed). Same page-vs-asset filter as
      // extractInternalLinks so an image sitemap or a misconfigured
      // media listing can't sneak assets into the seed queue.
      const queue: Array<{ url: string; depth: number }> = [
        { url: seedNormalized, depth: 0 },
        ...sitemapUrls
          .filter((u) => this.isSameOrigin(u, ctx.origin))
          .filter((u) => this.isPageUrl(u))
          .map((u) => ({ url: u, depth: 1 })),
      ];

      let idx = 0;
      while (idx < queue.length && ctx.nodes.size < pageCap) {
        // Batch a slice of unvisited URLs so we can fetch concurrently.
        const batch: Array<{ url: string; depth: number }> = [];
        while (batch.length < CONCURRENCY && idx < queue.length) {
          const item = queue[idx++];
          if (ctx.visited.has(item.url)) continue;
          if (ctx.nodes.size + batch.length >= pageCap) break;
          if (this.isDisallowed(item.url, ctx.disallowed)) {
            ctx.warnings.push(`Skipped (robots.txt): ${item.url}`);
            continue;
          }
          ctx.visited.add(item.url);
          batch.push(item);
        }
        if (batch.length === 0) continue;

        const results = await Promise.all(
          batch.map((b) => this.fetchPage(b.url).catch((err) => ({
            url: b.url,
            depth: b.depth,
            statusCode: undefined as number | undefined,
            html: undefined as string | undefined,
            contentType: undefined as string | undefined,
            contentLength: undefined as number | undefined,
            errorMessage: (err as Error).message,
          }))),
        );

        for (let i = 0; i < results.length; i++) {
          const item = batch[i];
          const res = results[i];
          const node = {
            url: item.url,
            statusCode: res.statusCode,
            depth: item.depth,
            contentType: res.contentType,
            contentLength: res.contentLength,
            errorMessage: (res as { errorMessage?: string }).errorMessage,
            title: undefined as string | undefined,
          };

          if (res.html && this.isHtml(res.contentType)) {
            const $ = cheerio.load(res.html);
            node.title = ($('title').first().text() || '').trim() || undefined;
            const links = this.extractInternalLinks(
              $,
              item.url,
              ctx.origin,
            );
            for (const link of links) {
              ctx.edges.push({
                from: item.url,
                to: link.url,
                anchor: link.anchor,
              });
              if (
                !ctx.visited.has(link.url) &&
                !queue.some((q) => q.url === link.url) &&
                ctx.nodes.size + queue.length < pageCap * 2
              ) {
                queue.push({ url: link.url, depth: item.depth + 1 });
              }
            }
          }
          ctx.nodes.set(item.url, node);
        }
      }

      if (ctx.nodes.size >= pageCap) {
        ctx.capHit = true;
        ctx.warnings.push(
          `Reached the ${pageCap} page cap. Increase the cap or export from Screaming Frog for a full graph.`,
        );
      }

      // 4a. Dedupe edges. A single page often links to another
      // through the nav bar, footer, sidebar, and inline body copy —
      // that's 4+ raw <a href> hits for the same (from, to) pair.
      // Rendering all of them buries the graph in redundant lines
      // and blows up dagre's edge-routing cost. Collapse to one
      // edge per (from, to) — keep the first non-empty anchor
      // encountered so context isn't lost.
      const dedupedMap = new Map<string, { from: string; to: string; anchor?: string }>();
      for (const e of ctx.edges) {
        const key = `${e.from} ${e.to}`;
        const existing = dedupedMap.get(key);
        if (!existing) {
          dedupedMap.set(key, { from: e.from, to: e.to, anchor: e.anchor });
        } else if (!existing.anchor && e.anchor) {
          existing.anchor = e.anchor;
        }
      }
      ctx.edges = Array.from(dedupedMap.values());

      // 4b. Compute per-node inbound / outbound counts + orphan flag.
      const inboundBy = new Map<string, number>();
      const outboundBy = new Map<string, number>();
      for (const e of ctx.edges) {
        inboundBy.set(e.to, (inboundBy.get(e.to) ?? 0) + 1);
        outboundBy.set(e.from, (outboundBy.get(e.from) ?? 0) + 1);
      }

      const nodesArr = Array.from(ctx.nodes.values()).map((n) => ({
        url: n.url,
        title: n.title,
        statusCode: n.statusCode,
        depth: n.depth,
        contentLength: n.contentLength,
        contentType: n.contentType,
        errorMessage: n.errorMessage,
        inboundCount: inboundBy.get(n.url) ?? 0,
        outboundCount: outboundBy.get(n.url) ?? 0,
        isOrphan: (inboundBy.get(n.url) ?? 0) === 0 && n.url !== seedNormalized,
      }));

      const orphansCount = nodesArr.filter((n) => n.isOrphan).length;
      const maxDepth = nodesArr.reduce((acc, n) => Math.max(acc, n.depth), 0);

      await this.model.updateOne(
        { _id: snapshotId },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            totalPages: nodesArr.length,
            totalEdges: ctx.edges.length,
            maxDepth,
            orphansCount,
            capHit: ctx.capHit,
            warnings: ctx.warnings,
            nodes: nodesArr,
            edges: ctx.edges,
          },
        },
      );

      this.logger.log(
        `Crawl ${snapshotId} done in ${Date.now() - started}ms — ${nodesArr.length} pages, ${ctx.edges.length} edges, ${orphansCount} orphans.`,
      );
    } catch (err) {
      const message = (err as Error).message || 'crawl failed';
      await this.model.updateOne(
        { _id: snapshotId },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: message,
            warnings: ctx.warnings,
          },
        },
      );
    }
  }

  // --- HTTP helpers ------------------------------------------------------

  private async fetchPage(url: string): Promise<{
    url: string;
    statusCode: number;
    html?: string;
    contentType?: string;
    contentLength?: number;
  }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      const contentType =
        res.headers.get('content-type')?.toLowerCase() || undefined;
      const contentLength = res.headers.get('content-length')
        ? Number(res.headers.get('content-length'))
        : undefined;
      if (!this.isHtml(contentType)) {
        return { url, statusCode: res.status, contentType, contentLength };
      }
      const html = await res.text();
      return {
        url,
        statusCode: res.status,
        html,
        contentType,
        contentLength: contentLength ?? html.length,
      };
    } finally {
      clearTimeout(t);
    }
  }

  private async fetchRobotsDisallow(origin: string): Promise<string[]> {
    const url = `${origin}/robots.txt`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
      });
      if (!res.ok) return [];
      const body = await res.text();
      // Parse only Disallow rules that apply to us (User-agent: * or
      // MediaSpearheadCrawler). Keep it simple — no wildcards / regex.
      const lines = body.split('\n');
      let applies = false;
      const rules: string[] = [];
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const [rawKey, ...rest] = line.split(':');
        if (!rawKey) continue;
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key === 'user-agent') {
          applies =
            value === '*' ||
            value.toLowerCase().includes('mediaspearhead');
        } else if (applies && key === 'disallow' && value) {
          rules.push(value);
        }
      }
      return rules;
    } finally {
      clearTimeout(t);
    }
  }

  private isDisallowed(url: string, disallowed: string[]): boolean {
    if (!disallowed.length) return false;
    try {
      const path = new URL(url).pathname;
      return disallowed.some(
        (rule) => rule === '/' || path.startsWith(rule),
      );
    } catch {
      return false;
    }
  }

  // --- Sitemap helpers ---------------------------------------------------

  private async harvestSitemapUrls(
    origin: string,
    warnings: string[],
  ): Promise<string[]> {
    const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
    const urls = new Set<string>();
    for (const candidate of candidates) {
      try {
        const found = await this.readSitemap(candidate);
        for (const u of found) urls.add(u);
        if (found.length > 0) break;
      } catch (err) {
        warnings.push(
          `Sitemap ${candidate}: ${(err as Error).message}`,
        );
      }
    }
    return Array.from(urls);
  }

  private async readSitemap(url: string): Promise<string[]> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      // sitemap index (nested sitemaps) — recurse one level.
      const nested = $('sitemap > loc')
        .map((_i, el) => $(el).text().trim())
        .get()
        .filter(Boolean);
      if (nested.length > 0) {
        const results: string[] = [];
        for (const sm of nested.slice(0, 10)) {
          try {
            results.push(...(await this.readSitemap(sm)));
          } catch {
            // swallow — one broken child sitemap shouldn't kill the whole crawl
          }
        }
        return results;
      }
      // Flat url set.
      return $('url > loc')
        .map((_i, el) => $(el).text().trim())
        .get()
        .filter(Boolean);
    } finally {
      clearTimeout(t);
    }
  }

  // --- Link extraction --------------------------------------------------

  /**
   * Extensions and path prefixes that we never treat as pages. Filters
   * out image lightbox anchors (WordPress wraps <img> in <a> pointing
   * to the raw .webp / .jpg), PDF/CSS/JS assets, CMS admin routes,
   * and feed endpoints — none of which contribute to the *page*-level
   * link graph the user cares about.
   */
  private readonly SKIP_EXTENSIONS = new Set([
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp',
    '.avif', '.heic', '.heif', '.tiff',
    // Video / audio
    '.mp4', '.mov', '.webm', '.mkv', '.avi', '.mp3', '.wav', '.ogg',
    '.flac', '.m4a',
    // Documents / archives
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip',
    '.rar', '.7z', '.tar', '.gz', '.csv',
    // Assets
    '.css', '.js', '.mjs', '.map', '.json', '.xml', '.txt',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
  ]);

  private readonly SKIP_PATH_PREFIXES = [
    // WordPress admin + core APIs
    '/wp-admin/',
    '/wp-login',
    '/wp-json/',
    '/wp-content/uploads/',
    '/wp-content/plugins/',
    '/wp-content/themes/',
    '/wp-includes/',
    // Feed endpoints
    '/feed/',
    '/rss/',
    '/comments/feed/',
    // Common asset dirs
    '/assets/',
    '/static/',
    '/cdn-cgi/',
    // Shopify equivalents
    '/cart',
    '/checkouts/',
  ];

  private isPageUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      // Filter by extension — the last path segment's extension.
      const lastDot = path.lastIndexOf('.');
      const lastSlash = path.lastIndexOf('/');
      if (lastDot > lastSlash && lastDot !== -1) {
        const ext = path.slice(lastDot);
        if (this.SKIP_EXTENSIONS.has(ext)) return false;
      }
      // Filter by path prefix.
      for (const prefix of this.SKIP_PATH_PREFIXES) {
        if (path.startsWith(prefix)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private extractInternalLinks(
    $: cheerio.CheerioAPI,
    fromUrl: string,
    origin: string,
  ): Array<{ url: string; anchor?: string }> {
    const results: Array<{ url: string; anchor?: string }> = [];
    const seen = new Set<string>();
    $('a[href]').each((_i, el) => {
      const href = ($(el).attr('href') || '').trim();
      if (!href) return;
      // Skip mailto / tel / javascript / anchors that don't navigate.
      if (
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:') ||
        href.startsWith('#')
      ) {
        return;
      }
      const abs = this.resolveAndNormalize(href, fromUrl);
      if (!abs) return;
      if (!this.isSameOrigin(abs, origin)) return;
      if (abs === fromUrl) return; // ignore self-links
      // Filter out media / asset / admin URLs so the graph reflects
      // page-to-page structure only. WordPress-generated lightbox
      // anchors were the biggest offender — they wrap every image
      // in a link to the raw file, polluting the graph with dozens
      // of /wp-content/uploads/*.webp "pages".
      if (!this.isPageUrl(abs)) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      const anchor = ($(el).text() || '').trim().slice(0, 120) || undefined;
      results.push({ url: abs, anchor });
    });
    return results;
  }

  private isHtml(contentType?: string): boolean {
    if (!contentType) return false;
    return (
      contentType.includes('text/html') ||
      contentType.includes('application/xhtml')
    );
  }

  private isSameOrigin(url: string, origin: string): boolean {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  }

  private resolveAndNormalize(href: string, base: string): string | null {
    try {
      const abs = new URL(href, base);
      return this.normalizeUrl(abs.toString());
    } catch {
      return null;
    }
  }

  /**
   * Strip fragments, trailing slashes on non-root paths, and remove
   * common tracking query params so `/foo` and `/foo?utm_source=x`
   * count as the same node.
   */
  private normalizeUrl(url: string): string | null {
    try {
      const u = new URL(url);
      u.hash = '';
      const drop = new Set([
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'gclid',
        'fbclid',
        'mc_cid',
        'mc_eid',
      ]);
      const params = new URLSearchParams(u.search);
      for (const key of Array.from(params.keys())) {
        if (drop.has(key.toLowerCase())) params.delete(key);
      }
      u.search = params.toString();
      // Collapse trailing slash unless it's the origin root
      if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        u.pathname = u.pathname.replace(/\/+$/, '');
      }
      return u.toString();
    } catch {
      return null;
    }
  }
}
