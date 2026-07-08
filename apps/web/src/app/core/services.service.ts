import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Service } from '@seo/shared';
import { API_BASE_URL } from './api.config';

export interface CreateServicePayload {
  name: string;
  slug: string;
  description?: string;
  color?: Service['color'];
  icon?: string;
  order?: number;
  active?: boolean;
}

export type UpdateServicePayload = Partial<CreateServicePayload>;

@Injectable({ providedIn: 'root' })
export class ServicesCatalogService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.base}/services`);
  }

  create(payload: CreateServicePayload): Observable<Service> {
    return this.http.post<Service>(`${this.base}/services`, payload);
  }

  update(id: string, payload: UpdateServicePayload): Observable<Service> {
    return this.http.patch<Service>(`${this.base}/services/${id}`, payload);
  }

  remove(id: string) {
    return this.http.delete<{ deleted: true }>(`${this.base}/services/${id}`);
  }
}
