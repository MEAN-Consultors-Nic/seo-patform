import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface DomainLookupResult {
  domain: string;
  ip?: string;
  ips?: string[];
  reverseDns?: string;
  hosting?: {
    asn?: string;
    org?: string;
    holder?: string;
    country?: string;
  };
  nameServers?: string[];
  dnsHostHint?: string;
  mxRecords?: Array<{ exchange: string; priority: number }>;
  emailHostHint?: string;
  registrar?: {
    name?: string;
    url?: string;
    ianaId?: string;
  };
  registeredAt?: string;
  expiresAt?: string;
  updatedAt?: string;
  errors?: string[];
}

@Injectable({ providedIn: 'root' })
export class DomainToolsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  lookup(domain: string): Observable<DomainLookupResult> {
    const params = new HttpParams().set('domain', domain);
    return this.http.get<DomainLookupResult>(`${this.base}/domain-tools/lookup`, { params });
  }
}
