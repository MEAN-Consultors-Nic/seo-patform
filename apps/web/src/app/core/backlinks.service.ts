import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Backlink, BacklinkStatus } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class BacklinksService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  byClient(clientId: string, status?: BacklinkStatus): Observable<Backlink[]> {
    const qs = new URLSearchParams({ clientId });
    if (status) qs.set('status', status);
    return this.http.get<Backlink[]>(`${this.base}/backlinks?${qs.toString()}`);
  }

  summary(clientId: string) {
    return this.http.get<{
      perStatus: Array<{ _id: string; count: number; avgDr: number }>;
      total: number;
      dofollow: number;
    }>(`${this.base}/backlinks/summary?clientId=${clientId}`);
  }

  create(dto: Partial<Backlink>): Observable<Backlink> {
    return this.http.post<Backlink>(`${this.base}/backlinks`, dto);
  }

  update(id: string, dto: Partial<Backlink>): Observable<Backlink> {
    return this.http.patch<Backlink>(`${this.base}/backlinks/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/backlinks/${id}`);
  }
}
