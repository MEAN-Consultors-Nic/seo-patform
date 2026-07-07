import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { User, UserRole } from '@seo/shared';
import { API_BASE_URL } from './api.config';

export interface CreateUserPayload {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  managerId?: string;
  active?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  managerId?: string;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list() {
    return this.http.get<User[]>(`${this.base}/users`);
  }

  assignable() {
    return this.http.get<User[]>(`${this.base}/users/assignable`);
  }

  create(payload: CreateUserPayload) {
    return this.http.post<User>(`${this.base}/users`, payload);
  }

  update(id: string, payload: UpdateUserPayload) {
    return this.http.patch<User>(`${this.base}/users/${id}`, payload);
  }

  resetPassword(id: string, password: string) {
    return this.http.post<{ ok: true }>(
      `${this.base}/users/${id}/reset-password`,
      { password },
    );
  }

  remove(id: string) {
    return this.http.delete<{ deleted: true }>(`${this.base}/users/${id}`);
  }
}
