import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { WorkingHoursConfig } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class WorkingHoursService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  me(): Observable<WorkingHoursConfig> {
    return this.http.get<WorkingHoursConfig>(`${this.base}/working-hours`);
  }

  update(dto: Partial<Omit<WorkingHoursConfig, '_id' | 'userId'>>): Observable<WorkingHoursConfig> {
    return this.http.put<WorkingHoursConfig>(`${this.base}/working-hours`, dto);
  }
}
