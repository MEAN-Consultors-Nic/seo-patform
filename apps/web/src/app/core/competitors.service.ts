import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Competitor } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class CompetitorsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  byClient(clientId: string): Observable<Competitor[]> {
    return this.http.get<Competitor[]>(`${this.base}/competitors?clientId=${clientId}`);
  }

  create(dto: Partial<Competitor>): Observable<Competitor> {
    return this.http.post<Competitor>(`${this.base}/competitors`, dto);
  }

  update(id: string, dto: Partial<Competitor>): Observable<Competitor> {
    return this.http.patch<Competitor>(`${this.base}/competitors/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/competitors/${id}`);
  }

  addKeyword(
    competitorId: string,
    payload: {
      keywordId: string;
      position?: number;
      rankingUrl?: string;
      notes?: string;
    },
  ): Observable<Competitor> {
    return this.http.post<Competitor>(
      `${this.base}/competitors/${competitorId}/keywords`,
      payload,
    );
  }

  updateKeyword(
    competitorId: string,
    entryId: string,
    patch: { position?: number; rankingUrl?: string; notes?: string },
  ): Observable<Competitor> {
    return this.http.patch<Competitor>(
      `${this.base}/competitors/${competitorId}/keywords/${entryId}`,
      patch,
    );
  }

  removeKeyword(competitorId: string, entryId: string) {
    return this.http.delete<{ deleted: true }>(
      `${this.base}/competitors/${competitorId}/keywords/${entryId}`,
    );
  }
}
