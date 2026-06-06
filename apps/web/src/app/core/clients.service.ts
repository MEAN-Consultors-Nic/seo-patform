import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Client, ClientTier } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(filters: { tier?: ClientTier; active?: boolean } = {}): Observable<Client[]> {
    const qs = new URLSearchParams();
    if (filters.tier) qs.set('tier', filters.tier);
    if (typeof filters.active === 'boolean') qs.set('active', String(filters.active));
    return this.http.get<Client[]>(`${this.base}/clients?${qs.toString()}`);
  }

  get(id: string): Observable<Client> {
    return this.http.get<Client>(`${this.base}/clients/${id}`);
  }

  create(dto: Partial<Client>): Observable<Client> {
    return this.http.post<Client>(`${this.base}/clients`, dto);
  }

  update(id: string, dto: Partial<Client>): Observable<Client> {
    return this.http.patch<Client>(`${this.base}/clients/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/clients/${id}`);
  }

  stats(): Observable<{ perTier: Array<{ _id: string; count: number; totalHours: number }>; totalHoursPerCycle: number }> {
    return this.http.get<any>(`${this.base}/clients/stats`);
  }

  listWithStats(filters: { tier?: ClientTier; active?: boolean } = {}): Observable<ClientWithStats[]> {
    const qs = new URLSearchParams();
    if (filters.tier) qs.set('tier', filters.tier);
    if (typeof filters.active === 'boolean') qs.set('active', String(filters.active));
    return this.http.get<ClientWithStats[]>(`${this.base}/clients/with-stats?${qs.toString()}`);
  }
}

export interface ClientWithStats extends Client {
  stats: {
    keywords: {
      total: number;
      ranked: number;
      top3: number;
      top10: number;
      avgPosition: number | null;
      gainers: number;
      losers: number;
    };
    currentCycleTasks: {
      total: number;
      completed: number;
    };
    currentCycleHours: {
      actual: number;
      assigned: number;
      pct: number;
    };
    backlinks: number;
  };
}
