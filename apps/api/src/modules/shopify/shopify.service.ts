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

interface ResourceNode {
  id: string;
  handle: string;
  title: string;
  status?: string;
  updatedAt?: string;
  onlineStoreUrl?: string | null;
  seo?: SeoObject;
}

interface PaginatedResource {
  edges: Array<{ cursor: string; node: ResourceNode }>;
  pageInfo: { hasNextPage: boolean; endCursor?: string };
}

@Injectable()
export class ShopifyService {
  private readonly logger = new Logger(ShopifyService.name);

  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    private readonly clients: ClientsService,
  ) {}

  private async getCredentials(
    clientId: string,
    user?: AuthenticatedUser,
  ): Promise<{ shopDomain: string; accessToken: string }> {
    if (user) await this.clients.assertAccess(clientId, user);
    const client = await this.clientModel.findById(clientId).lean().exec();
    if (!client) throw new NotFoundException(`Client ${clientId} not found`);
    const shopDomain = (client.shopifyShopDomain ?? '').trim();
    const accessToken = (client.shopifyAccessToken ?? '').trim();
    if (!shopDomain || !accessToken) {
      throw new BadRequestException(
        'Client is missing shopifyShopDomain or shopifyAccessToken',
      );
    }
    return { shopDomain: this.normalizeShop(shopDomain), accessToken };
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
      const { shopDomain, accessToken } = await this.getCredentials(
        clientId,
        user,
      );
      const data = await this.gql<ShopConnection>(
        shopDomain,
        accessToken,
        `query { shop { name myshopifyDomain primaryDomain { url } } }`,
      );
      return {
        connected: true,
        shopDomain,
        shopName: data.shop.name,
        primaryDomain: data.shop.primaryDomain?.url,
      };
    } catch (err) {
      return {
        connected: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Verify a domain+token pair without persisting them. Used for the
   * "Test before saving" UX in the connection settings panel.
   */
  async verifyRaw(shopDomain: string, accessToken: string): Promise<ShopifyConnectionInfo> {
    if (!shopDomain || !accessToken) {
      return { connected: false, error: 'shopDomain and accessToken are required' };
    }
    try {
      const dom = this.normalizeShop(shopDomain);
      const data = await this.gql<ShopConnection>(
        dom,
        accessToken,
        `query { shop { name myshopifyDomain primaryDomain { url } } }`,
      );
      return {
        connected: true,
        shopDomain: dom,
        shopName: data.shop.name,
        primaryDomain: data.shop.primaryDomain?.url,
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
    const { shopDomain, accessToken } = await this.getCredentials(clientId, user);
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
              id handle title updatedAt onlineStoreUrl
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
              seo { title description }
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
              seo { title description }
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
        seoTitle: e.node.seo?.title ?? undefined,
        seoDescription: e.node.seo?.description ?? undefined,
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
            edges { node { id handle title seo { title description } } }
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
            edges { node { id handle title seo { title description } } }
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

    // Pages and Articles use the newer signature: ($id: ID!, $input: XInput!)
    if (resource === 'page' || resource === 'article') {
      const query = `mutation Update($id: ID!, $input: ${cfg.inputType}!) {
        ${cfg.name}(id: $id, ${cfg.field}: $input) {
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
      >(shopDomain, accessToken, query, { id, input: { seo } });
      const result = data[cfg.name];
      if (result.userErrors?.length) {
        return { error: result.userErrors.map((e) => e.message).join('; ') };
      }
      const ret = result[cfg.field] as { id: string } | undefined;
      if (!ret?.id) return { error: 'Shopify returned empty result' };
      return { id: ret.id };
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
    const { shopDomain, accessToken } = await this.getCredentials(clientId, user);
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
        const currentTitle = node.seo?.title ?? '';
        const currentDesc = node.seo?.description ?? '';
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
    const { shopDomain, accessToken } = await this.getCredentials(clientId, user);
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
