import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface PageIndexStatus {
  _id?: string;
  url: string;
  verdict: 'PASS' | 'NEUTRAL' | 'FAIL' | 'VERDICT_UNSPECIFIED';
  coverageState?: string;
  robotsTxtState?: string;
  indexingState?: string;
  pageFetchState?: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
  canonicalMismatch?: boolean;
  sitemaps?: string[];
  previousVerdict?: string;
  firstIndexedAt?: string;
  lastCheckedAt: string;
}

export interface IndexingSummary {
  total: number;
  indexed: number;
  notIndexed: number;
  unknown: number;
  newlyIndexedSinceLastPull: number;
  lastPulledAt?: string;
  byReason: Array<{ coverageState: string; count: number }>;
}

export interface PullResult {
  inspected: number;
  upserted: number;
  failed: number;
  durationMs: number;
  warnings: string[];
  summary: IndexingSummary;
}

export interface RequestIndexingResult {
  notified: boolean;
  notifiedAt?: string;
  inspection?: {
    verdict: string;
    coverageState?: string;
    lastCrawlTime?: string;
  };
  warning?: string;
}

@Injectable({ providedIn: 'root' })
export class IndexingService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(clientId: string): Observable<PageIndexStatus[]> {
    return this.http.get<PageIndexStatus[]>(
      `${this.base}/clients/${clientId}/indexing`,
    );
  }

  summary(clientId: string): Observable<IndexingSummary> {
    return this.http.get<IndexingSummary>(
      `${this.base}/clients/${clientId}/indexing/summary`,
    );
  }

  pull(clientId: string): Observable<PullResult> {
    return this.http.post<PullResult>(
      `${this.base}/clients/${clientId}/indexing/pull`,
      {},
    );
  }

  requestIndexing(
    clientId: string,
    url: string,
  ): Observable<RequestIndexingResult> {
    return this.http.post<RequestIndexingResult>(
      `${this.base}/clients/${clientId}/indexing/request-indexing`,
      { url },
    );
  }

  recheckUrl(
    clientId: string,
    url: string,
  ): Observable<{ row: PageIndexStatus | null }> {
    return this.http.post<{ row: PageIndexStatus | null }>(
      `${this.base}/clients/${clientId}/indexing/recheck`,
      { url },
    );
  }
}
