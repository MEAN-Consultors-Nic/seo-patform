import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ContentAttachment, ContentPiece, ContentStatus } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class ContentService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(filters: { clientId?: string; status?: ContentStatus } = {}): Observable<ContentPiece[]> {
    const qs = new URLSearchParams();
    if (filters.clientId) qs.set('clientId', filters.clientId);
    if (filters.status) qs.set('status', filters.status);
    return this.http.get<ContentPiece[]>(`${this.base}/content?${qs.toString()}`);
  }

  create(dto: Partial<ContentPiece>): Observable<ContentPiece> {
    return this.http.post<ContentPiece>(`${this.base}/content`, dto);
  }

  update(id: string, dto: Partial<ContentPiece>): Observable<ContentPiece> {
    return this.http.patch<ContentPiece>(`${this.base}/content/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/content/${id}`);
  }

  addAttachment(id: string, attachment: Partial<ContentAttachment>): Observable<ContentPiece> {
    return this.http.post<ContentPiece>(
      `${this.base}/content/${id}/attachments`,
      attachment,
    );
  }

  removeAttachment(id: string, publicId: string): Observable<ContentPiece> {
    return this.http.request<ContentPiece>(
      'delete',
      `${this.base}/content/${id}/attachments`,
      { body: { publicId } },
    );
  }
}
