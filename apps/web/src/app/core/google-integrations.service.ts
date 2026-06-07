import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { GoogleConnectionStatus, GscBreakdown, ReportKpis } from '@seo/shared';
import { API_BASE_URL } from './api.config';

export interface GoogleKpisResult {
  kpis: ReportKpis;
  sources: { gsc: boolean; ga4: boolean; warnings: string[] };
}

export interface GoogleConnectionTest {
  gsc: { ok: boolean; message?: string };
  ga4: { ok: boolean; message?: string };
}

@Injectable({ providedIn: 'root' })
export class GoogleIntegrationsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  status(): Observable<GoogleConnectionStatus> {
    return this.http.get<GoogleConnectionStatus>(`${this.base}/google/auth/status`);
  }

  authUrl(returnTo?: string): Observable<{ url: string }> {
    const qs = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
    return this.http.get<{ url: string }>(`${this.base}/google/auth/url${qs}`);
  }

  disconnect() {
    return this.http.post(`${this.base}/google/auth/disconnect`, {});
  }

  listGscSites() {
    return this.http.get<Array<{ siteUrl: string; permissionLevel?: string }>>(
      `${this.base}/google/gsc/sites`,
    );
  }

  kpisForClient(clientId: string, from: string, to: string): Observable<GoogleKpisResult> {
    const qs = new URLSearchParams({ clientId, from, to });
    return this.http.get<GoogleKpisResult>(`${this.base}/google/kpis?${qs.toString()}`);
  }

  testConnections(clientId: string): Observable<GoogleConnectionTest> {
    const qs = new URLSearchParams({ clientId });
    return this.http.get<GoogleConnectionTest>(
      `${this.base}/google/test-connections?${qs.toString()}`,
    );
  }

  gscBreakdown(clientId: string, from: string, to: string): Observable<GscBreakdown> {
    const qs = new URLSearchParams({ clientId, from, to });
    return this.http.get<GscBreakdown>(
      `${this.base}/google/gsc/breakdown?${qs.toString()}`,
    );
  }
}
