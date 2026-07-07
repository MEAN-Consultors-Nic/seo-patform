import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { AuthResponse, User, UserRole } from '@seo/shared';
import { API_BASE_URL } from './api.config';

const TOKEN_KEY = 'seo_token';
const USER_KEY = 'seo_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);
  private router = inject(Router);

  private _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private _user = signal<User | null>(this.readUser());

  token = this._token.asReadonly();
  user = this._user.asReadonly();
  role = computed<UserRole | null>(() => this._user()?.role ?? null);
  isLoggedIn = computed(() => !!this._token());

  // Role-check helpers mirror the backend hierarchy:
  //   root > owner > admin > manager > strategist > client
  isRoot = computed(() => this.role() === 'root');
  isOwner = computed(() => {
    const r = this.role();
    return r === 'root' || r === 'owner';
  });
  isAdmin = computed(() => {
    const r = this.role();
    return r === 'root' || r === 'owner' || r === 'admin';
  });
  /** Legacy alias. Prefer isManagerOrAbove going forward. */
  isManager = computed(() => this.isManagerOrAbove());
  isManagerOrAbove = computed(() => {
    const r = this.role();
    return r === 'root' || r === 'owner' || r === 'admin' || r === 'manager';
  });
  canViewFinancials = computed(() => this.isOwner());
  canAdministerPlatform = computed(() => this.isAdmin());
  canManageTeam = computed(() => this.isManagerOrAbove());

  hasRole(...roles: UserRole[]): boolean {
    const r = this.role();
    return r ? roles.includes(r) : false;
  }

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.base}/auth/login`, { email, password }).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.accessToken);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        this._token.set(res.accessToken);
        this._user.set(res.user);
      }),
      catchError((err) => throwError(() => err)),
    );
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  fetchMe() {
    return this.http.get<User>(`${this.base}/auth/me`).pipe(
      tap((u) => {
        this._user.set(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      }),
    );
  }

  private readUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
