import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export type CannibalizationSeverity = 'high' | 'medium' | 'low';

export interface CannibalizedPage {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface CannibalizedQuery {
  query: string;
  pages: CannibalizedPage[];
  totalClicks: number;
  totalImpressions: number;
  severity: CannibalizationSeverity;
  dismissed: boolean;
  dismissedNote?: string;
}

export interface KeywordCannibalizationResponse {
  refreshedAt: string;
  startDate: string;
  endDate: string;
  totalQueries: number;
  bySeverity: { high: number; medium: number; low: number };
  items: CannibalizedQuery[];
}

export interface CanonicalMismatchItem {
  url: string;
  userCanonical?: string;
  googleCanonical?: string;
  coverageState?: string;
  lastCheckedAt: string;
}

export interface CanonicalMismatchResponse {
  total: number;
  items: CanonicalMismatchItem[];
}

export interface InternalOverlapPiece {
  _id: string;
  title: string;
  status: string;
  publishedUrl?: string;
  briefUrl?: string;
}

export interface InternalOverlapItem {
  targetKeyword: string;
  pieces: InternalOverlapPiece[];
}

export interface InternalOverlapResponse {
  total: number;
  items: InternalOverlapItem[];
}

@Injectable({ providedIn: 'root' })
export class CannibalizationService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  keywords(
    clientId: string,
    refresh = false,
  ): Observable<KeywordCannibalizationResponse> {
    const qs = refresh ? '?refresh=1' : '';
    return this.http.get<KeywordCannibalizationResponse>(
      `${this.base}/clients/${clientId}/cannibalization/keywords${qs}`,
    );
  }

  canonicals(clientId: string): Observable<CanonicalMismatchResponse> {
    return this.http.get<CanonicalMismatchResponse>(
      `${this.base}/clients/${clientId}/cannibalization/canonicals`,
    );
  }

  internal(clientId: string): Observable<InternalOverlapResponse> {
    return this.http.get<InternalOverlapResponse>(
      `${this.base}/clients/${clientId}/cannibalization/internal`,
    );
  }

  dismiss(
    clientId: string,
    query: string,
    note?: string,
  ): Observable<{ dismissed: true }> {
    return this.http.post<{ dismissed: true }>(
      `${this.base}/clients/${clientId}/cannibalization/dismiss`,
      { query, note },
    );
  }

  undismiss(
    clientId: string,
    query: string,
  ): Observable<{ dismissed: false }> {
    return this.http.request<{ dismissed: false }>(
      'DELETE',
      `${this.base}/clients/${clientId}/cannibalization/dismiss`,
      { body: { query } },
    );
  }
}
