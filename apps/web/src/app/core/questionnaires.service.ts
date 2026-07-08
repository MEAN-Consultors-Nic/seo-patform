import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Questionnaire, QuestionnaireKind } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class QuestionnairesService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(filters: { kind?: QuestionnaireKind; status?: string } = {}) {
    const qs = new URLSearchParams();
    if (filters.kind) qs.set('kind', filters.kind);
    if (filters.status) qs.set('status', filters.status);
    return this.http.get<Questionnaire[]>(
      `${this.base}/questionnaires?${qs.toString()}`,
    );
  }

  findOne(id: string) {
    return this.http.get<Questionnaire>(`${this.base}/questionnaires/${id}`);
  }

  create(payload: {
    kind: QuestionnaireKind;
    businessName: string;
    invitedEmail?: string;
    leadId?: string;
    clientId?: string;
  }) {
    return this.http.post<Questionnaire>(
      `${this.base}/questionnaires`,
      payload,
    );
  }

  remove(id: string) {
    return this.http.delete<{ deleted: true }>(
      `${this.base}/questionnaires/${id}`,
    );
  }

  publicView(token: string) {
    return this.http.get<Questionnaire>(
      `${this.base}/questionnaires/public/${token}`,
    );
  }

  publicSubmit(token: string, answers: Record<string, unknown>) {
    return this.http.post<Questionnaire>(
      `${this.base}/questionnaires/public/${token}/submit`,
      { answers },
    );
  }
}
