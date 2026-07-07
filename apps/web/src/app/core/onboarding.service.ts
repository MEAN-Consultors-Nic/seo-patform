import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { OnboardingItem, OnboardingSnapshot, OnboardingItemState } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  listItems(includeInactive = false): Observable<OnboardingItem[]> {
    const qs = includeInactive ? '?includeInactive=true' : '';
    return this.http.get<OnboardingItem[]>(`${this.base}/onboarding/items${qs}`);
  }

  createItem(dto: Partial<OnboardingItem>): Observable<OnboardingItem> {
    return this.http.post<OnboardingItem>(`${this.base}/onboarding/items`, dto);
  }

  updateItem(id: string, dto: Partial<OnboardingItem>): Observable<OnboardingItem> {
    return this.http.patch<OnboardingItem>(`${this.base}/onboarding/items/${id}`, dto);
  }

  removeItem(id: string): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(`${this.base}/onboarding/items/${id}`);
  }

  getWindowDays(): Observable<{ onboardingWindowDays: number }> {
    return this.http.get<{ onboardingWindowDays: number }>(
      `${this.base}/onboarding/window-days`,
    );
  }

  setWindowDays(days: number): Observable<{ onboardingWindowDays: number }> {
    return this.http.patch<{ onboardingWindowDays: number }>(
      `${this.base}/onboarding/window-days`,
      { days },
    );
  }

  snapshot(clientId: string): Observable<OnboardingSnapshot> {
    return this.http.get<OnboardingSnapshot>(
      `${this.base}/onboarding/client/${clientId}`,
    );
  }

  setState(
    clientId: string,
    key: string,
    state: OnboardingItemState,
    notes?: string,
  ): Observable<OnboardingSnapshot> {
    return this.http.patch<OnboardingSnapshot>(
      `${this.base}/onboarding/client/${clientId}/state`,
      { key, state, notes },
    );
  }
}
