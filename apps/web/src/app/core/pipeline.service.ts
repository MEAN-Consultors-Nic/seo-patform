import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Lead, LeadStage, PipelineStats } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class PipelineService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(stage?: LeadStage): Observable<Lead[]> {
    const qs = stage ? `?stage=${stage}` : '';
    return this.http.get<Lead[]>(`${this.base}/pipeline/leads${qs}`);
  }

  stats(): Observable<PipelineStats> {
    return this.http.get<PipelineStats>(`${this.base}/pipeline/stats`);
  }

  findOne(id: string): Observable<Lead> {
    return this.http.get<Lead>(`${this.base}/pipeline/leads/${id}`);
  }

  create(dto: Partial<Lead>): Observable<Lead> {
    return this.http.post<Lead>(`${this.base}/pipeline/leads`, dto);
  }

  update(id: string, dto: Partial<Lead>): Observable<Lead> {
    return this.http.patch<Lead>(`${this.base}/pipeline/leads/${id}`, dto);
  }

  changeStage(id: string, stage: LeadStage, closedReason?: string) {
    return this.http.post<Lead>(`${this.base}/pipeline/leads/${id}/stage`, {
      stage,
      closedReason,
    });
  }

  addActivity(id: string, kind: 'note' | 'email' | 'call', text: string) {
    return this.http.post<Lead>(
      `${this.base}/pipeline/leads/${id}/activity`,
      { kind, text },
    );
  }

  remove(id: string) {
    return this.http.delete<{ deleted: true }>(
      `${this.base}/pipeline/leads/${id}`,
    );
  }
}
