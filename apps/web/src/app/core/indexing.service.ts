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
  neutral: number;
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
}
