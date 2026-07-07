import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Proposal } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class ProposalsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(status?: string): Observable<Proposal[]> {
    const qs = status ? `?status=${status}` : '';
    return this.http.get<Proposal[]>(`${this.base}/proposals${qs}`);
  }

  findOne(id: string): Observable<Proposal> {
    return this.http.get<Proposal>(`${this.base}/proposals/${id}`);
  }

  create(dto: Partial<Proposal>): Observable<Proposal> {
    return this.http.post<Proposal>(`${this.base}/proposals`, dto);
  }

  update(id: string, dto: Partial<Proposal>): Observable<Proposal> {
    return this.http.patch<Proposal>(`${this.base}/proposals/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete<{ deleted: true }>(
      `${this.base}/proposals/${id}`,
    );
  }

  send(
    id: string,
    payload: { to: string; subject?: string; message?: string },
  ) {
    return this.http.post<{ proposal: Proposal; shareUrl: string }>(
      `${this.base}/proposals/${id}/send`,
      payload,
    );
  }
}
