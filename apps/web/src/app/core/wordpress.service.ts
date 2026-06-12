import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  WordpressApplyResultRow,
  WordpressConnectionInfo,
  WordpressPostType,
  WordpressResourceItem,
  WordpressSeoPlugin,
  WordpressSeoPreviewRow,
} from '@seo/shared';
import { API_BASE_URL } from './api.config';

export interface WordpressListResult {
  items: WordpressResourceItem[];
  totalPages: number;
  page: number;
}

@Injectable({ providedIn: 'root' })
export class WordpressService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  test(clientId: string): Observable<WordpressConnectionInfo> {
    const params = new HttpParams().set('clientId', clientId);
    return this.http.get<WordpressConnectionInfo>(`${this.base}/wordpress/test`, {
      params,
    });
  }

  testRaw(input: {
    siteUrl: string;
    username: string;
    appPassword: string;
    seoPlugin?: WordpressSeoPlugin;
  }): Observable<WordpressConnectionInfo> {
    return this.http.post<WordpressConnectionInfo>(
      `${this.base}/wordpress/test-raw`,
      input,
    );
  }

  postTypes(clientId: string): Observable<WordpressPostType[]> {
    const params = new HttpParams().set('clientId', clientId);
    return this.http.get<WordpressPostType[]>(
      `${this.base}/wordpress/post-types`,
      { params },
    );
  }

  list(
    clientId: string,
    postType: string,
    opts: { page?: number; perPage?: number; search?: string } = {},
  ): Observable<WordpressListResult> {
    let params = new HttpParams()
      .set('clientId', clientId)
      .set('postType', postType);
    if (opts.page) params = params.set('page', String(opts.page));
    if (opts.perPage) params = params.set('perPage', String(opts.perPage));
    if (opts.search) params = params.set('search', opts.search);
    return this.http.get<WordpressListResult>(`${this.base}/wordpress/list`, {
      params,
    });
  }

  preview(
    clientId: string,
    postType: string,
    csvText: string,
  ): Observable<WordpressSeoPreviewRow[]> {
    return this.http.post<WordpressSeoPreviewRow[]>(
      `${this.base}/wordpress/seo/preview`,
      { clientId, postType, csvText },
    );
  }

  apply(
    clientId: string,
    postType: string,
    rows: Array<{
      slug: string;
      id: number;
      newSeoTitle?: string;
      newSeoDescription?: string;
    }>,
  ): Observable<WordpressApplyResultRow[]> {
    return this.http.post<WordpressApplyResultRow[]>(
      `${this.base}/wordpress/seo/apply`,
      { clientId, postType, rows },
    );
  }
}
