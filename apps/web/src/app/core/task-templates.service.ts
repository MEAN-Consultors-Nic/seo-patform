import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TaskTemplate } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class TaskTemplatesService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(): Observable<TaskTemplate[]> {
    return this.http.get<TaskTemplate[]>(`${this.base}/task-templates`);
  }

  create(dto: Partial<TaskTemplate>): Observable<TaskTemplate> {
    return this.http.post<TaskTemplate>(`${this.base}/task-templates`, dto);
  }

  update(id: string, dto: Partial<TaskTemplate>): Observable<TaskTemplate> {
    return this.http.patch<TaskTemplate>(`${this.base}/task-templates/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/task-templates/${id}`);
  }

  applyRecurring(cycleId: string) {
    return this.http.post<{ created: number; skipped: number; clientsProcessed: number }>(
      `${this.base}/task-templates/apply-recurring`,
      { cycleId },
    );
  }
}
