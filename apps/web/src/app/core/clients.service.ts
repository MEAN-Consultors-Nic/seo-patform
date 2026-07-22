import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Client,
  ClientAttachment,
  ClientHealthStatus,
  ClientRosterStats,
  ClientSubscription,
  ClientTier,
} from '@seo/shared';
import { API_BASE_URL } from './api.config';

export type CreateSubscriptionPayload = Omit<
  ClientSubscription,
  '_id' | 'createdAt' | 'updatedAt'
> & {
  serviceId: string;
};

export type UpdateSubscriptionPayload = Partial<CreateSubscriptionPayload>;

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

  /**
   * Roster-level KPI tiles for the Clients page. Aggregates totals,
   * per-service counts, and status buckets (at-risk / expansion /
   * canceled) across the caller's client scope.
   */
  rosterStats(): Observable<ClientRosterStats> {
    return this.http.get<ClientRosterStats>(`${this.base}/clients/roster-stats`);
  }

  addSubscription(clientId: string, payload: CreateSubscriptionPayload): Observable<Client> {
    return this.http.post<Client>(
      `${this.base}/clients/${clientId}/subscriptions`,
      payload,
    );
  }

  updateSubscription(
    clientId: string,
    subId: string,
    payload: UpdateSubscriptionPayload,
  ): Observable<Client> {
    return this.http.patch<Client>(
      `${this.base}/clients/${clientId}/subscriptions/${subId}`,
      payload,
    );
  }

  removeSubscription(clientId: string, subId: string) {
    return this.http.delete<{ deleted: true }>(
      `${this.base}/clients/${clientId}/subscriptions/${subId}`,
    );
  }

  addAttachment(clientId: string, attachment: Partial<ClientAttachment>): Observable<Client> {
    return this.http.post<Client>(
      `${this.base}/clients/${clientId}/attachments`,
      attachment,
    );
  }

  updateAttachment(
    clientId: string,
    publicId: string,
    patch: { label?: string },
  ): Observable<Client> {
    return this.http.patch<Client>(
      `${this.base}/clients/${clientId}/attachments/${encodeURIComponent(publicId)}`,
      patch,
    );
  }

  removeAttachment(clientId: string, publicId: string) {
    return this.http.delete<{ deleted: true }>(
      `${this.base}/clients/${clientId}/attachments/${encodeURIComponent(publicId)}`,
    );
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
    /** ISO date or null when the client has never received an outbound. */
    lastEmailAt?: string | Date | null;
    /** Whole days since the last outbound email; null when never. */
    daysSinceLastEmail?: number | null;
    /** 0-100 rollup used to bucket the health status. */
    healthScore?: number;
    /** Bucketed rollup used by the Clients page badges + filters. */
    healthStatus?: ClientHealthStatus;
  };
}
