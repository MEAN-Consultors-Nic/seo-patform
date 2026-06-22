import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from './api.config';

const TOKEN_KEY = 'supervisor-token';
const TOKEN_EXPIRY_KEY = 'supervisor-token-expires-at';

export interface SupervisorClient {
  _id: string;
  name: string;
  tier: 'A' | 'B' | 'C';
  url: string;
  logoUrl?: string;
  industry?: string;
  hoursPerCycle: number;
  endingDate?: string;
}

export interface SupervisorCycle {
  _id: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface SupervisorComment {
  content: string;
  authorRole: 'supervisor' | 'team';
  authorName?: string;
  createdAt: string;
}

export interface SupervisorTask {
  _id: string;
  title: string;
  description?: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  estimatedHours: number;
  actualHours: number;
  notes?: string;
  comments: SupervisorComment[];
  subtasks?: Array<{ title: string; done: boolean }>;
  completedAt?: string;
}

export interface SupervisorDashboard {
  client: SupervisorClient;
  cycle: SupervisorCycle;
  report: {
    kpis?: Record<string, number | null | undefined>;
    kpisPrevious?: Record<string, number | null | undefined>;
    executiveSummary?: string;
    findings?: string;
    nextPeriodPlan?: string;
    clientBlockers?: string;
    finalConsiderations?: string;
    shareToken?: string;
  } | null;
  tasks: SupervisorTask[];
}

/**
 * Talks to the /supervisor backend on behalf of the PIN-authenticated
 * supervisor. The token lives in localStorage with a parallel expiry
 * key so we can show a clean "session expired" state instead of waiting
 * for a 401 round-trip. None of these requests go through the regular
 * authInterceptor — the user JWT is irrelevant here and the supervisor
 * token is attached per-request via the headers param.
 */
@Injectable({ providedIn: 'root' })
export class SupervisorService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  private tokenSig = signal<string | null>(this.readToken());
  private expirySig = signal<number | null>(this.readExpiry());

  /** True when a non-expired supervisor token is in storage. */
  isAuthenticated = computed(() => {
    const t = this.tokenSig();
    const e = this.expirySig();
    if (!t || !e) return false;
    return Date.now() < e;
  });

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private readExpiry(): number | null {
    try {
      const raw = localStorage.getItem(TOKEN_EXPIRY_KEY);
      return raw ? parseInt(raw, 10) : null;
    } catch {
      return null;
    }
  }

  private writeToken(token: string, expiresAt: string | Date | number | null) {
    const ts =
      typeof expiresAt === 'number'
        ? expiresAt
        : new Date(expiresAt ?? Date.now() + 12 * 3600 * 1000).getTime();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(ts));
    this.tokenSig.set(token);
    this.expirySig.set(ts);
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    this.tokenSig.set(null);
    this.expirySig.set(null);
  }

  private get headers() {
    const token = this.tokenSig();
    return token
      ? { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
      : {};
  }

  authenticate(pin: string): Observable<{ token: string; expiresAt: string }> {
    return this.http
      .post<{ token: string; expiresAt: string }>(
        `${this.base}/supervisor/auth`,
        { pin },
      )
      .pipe(tap((res) => this.writeToken(res.token, res.expiresAt)));
  }

  listClients(): Observable<SupervisorClient[]> {
    return this.http.get<SupervisorClient[]>(
      `${this.base}/supervisor/clients`,
      this.headers,
    );
  }

  listCycles(clientId: string): Observable<SupervisorCycle[]> {
    return this.http.get<SupervisorCycle[]>(
      `${this.base}/supervisor/clients/${clientId}/cycles`,
      this.headers,
    );
  }

  getDashboard(
    clientId: string,
    cycleId: string,
  ): Observable<SupervisorDashboard> {
    return this.http.get<SupervisorDashboard>(
      `${this.base}/supervisor/clients/${clientId}/cycles/${cycleId}`,
      this.headers,
    );
  }

  addComment(
    taskId: string,
    content: string,
    authorName?: string,
  ): Observable<SupervisorComment[]> {
    return this.http.post<SupervisorComment[]>(
      `${this.base}/supervisor/tasks/${taskId}/comments`,
      { content, authorName },
      this.headers,
    );
  }
}
