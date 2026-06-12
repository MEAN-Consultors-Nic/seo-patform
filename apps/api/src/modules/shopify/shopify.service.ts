import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ShopifyApplyResultRow,
  ShopifyAuthMode,
  ShopifyConnectionInfo,
  ShopifyResource,
  ShopifyResourceItem,
  ShopifySeoCsvRow,
  ShopifySeoPreviewRow,
} from '@seo/shared';
import { Client, ClientDocument } from '../clients/client.schema';
import { AuthenticatedUser } from '../auth/roles.guard';
import { ClientsService } from '../clients/clients.service';

const SHOPIFY_API_VERSION = '2025-01';
// Shopify Dev Dashboard tokens are valid for 86399s. We refresh 60s early
// so an in-flight request never lands on an expired token.
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

interface ShopifyGraphqlError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  extensions?: Record<string, unknown>;
}

interface ShopifyGraphqlResponse<T> {
  data?: T;
  errors?: ShopifyGraphqlError[];
  extensions?: { cost?: unknown };
}

interface ShopConnection {
  shop: {
    name: string;
    myshopifyDomain: string;
    primaryDomain: { url: string };
  };
}

interface SeoObject {
  title?: string | null;
  description?: string | null;
}

interface MetafieldValue {
  value?: string | null;
}

interface ResourceNode {
  id: string;
  handle: string;
  title: string;
  status?: string;
  updatedAt?: string;
  onlineStoreUrl?: string | null;
  seo?: SeoObject;
  // Used by Page/Article (no direct `seo` field in the Admin API — SEO
  // lives in metafields under namespace "global").
  seoTitleMeta?: MetafieldValue | null;
  seoDescriptionMeta?: MetafieldValue | null;
}

interface PaginatedResource {
  edges: Array<{ cursor: string; node: ResourceNode }>;
  pageInfo: { hasNextPage: boolean; endCursor?: string };
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

interface ResolvedAuth {
  shopDomain: string;
  accessToken: string;
  authMode: ShopifyAuthMode;
  tokenExpiresAt?: number;
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  // Per-process cache, keyed by `${shopDomain}:${clientId}`.
  // We're OK with multiple Heroku dynos each minting their own token —
  // at worst we exchange a couple of extra times within 24h, no correctness
  // problem because Shopify lets multiple tokens coexist.
  private readonly tokenCache = new Map<string, CachedToken>();

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

