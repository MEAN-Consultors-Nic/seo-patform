import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ShopifyApplyResultRow,
  ShopifyConnectionInfo,
  ShopifyResource,
  ShopifyResourceItem,
  ShopifySeoPreviewRow,
} from '@seo/shared';
import { API_BASE_URL } from './api.config';

export interface ShopifyListResult {
  items: ShopifyResourceItem[];
  hasNextPage: boolean;
  endCursor?: string;
}

@Injectable({ providedIn: 'root' })
export class ShopifyService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  test(clientId: string): Observable<ShopifyConnectionInfo> {
    const params = new HttpParams().set('clientId', clientId);
    return this.http.get<ShopifyConnectionInfo>(`${this.base}/shopify/test`, {
      params,
    });
  }

  testRaw(shopDomain: string, accessToken: string): Observable<ShopifyConnectionInfo> {
    return this.http.post<ShopifyConnectionInfo>(`${this.base}/shopify/test-raw`, {
      shopDomain,
      accessToken,
    });
  }

  list(
    clientId: string,
    resource: ShopifyResource,
    opts: { cursor?: string; limit?: number; q?: string } = {},
  ): Observable<ShopifyListResult> {
    let params = new HttpParams()
      .set('clientId', clientId)
      .set('resource', resource);
    if (opts.cursor) params = params.set('cursor', opts.cursor);
    if (opts.limit) params = params.set('limit', String(opts.limit));
    if (opts.q) params = params.set('q', opts.q);
    return this.http.get<ShopifyListResult>(`${this.base}/shopify/list`, { params });
  }

  preview(
    clientId: string,
    resource: ShopifyResource,
    csvText: string,
  ): Observable<ShopifySeoPreviewRow[]> {
    return this.http.post<ShopifySeoPreviewRow[]>(
      `${this.base}/shopify/seo/preview`,
      { clientId, resource, csvText },
    );
  }

  apply(
    clientId: string,
    resource: ShopifyResource,
    rows: Array<{
      handle: string;
      id: string;
      newSeoTitle?: string;
      newSeoDescription?: string;
    }>,
  ): Observable<ShopifyApplyResultRow[]> {
    return this.http.post<ShopifyApplyResultRow[]>(
      `${this.base}/shopify/seo/apply`,
      { clientId, resource, rows },
    );
  }
}
