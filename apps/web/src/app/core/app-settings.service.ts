import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ReportSectionConfig } from '@seo/shared';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  getReportLayout(): Observable<ReportSectionConfig[]> {
    return this.http.get<ReportSectionConfig[]>(
      `${this.base}/app-settings/report-layout`,
    );
  }

  setReportLayout(
    layout: ReportSectionConfig[],
  ): Observable<ReportSectionConfig[]> {
    return this.http.put<ReportSectionConfig[]>(
      `${this.base}/app-settings/report-layout`,
      { layout },
    );
  }
}