  /**
   * Resolves a usable Shopify Admin API access token for the client.
   * Auth modes (in priority order):
   *   1. Dev Dashboard OAuth — uses client_id + client_secret via
   *      client_credentials grant. Token cached 24h - 60s.
   *   2. Legacy static token — uses a pre-existing `shpat_…` token.
   */
  private async resolveAuth(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<ResolvedAuth> {
    const client = await this.loadClient(clientId, user);
    return this.resolveAuthFromClient(client);
  }

  private async resolveAuthFromClient(client: Client): Promise<ResolvedAuth> {
    const shopDomain = (client.shopifyShopDomain ?? '').trim();
    if (!shopDomain) {
      throw new BadRequestException('Client is missing shopifyShopDomain');
    }
    const dom = this.normalizeShop(shopDomain);

    const cid = (client.shopifyClientId ?? '').trim();
    const csec = (client.shopifyClientSecret ?? '').trim();
    if (cid && csec) {
      const cached = await this.getOrMintOauthToken(dom, cid, csec);
      return {
        shopDomain: dom,
        accessToken: cached.token,
        authMode: 'oauth-client-credentials',
        tokenExpiresAt: cached.expiresAt,
      };
    }

    const legacy = (client.shopifyAccessToken ?? '').trim();
    if (legacy) {
      return {
        shopDomain: dom,
        accessToken: legacy,
        authMode: 'legacy-token',
      };
    }

    throw new BadRequestException(
      'Client has no Shopify auth configured. Provide either shopifyClientId + shopifyClientSecret (Dev Dashboard) or a legacy shopifyAccessToken.',
    );
  }

  private async getOrMintOauthToken(
    shopDomain: string,
    clientId: string,
    clientSecret: string,
  ): Promise<CachedToken> {
    const key = `${shopDomain}:${clientId}`;
    const cached = this.tokenCache.get(key);
    if (cached && cached.expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
      return cached;
    }
    return this.mintOauthToken(shopDomain, clientId, clientSecret);
  }

  private async mintOauthToken(
    shopDomain: string,
    clientId: string,
    clientSecret: string,
  ): Promise<CachedToken> {
    const url = `https://${shopDomain}/admin/oauth/access_token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Shopify OAuth network error: ${(err as Error).message}`,
      );
    }

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException(
          `Shopify OAuth ${res.status}: invalid client_id/client_secret, or the app and store are not in the same Shopify organization.`,
        );
      }
      throw new InternalServerErrorException(
        `Shopify OAuth HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    let parsed: { access_token?: string; expires_in?: number; scope?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new InternalServerErrorException(
        `Shopify OAuth returned non-JSON: ${text.slice(0, 200)}`,
      );
    }
    if (!parsed.access_token) {
      throw new InternalServerErrorException(
        `Shopify OAuth response missing access_token: ${text.slice(0, 200)}`,
      );
    }

    const expiresMs = (parsed.expires_in ?? 86399) * 1000;
    const cached: CachedToken = {
      token: parsed.access_token,
      expiresAt: Date.now() + expiresMs,
    };
    this.tokenCache.set(`${shopDomain}:${clientId}`, cached);
    return cached;
  }

  private normalizeShop(input: string): string {
    let s = input.trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!s.endsWith('.myshopify.com')) {
      if (!s.includes('.')) s = `${s}.myshopify.com`;
    }
    return s;
  }

  private async gql<T>(
    shopDomain: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ query, variables: variables ?? {} }),
      });
    } catch (err) {
      this.logger.error(`Shopify network error: ${(err as Error).message}`);
      throw new InternalServerErrorException(
        `Shopify network error: ${(err as Error).message}`,
      );
    }

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new BadRequestException(
          `Shopify auth failed (${res.status}). Check shopifyAccessToken and admin scopes.`,
        );
      }
      throw new InternalServerErrorException(
        `Shopify HTTP ${res.status}: ${text.slice(0, 500)}`,
      );
    }

    let parsed: ShopifyGraphqlResponse<T>;
    try {
      parsed = JSON.parse(text) as ShopifyGraphqlResponse<T>;
    } catch {
      throw new InternalServerErrorException(
        `Shopify returned non-JSON: ${text.slice(0, 200)}`,
      );
    }

    if (parsed.errors?.length) {
      const msg = parsed.errors.map((e) => e.message).join('; ');
      throw new BadRequestException(`Shopify GraphQL error: ${msg}`);
    }
    if (!parsed.data) {
      throw new InternalServerErrorException('Shopify returned empty data');
    }
    return parsed.data;
  }

  async verifyAccess(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<ShopifyConnectionInfo> {
    try {
      const auth = await this.resolveAuth(clientId, user);
      const data = await this.gql<ShopConnection>(
        auth.shopDomain,
        auth.accessToken,
        `query { shop { name myshopifyDomain primaryDomain { url } } }`,
      );
      return {
        connected: true,
        shopDomain: auth.shopDomain,
        shopName: data.shop.name,
        primaryDomain: data.shop.primaryDomain?.url,
        authMode: auth.authMode,
        tokenExpiresAt: auth.tokenExpiresAt
          ? new Date(auth.tokenExpiresAt).toISOString()
          : undefined,
      };
    } catch (err) {
      return {
        connected: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Verify a connection candidate without persisting it. Accepts either
   * (shopDomain + clientId + clientSecret) for the Dev Dashboard OAuth flow,
   * or (shopDomain + accessToken) for legacy custom apps.
   */
  async verifyRaw(input: {
    shopDomain?: string;
    clientId?: string;
    clientSecret?: string;
    accessToken?: string;
  }): Promise<ShopifyConnectionInfo> {
    const shopDomain = (input.shopDomain ?? '').trim();
    if (!shopDomain) {
      return { connected: false, error: 'shopDomain is required' };
    }
    const cid = (input.clientId ?? '').trim();
    const csec = (input.clientSecret ?? '').trim();
    const accessToken = (input.accessToken ?? '').trim();
    if (!accessToken && !(cid && csec)) {
      return {
        connected: false,
        error: 'Provide either clientId + clientSecret (Dev Dashboard) or a legacy accessToken.',
      };
    }
    try {
      const dom = this.normalizeShop(shopDomain);
      let token = accessToken;
      let authMode: ShopifyAuthMode = 'legacy-token';
      let tokenExpiresAt: number | undefined;
      if (cid && csec) {
        const minted = await this.mintOauthToken(dom, cid, csec);
        token = minted.token;
        tokenExpiresAt = minted.expiresAt;
        authMode = 'oauth-client-credentials';
      }
      const data = await this.gql<ShopConnection>(
        dom,
        token,
        `query { shop { name myshopifyDomain primaryDomain { url } } }`,
      );
      return {
        connected: true,
        shopDomain: dom,
        shopName: data.shop.name,
        primaryDomain: data.shop.primaryDomain?.url,
        authMode,
        tokenExpiresAt: tokenExpiresAt
          ? new Date(tokenExpiresAt).toISOString()
          : undefined,
      };
    } catch (err) {
      return { connected: false, error: (err as Error).message };
    }
  }

  // --- Listing -----------------------------------------------------------

  async list(
    clientId: string,
    resource: ShopifyResource,
    opts: { cursor?: string; limit?: number; query?: string },
    user?: AuthenticatedUser,
  ): Promise<{
    items: ShopifyResourceItem[];
    hasNextPage: boolean;
    endCursor?: string;
  }> {
    const { shopDomain, accessToken } = await this.resolveAuth(clientId, user);
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

    if (resource === 'product') {
      const data = await this.gql<{ products: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query Products($first: Int!, $after: String, $query: String) {
          products(first: $first, after: $after, query: $query) {
            edges { cursor node {
              id handle title status updatedAt onlineStoreUrl
              seo { title description }
            } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first: limit, after: opts.cursor ?? null, query: opts.query ?? null },
      );
      return this.mapPaged(data.products);
    }
    if (resource === 'collection') {
      const data = await this.gql<{ collections: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query Collections($first: Int!, $after: String, $query: String) {
          collections(first: $first, after: $after, query: $query) {
            edges { cursor node {
              id handle title updatedAt
              seo { title description }
            } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first: limit, after: opts.cursor ?? null, query: opts.query ?? null },
      );
      return this.mapPaged(data.collections);
    }
    if (resource === 'page') {
      const data = await this.gql<{ pages: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query Pages($first: Int!, $after: String, $query: String) {
          pages(first: $first, after: $after, query: $query) {
            edges { cursor node {
              id handle title updatedAt
              seoTitleMeta: metafield(namespace: "global", key: "title_tag") { value }
              seoDescriptionMeta: metafield(namespace: "global", key: "description_tag") { value }
            } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first: limit, after: opts.cursor ?? null, query: opts.query ?? null },
      );
      return this.mapPaged(data.pages);
    }
    if (resource === 'article') {
      const data = await this.gql<{ articles: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query Articles($first: Int!, $after: String, $query: String) {
          articles(first: $first, after: $after, query: $query) {
            edges { cursor node {
              id handle title updatedAt
              seoTitleMeta: metafield(namespace: "global", key: "title_tag") { value }
              seoDescriptionMeta: metafield(namespace: "global", key: "description_tag") { value }
            } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { first: limit, after: opts.cursor ?? null, query: opts.query ?? null },
      );
      return this.mapPaged(data.articles);
    }
    throw new BadRequestException(`Unknown resource: ${resource}`);
  }

  private mapPaged(p: PaginatedResource): {
    items: ShopifyResourceItem[];
    hasNextPage: boolean;
    endCursor?: string;
  } {
    return {
      items: p.edges.map((e) => ({
        id: e.node.id,
        handle: e.node.handle,
        title: e.node.title,
        status: e.node.status,
        updatedAt: e.node.updatedAt,
        onlineStoreUrl: e.node.onlineStoreUrl ?? undefined,
        seoTitle:
          e.node.seo?.title ??
          e.node.seoTitleMeta?.value ??
          undefined,
        seoDescription:
          e.node.seo?.description ??
          e.node.seoDescriptionMeta?.value ??
          undefined,
      })),
      hasNextPage: p.pageInfo.hasNextPage,
      endCursor: p.pageInfo.endCursor,
    };
  }

  // --- Lookup by handle ---------------------------------------------------

  async lookupByHandle(
    shopDomain: string,
    accessToken: string,
    resource: ShopifyResource,
    handle: string,
  ): Promise<ResourceNode | null> {
    // Shopify supports `query: "handle:foo"` filtering on each resource's list.
    if (resource === 'product') {
      const data = await this.gql<{ products: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query($q: String!) {
          products(first: 1, query: $q) {
            edges { node { id handle title seo { title description } } }
          }
        }`,
        { q: `handle:${handle}` },
      );
      return data.products.edges[0]?.node ?? null;
    }
    if (resource === 'collection') {
      const data = await this.gql<{ collections: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query($q: String!) {
          collections(first: 1, query: $q) {
            edges { node { id handle title seo { title description } } }
          }
        }`,
        { q: `handle:${handle}` },
      );
      return data.collections.edges[0]?.node ?? null;
    }
    if (resource === 'page') {
      const data = await this.gql<{ pages: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query($q: String!) {
          pages(first: 1, query: $q) {
            edges { node {
              id handle title
              seoTitleMeta: metafield(namespace: "global", key: "title_tag") { value }
              seoDescriptionMeta: metafield(namespace: "global", key: "description_tag") { value }
            } }
          }
        }`,
        { q: `handle:${handle}` },
      );
      return data.pages.edges[0]?.node ?? null;
    }
    if (resource === 'article') {
      const data = await this.gql<{ articles: PaginatedResource }>(
        shopDomain,
        accessToken,
        `query($q: String!) {
          articles(first: 1, query: $q) {
            edges { node {
              id handle title
              seoTitleMeta: metafield(namespace: "global", key: "title_tag") { value }
              seoDescriptionMeta: metafield(namespace: "global", key: "description_tag") { value }
            } }
          }
        }`,
        { q: `handle:${handle}` },
      );
      return data.articles.edges[0]?.node ?? null;
    }
    return null;
  }

  // --- SEO update mutations ----------------------------------------------

  async updateSeo(
    shopDomain: string,
    accessToken: string,
    resource: ShopifyResource,
    id: string,
    seoTitle: string | undefined,
    seoDescription: string | undefined,
  ): Promise<{ id: string } | { error: string }> {
    const seo: Record<string, string> = {};
    if (typeof seoTitle === 'string') seo.title = seoTitle;
    if (typeof seoDescription === 'string') seo.description = seoDescription;

    const mutationMap: Record<
      ShopifyResource,
      { name: string; field: string; inputType: string }
    > = {
      product: {
        name: 'productUpdate',
        field: 'product',
        inputType: 'ProductInput',
      },
      collection: {
        name: 'collectionUpdate',
        field: 'collection',
        inputType: 'CollectionInput',
      },
      page: { name: 'pageUpdate', field: 'page', inputType: 'PageUpdateInput' },
      article: {
        name: 'articleUpdate',
        field: 'article',
        inputType: 'ArticleUpdateInput',
      },
    };
    const cfg = mutationMap[resource];

    // Pages and Articles have no direct `seo` field — their SEO data lives in
    // the `global.title_tag` and `global.description_tag` metafields. We use
    // the resource-agnostic `metafieldsSet` mutation to set them at once.
    if (resource === 'page' || resource === 'article') {
      const metafields: Array<{
        ownerId: string;
        namespace: string;
        key: string;
        type: string;
        value: string;
      }> = [];
      if (typeof seoTitle === 'string') {
        metafields.push({
          ownerId: id,
          namespace: 'global',
          key: 'title_tag',
          type: 'single_line_text_field',
          value: seoTitle,
        });
      }
      if (typeof seoDescription === 'string') {
        metafields.push({
          ownerId: id,
          namespace: 'global',
          key: 'description_tag',
          type: 'single_line_text_field',
          value: seoDescription,
        });
      }
      if (!metafields.length) {
        return { error: 'Nothing to update' };
      }
      const query = `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message code }
        }
      }`;
      const data = await this.gql<{
        metafieldsSet: {
          metafields: Array<{ id: string }>;
          userErrors: Array<{ field: string[]; message: string; code?: string }>;
        };
      }>(shopDomain, accessToken, query, { metafields });
      if (data.metafieldsSet.userErrors?.length) {
        return {
          error: data.metafieldsSet.userErrors
            .map((e) => e.message)
            .join('; '),
        };
      }
      return { id };
    }

    // Products and Collections use ($input: XInput!) with input.id
    const query = `mutation Update($input: ${cfg.inputType}!) {
      ${cfg.name}(input: $input) {
        ${cfg.field} { id }
        userErrors { field message }
      }
    }`;
    const data = await this.gql<
      Record<
        string,
        {
          userErrors: Array<{ field: string[]; message: string }>;
        } & Record<string, { id: string } | undefined>
      >
    >(shopDomain, accessToken, query, {
      input: { id, seo },
    });
    const result = data[cfg.name];
    if (result.userErrors?.length) {
      return { error: result.userErrors.map((e) => e.message).join('; ') };
    }
    const ret = result[cfg.field] as { id: string } | undefined;
    if (!ret?.id) return { error: 'Shopify returned empty result' };
    return { id: ret.id };
  }

  // --- CSV preview + apply -----------------------------------------------

  parseCsv(csvText: string): ShopifySeoCsvRow[] {
    const text = csvText.replace(/﻿/g, '');
    const lines = this.splitCsvLines(text);
    if (lines.length === 0) return [];
    const header = this.splitCsvRow(lines[0]).map((c) =>
      c.trim().toLowerCase(),
    );
    const hIdx = header.indexOf('handle');
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
    if (hIdx === -1) {
      throw new BadRequestException(
        'CSV must include a "handle" column. Headers found: ' +
          header.join(', '),
      );
    }
    if (tIdx === -1 && dIdx === -1) {
      throw new BadRequestException(
        'CSV must include at least one of: seo_title, seo_description',
      );
    }
    const out: ShopifySeoCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = this.splitCsvRow(line);
      const handle = (cols[hIdx] ?? '').trim();
      if (!handle) continue;
      const row: ShopifySeoCsvRow = { handle };
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
    // Splits on newlines but respects quoted fields that contain \n.
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
    resource: ShopifyResource,
    csvText: string,
    user?: AuthenticatedUser,
  ): Promise<ShopifySeoPreviewRow[]> {
    const { shopDomain, accessToken } = await this.resolveAuth(clientId, user);
    const rows = this.parseCsv(csvText);
    if (!rows.length) throw new BadRequestException('CSV has no data rows');

    const out: ShopifySeoPreviewRow[] = [];
    // Sequential lookup is fine for MVP. Shopify rate-limits at ~2 req/sec on
    // GraphQL with a 1000-point bucket; we keep things conservative.
    for (const row of rows) {
      try {
        const node = await this.lookupByHandle(
          shopDomain,
          accessToken,
          resource,
          row.handle,
        );
        if (!node) {
          out.push({
            handle: row.handle,
            matched: false,
            titleChanged: false,
            descriptionChanged: false,
            error: 'Handle not found in Shopify',
          });
          continue;
        }
        const currentTitle =
          node.seo?.title ?? node.seoTitleMeta?.value ?? '';
        const currentDesc =
          node.seo?.description ?? node.seoDescriptionMeta?.value ?? '';
        const newTitle = row.seoTitle;
        const newDesc = row.seoDescription;
        out.push({
          handle: row.handle,
          matched: true,
          id: node.id,
          title: node.title,
          currentSeoTitle: currentTitle || undefined,
          currentSeoDescription: currentDesc || undefined,
          newSeoTitle: newTitle,
          newSeoDescription: newDesc,
          titleChanged: typeof newTitle === 'string' && newTitle !== currentTitle,
          descriptionChanged:
            typeof newDesc === 'string' && newDesc !== currentDesc,
        });
      } catch (err) {
        out.push({
          handle: row.handle,
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
    resource: ShopifyResource,
    rows: Array<{
      handle: string;
      id: string;
      newSeoTitle?: string;
      newSeoDescription?: string;
    }>,
    user?: AuthenticatedUser,
  ): Promise<ShopifyApplyResultRow[]> {
    const { shopDomain, accessToken } = await this.resolveAuth(clientId, user);
    if (!rows.length) throw new BadRequestException('No rows to apply');

    const results: ShopifyApplyResultRow[] = [];
    for (const row of rows) {
      if (!row.id) {
        results.push({
          handle: row.handle,
          success: false,
          error: 'Missing Shopify id (run preview first)',
        });
        continue;
      }
      if (row.newSeoTitle === undefined && row.newSeoDescription === undefined) {
        results.push({
          handle: row.handle,
          id: row.id,
          success: false,
          error: 'No changes to apply',
        });
        continue;
      }
      try {
        const r = await this.updateSeo(
          shopDomain,
          accessToken,
          resource,
          row.id,
          row.newSeoTitle,
          row.newSeoDescription,
        );
        if ('error' in r) {
          results.push({
            handle: row.handle,
            id: row.id,
            success: false,
            error: r.error,
          });
        } else {
          results.push({ handle: row.handle, id: r.id, success: true });
        }
      } catch (err) {
        results.push({
          handle: row.handle,
          id: row.id,
          success: false,
          error: (err as Error).message,
        });
      }
    }
    return results;
  }
}
