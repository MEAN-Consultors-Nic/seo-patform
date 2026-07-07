import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface SentEmailRow {
  _id: string;
  senderUserId?:
    | string
    | { _id: string; name: string; email: string };
  senderEmail?: string;
  clientId?: string | { _id: string; name: string; url?: string };
  kind: string;
  subject: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  attachmentNames?: string[];
  ok: boolean;
  errorMessage?: string;
  createdAt: string;
}

export interface SendEmailPayload {
  clientId?: string;
  kind?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  attachments?: Array<{ filename: string; contentBase64: string; mimeType?: string }>;
  replyTo?: string;
}

export interface DraftSeoEmailPayload {
  clientName: string;
  clientDomain?: string;
  periodLabel: string;
  clicks?: { current?: number; previous?: number };
  impressions?: { current?: number; previous?: number };
  avgPosition?: { current?: number; previous?: number };
  top10?: { current?: number; previous?: number };
  actionsCompleted: string[];
  notes?: string;
  signOff?: string;
}

export interface DraftSeoEmailResult {
  subject: string;
  htmlBody: string;
  usage?: { model: string; inputTokens?: number; outputTokens?: number };
}

@Injectable({ providedIn: 'root' })
export class CommsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  listEmails(filters: { clientId?: string; kind?: string; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (filters.clientId) qs.set('clientId', filters.clientId);
    if (filters.kind) qs.set('kind', filters.kind);
    if (filters.limit) qs.set('limit', String(filters.limit));
    return this.http.get<SentEmailRow[]>(
      `${this.base}/comms/emails?${qs.toString()}`,
    );
  }

  send(payload: SendEmailPayload) {
    return this.http.post<{ result: { ok: boolean; error?: string } }>(
      `${this.base}/comms/emails/send`,
      payload,
    );
  }

  aiStatus(): Observable<{ configured: boolean }> {
    return this.http.get<{ configured: boolean }>(
      `${this.base}/comms/ai/status`,
    );
  }

  draftSeoEmail(payload: DraftSeoEmailPayload) {
    return this.http.post<DraftSeoEmailResult>(
      `${this.base}/comms/emails/draft-seo-report`,
      payload,
    );
  }
}
