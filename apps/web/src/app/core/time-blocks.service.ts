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

  weeklyPlan(weekStart: string): Observable<WeeklyPlan> {
    return this.http.get<WeeklyPlan>(
      `${this.base}/time-blocks/weekly-plan?weekStart=${weekStart}`,
    );
  }

  commitWeeklyPlan(weekStart: string, plan: WeeklyPlan) {
    return this.http.post<{ created: number; skipped: number }>(
      `${this.base}/time-blocks/weekly-plan/commit`,
      { weekStart, plan },
    );
  }

  pushWeeklyPlanToCalendar(plan: WeeklyPlan) {
    return this.http.post<{
      pushed: number;
      skipped: number;
      conflicts: number;
    }>(`${this.base}/time-blocks/weekly-plan/push-to-calendar`, { plan });
  }
}

export interface WeeklyPlanSlot {
  clientId: string;
  clientName: string;
  tier: string;
  date: string;
  startTime: string;
  endTime: string;
  source: 'calendar' | 'generated';
  googleEventId?: string;
  googleEventLink?: string;
  conflict?: { existingTitle: string; existingRange: string };
}

export interface WeeklyPlan {
  weeks: Array<{ start: string; end: string; slots: WeeklyPlanSlot[] }>;
  unassigned: number;
}
