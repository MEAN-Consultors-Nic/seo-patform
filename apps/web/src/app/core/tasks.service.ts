import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Task, TaskAttachment } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(
    filters: {
      clientId?: string;
      cycleId?: string;
      status?: string;
      category?: string;
      completedFrom?: string;
      completedTo?: string;
    } = {},
  ): Observable<Task[]> {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    return this.http.get<Task[]>(`${this.base}/tasks?${qs.toString()}`);
  }

  create(dto: Partial<Task>): Observable<Task> {
    return this.http.post<Task>(`${this.base}/tasks`, dto);
  }

  update(id: string, dto: Partial<Task>): Observable<Task> {
    return this.http.patch<Task>(`${this.base}/tasks/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/tasks/${id}`);
  }

  summary(cycleId: string) {
    return this.http.get<Array<{ _id: string; total: number; completed: number; actualHours: number; estimatedHours: number }>>(
      `${this.base}/tasks/summary?cycleId=${cycleId}`,
    );
  }

  addAttachment(taskId: string, attachment: Partial<TaskAttachment>) {
    return this.http.post<Task>(`${this.base}/tasks/${taskId}/attachments`, attachment);
  }

  patchAttachment(taskId: string, publicId: string, patch: Partial<TaskAttachment>) {
    return this.http.patch<Task>(`${this.base}/tasks/${taskId}/attachments`, { publicId, ...patch });
  }

  removeAttachment(taskId: string, publicId: string) {
    return this.http.request<Task>('DELETE', `${this.base}/tasks/${taskId}/attachments`, {
      body: { publicId },
    });
  }

  sendToDoc(taskId: string, skipImages: boolean, docTabName?: string) {
    return this.http.post<{ ok: boolean; message?: string }>(
      `${this.base}/tasks/${taskId}/send-to-doc`,
      { skipImages, docTabName },
    );
  }

  listClientDocTabs(clientId: string) {
    return this.http.get<{
      docId?: string;
      tabs: Array<{ tabId: string; title: string }>;
      error?: string;
    }>(`${this.base}/tasks/client-doc-tabs/${clientId}`);
  }

  addSubtask(taskId: string, title: string, done = false) {
    return this.http.post<Task>(`${this.base}/tasks/${taskId}/subtasks`, {
      title,
      done,
    });
  }

  addComment(taskId: string, content: string) {
    return this.http.post<
      Array<{
        content: string;
        authorRole: 'supervisor' | 'team';
        authorName?: string;
        createdAt: string;
      }>
    >(`${this.base}/tasks/${taskId}/comments`, { content });
  }
}
