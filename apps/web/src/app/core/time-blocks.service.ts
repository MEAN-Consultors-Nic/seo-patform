import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TimeBlock, TimeBlockStatus } from '@seo/shared';

export interface PullFromCalendarSummary {
  created: number;
  removed: number;
  skippedKept: number;
  unmatched: Array<{ title: string; startsAt: string }>;
  totalEvents: number;
}
import { API_BASE_URL } from './api.config';

export interface TimeBlockCreateDto {
  cycleId: string;
  date: string;
  startTime: string;
  endTime: string;
  clientId: string;
  taskId?: string;
  notes?: string;
}

export interface TimeBlockUpdateDto {
  date?: string;
  startTime?: string;
  endTime?: string;
  clientId?: string;
  taskId?: string | null;
  status?: TimeBlockStatus;
  notes?: string;
  actualMinutes?: number;
}

@Injectable({ providedIn: 'root' })
export class TimeBlocksService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(filters: { cycleId?: string; date?: string; from?: string; to?: string } = {}): Observable<TimeBlock[]> {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    return this.http.get<TimeBlock[]>(`${this.base}/time-blocks?${qs.toString()}`);
  }

  create(dto: TimeBlockCreateDto): Observable<TimeBlock> {
    return this.http.post<TimeBlock>(`${this.base}/time-blocks`, dto);
  }

  update(id: string, dto: TimeBlockUpdateDto): Observable<TimeBlock> {
    return this.http.patch<TimeBlock>(`${this.base}/time-blocks/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete(`${this.base}/time-blocks/${id}`);
  }

  start(id: string): Observable<TimeBlock> {
    return this.http.post<TimeBlock>(`${this.base}/time-blocks/${id}/start`, {});
  }

  complete(id: string, actualMinutes?: number): Observable<TimeBlock> {
    return this.http.post<TimeBlock>(`${this.base}/time-blocks/${id}/complete`, { actualMinutes });
  }

  skip(id: string): Observable<TimeBlock> {
    return this.http.post<TimeBlock>(`${this.base}/time-blocks/${id}/skip`, {});
  }

  pullFromCalendar(cycleId: string): Observable<PullFromCalendarSummary> {
    return this.http.post<PullFromCalendarSummary>(
      `${this.base}/time-blocks/pull-from-calendar`,
      { cycleId },
    );
  }
}
