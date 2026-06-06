import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Cycle } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class CyclesService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(): Observable<Cycle[]> {
    return this.http.get<Cycle[]>(`${this.base}/cycles`);
  }

  current(): Observable<Cycle> {
    return this.http.get<Cycle>(`${this.base}/cycles/current`);
  }

  next(): Observable<Cycle | null> {
    return this.http.get<Cycle | null>(`${this.base}/cycles/next`);
  }

  get(id: string): Observable<Cycle> {
    return this.http.get<Cycle>(`${this.base}/cycles/${id}`);
  }
}
