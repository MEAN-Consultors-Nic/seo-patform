import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface PriorityQueueReason {
  tag: string;
  detail: string;
  points: number;
}

export interface PriorityQueueItem {
  clientId: string;
  name: string;
  tier: string;
  logoUrl?: string;
  score: number;
  signals: {
    cycleUrgency: number;
    momentum: number;
    pendingWork: number;
  };
  reasons: PriorityQueueReason[];
  momentumStale: boolean;
}

export interface PriorityQueueResponse {
  generatedAt: string;
  items: PriorityQueueItem[];
  hasStaleMomentum: boolean;
}

@Injectable({ providedIn: 'root' })
export class PriorityQueueService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  get(): Observable<PriorityQueueResponse> {
    return this.http.get<PriorityQueueResponse>(`${this.base}/priority-queue`);
  }
}
