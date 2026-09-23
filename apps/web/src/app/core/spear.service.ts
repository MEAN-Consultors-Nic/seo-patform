import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export type SpearVerdict =
  | 'reachable'
  | 'waf_challenge'
  | 'auth_rejected'
  | 'server_error'
  | 'unreachable'
  | 'not_configured';

export interface SpearConnectionResult {
  ok: boolean;
  verdict: SpearVerdict;
  endpoint: string;
  httpStatus: number | null;
  contentType: string | null;
  latencyMs: number;
  message: string;
  detail?: string;
  sample?: Record<string, unknown>;
  checkedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SpearService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  /**
   * Runs the probe on the API host, not in the browser — Spear sends no
   * CORS headers, so the browser could not call it directly even if we
   * wanted to, and the key must never reach the front end.
   */
  testConnection(probe: 'catalog' | 'describe' = 'catalog'): Observable<SpearConnectionResult> {
    return this.http.get<SpearConnectionResult>(
      `${this.base}/spear/test-connection?probe=${probe}`,
    );
  }
}
