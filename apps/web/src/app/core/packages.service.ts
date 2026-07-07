import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Package } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class PackagesService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  list(): Observable<Package[]> {
    return this.http.get<Package[]>(`${this.base}/packages`);
  }

  findOne(id: string): Observable<Package> {
    return this.http.get<Package>(`${this.base}/packages/${id}`);
  }

  create(dto: Partial<Package>): Observable<Package> {
    return this.http.post<Package>(`${this.base}/packages`, dto);
  }

  update(id: string, dto: Partial<Package>): Observable<Package> {
    return this.http.patch<Package>(`${this.base}/packages/${id}`, dto);
  }

  remove(id: string) {
    return this.http.delete<{ deleted: true }>(`${this.base}/packages/${id}`);
  }
}
