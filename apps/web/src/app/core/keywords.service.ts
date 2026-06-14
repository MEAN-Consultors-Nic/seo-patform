import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  GscKeywordPullResult,
  Keyword,
  KeywordRanking,
  RankingDevice,
} from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class KeywordsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  byClient(clientId: string): Observable<Keyword[]> {
    return this.http.get<Keyword[]>(`${this.base}/keywords?clientId=${clientId}`);
  }

  findOne(id: string): Observable<Keyword> {
    return this.http.get<Keyword>(`${this.base}/keywords/${id}`);
  }

  summary(clientId: string): Observable<{
    total: number;
    ranked: number;
    unranked: number;
    top3: number;
    top10: number;
    top20: number;
    avgPosition: number | null;
  }> {
    return this.http.get<any>(`${this.base}/keywords/summary?clientId=${clientId}`);
  }

  create(dto: Partial<Keyword>): Observable<Keyword> {
    return this.http.post<Keyword>(`${this.base}/keywords`, dto);
  }

  update(id: string, dto: Partial<Keyword>): Observable<Keyword> {
    return this.http.patch<Keyword>(`${this.base}/keywords/${id}`, dto);
  }

  recordPosition(id: string, payload: {
    position: number;
    rankingUrl?: string;
    device?: RankingDevice;
    notes?: string;
  }): Observable<Keyword> {
    return this.http.post<Keyword>(`${this.base}/keywords/${id}/positions`, payload);
  }

  history(id: string, limit = 60): Observable<KeywordRanking[]> {
    return this.http.get<KeywordRanking[]>(`${this.base}/keywords/${id}/history?limit=${limit}`);
  }

  timeline(id: string): Observable<{
    keyword: Keyword;
    rankings: KeywordRanking[];
    urlEvents: Array<{ from?: string; to: string; date: string }>;
  }> {
    return this.http.get<any>(`${this.base}/keywords/${id}/timeline`);
  }

  movements(clientId: string) {
    return this.http.get<{
      gainers: Array<{ keyword: Keyword; delta: number; direction: string }>;
      losers: Array<{ keyword: Keyword; delta: number; direction: string }>;
      flat: Array<{ keyword: Keyword; delta: number; direction: string }>;
      fresh: Array<{ keyword: Keyword; delta: number; direction: string }>;
    }>(`${this.base}/keywords/movements?clientId=${clientId}`);
  }

  volatility(clientId: string) {
    return this.http.get<Array<{
      keyword: Keyword;
      uniqueUrls: number;
      urls: string[];
      changesIn90Days: number;
    }>>(`${this.base}/keywords/volatility?clientId=${clientId}`);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/keywords/${id}`);
  }

  pullFromGsc(dto: {
    clientId: string;
    from: string;
    to: string;
    limit?: number;
    minImpressions?: number;
  }): Observable<GscKeywordPullResult> {
    return this.http.post<GscKeywordPullResult>(`${this.base}/keywords/pull-gsc`, dto);
  }

  cleanGscPulled(clientId: string): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(
      `${this.base}/keywords/gsc-pulled/${clientId}`,
    );
  }

  syncFromGsc(dto: {
    clientId: string;
    from: string;
    to: string;
  }): Observable<{
    updated: number;
    notFound: number;
    failed: number;
    totalProcessed: number;
    range: { from: string; to: string };
    warnings: string[];
  }> {
    return this.http.post<{
      updated: number;
      notFound: number;
      failed: number;
      totalProcessed: number;
      range: { from: string; to: string };
      warnings: string[];
    }>(`${this.base}/keywords/sync-gsc`, dto);
  }
}
