import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Report } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  byClient(clientId: string): Observable<Report[]> {
    return this.http.get<Report[]>(`${this.base}/reports?clientId=${clientId}`);
  }

  byCycle(clientId: string, cycleId: string): Observable<Report | null> {
    return this.http.get<Report | null>(
      `${this.base}/reports/by-cycle?clientId=${clientId}&cycleId=${cycleId}`,
    );
  }

  upsert(dto: Partial<Report> & { clientId: string; cycleId: string }) {
    return this.http.post<Report>(`${this.base}/reports`, dto);
  }

  autoCompose(clientId: string, cycleId: string) {
    return this.http.post<Report>(`${this.base}/reports/auto-compose`, { clientId, cycleId });
  }

  pdfUrl(clientId: string, cycleId: string) {
    return `${this.base}/reports/pdf/${clientId}/${cycleId}`;
  }

  pdfBlob(clientId: string, cycleId: string) {
    return this.http.get(`${this.base}/reports/pdf/${clientId}/${cycleId}`, {
      responseType: 'blob',
    });
  }

  share(clientId: string, cycleId: string) {
    return this.http.post<{
      shareToken: string;
      sharedAt: string;
      pin?: string;
      pinProtected: boolean;
    }>(`${this.base}/reports/share`, { clientId, cycleId });
  }

  resetSharePin(clientId: string, cycleId: string) {
    return this.http.post<{ pin: string }>(
      `${this.base}/reports/share/reset-pin`,
      { clientId, cycleId },
    );
  }

  sendNotification(clientId: string, cycleId: string, recipients: string[]) {
    return this.http.post<{ sentTo: string[]; messageId: string }>(
      `${this.base}/reports/share/send-notification`,
      { clientId, cycleId, recipients },
    );
  }

  revokeShare(clientId: string, cycleId: string) {
    return this.http.request<{ revoked: boolean }>('DELETE', `${this.base}/reports/share`, {
      body: { clientId, cycleId },
    });
  }

  publicMeta(token: string) {
    return this.http.get<{
      locked: boolean;
      client: { name: string; url: string; industry?: string };
      cycle: { label: string; startDate: string; endDate: string };
    }>(`${this.base}/public/reports/${token}`);
  }

  publicUnlock(token: string, pin: string) {
    return this.http.post<{ pdfUnlockToken: string; payload: any }>(
      `${this.base}/public/reports/${token}/unlock`,
      { pin },
    );
  }

  publicPdfBlob(token: string, unlock: string) {
    return this.http.get(
      `${this.base}/public/reports/${token}/pdf?unlock=${encodeURIComponent(unlock)}`,
      { responseType: 'blob' },
    );
  }

  publicPdfUrl(token: string, unlock: string) {
    return `${this.base}/public/reports/${token}/pdf?unlock=${encodeURIComponent(unlock)}`;
  }

  kpiHistory(clientId: string, limit = 6) {
    return this.http.get<Array<{ cycleLabel?: string; generatedAt: string; kpis: Report['kpis'] }>>(
      `${this.base}/reports/kpi-history?clientId=${clientId}&limit=${limit}`,
    );
  }
}
