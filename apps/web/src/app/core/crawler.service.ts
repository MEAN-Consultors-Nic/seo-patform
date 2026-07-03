import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export type CrawlJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'interrupted'
  | 'failed';

export interface CrawlJob {
  _id: string;
  clientId: string;
  rootUrl: string;
  status: CrawlJobStatus;
  startedAt?: string;
  completedAt?: string;
  currentUrl?: string;
  settings: {
    maxDepth: number;
    maxPages: number;
    rateLimit: number;
    respectRobots: boolean;
    ignoreUtm: boolean;
    userAgent?: string;
  };
  stats: {
    pagesCrawled: number;
    pagesQueued: number;
    brokenLinks: number;
    redirects: number;
    orphans: number;
    dupTitles: number;
    dupMetas: number;
    missingH1: number;
  };
  errorMessage?: string;
}

export interface CrawlPage {
  _id: string;
  jobId: string;
  url: string;
  urlHash: string;
  statusCode?: number;
  title?: string;
  metaDescription?: string;
  h1s: string[];
  canonical?: string;
  robotsMeta?: string;
  contentType?: string;
  contentLength?: number;
  responseTimeMs?: number;
  depth: number;
  discoveredAt: string;
  incomingLinks: string[];
  outgoingLinks: string[];
  redirectChain: string[];
  fetchError?: string;
}

export interface StartCrawlDto {
  rootUrl: string;
  maxDepth?: number;
  maxPages?: number;
  rateLimit?: number;
  respectRobots?: boolean;
  ignoreUtm?: boolean;
  userAgent?: string;
}

export interface CrawlAnalysis {
  duplicateTitles: Array<{ title: string; count: number; urls: string[] }>;
  duplicateMetaDescriptions: Array<{
    metaDescription: string;
    count: number;
    urls: string[];
  }>;
  missingTitles: Array<{ url: string; statusCode?: number }>;
  missingMetaDescriptions: Array<{ url: string; statusCode?: number }>;
  missingH1: Array<{ url: string; statusCode?: number }>;
  multipleH1: Array<{ url: string; count: number }>;
  brokenLinks: Array<{
    url: string;
    statusCode?: number;
    fetchError?: string;
    incomingLinks: number;
  }>;
  redirects: Array<{
    url: string;
    finalUrl: string;
    redirectChain: string[];
  }>;
  orphans: Array<{ url: string; depth: number }>;
  canonicalMismatches: Array<{ url: string; canonical: string }>;
  noindex: Array<{ url: string; robotsMeta: string }>;
}

@Injectable({ providedIn: 'root' })
export class CrawlerService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  start(clientId: string, dto: StartCrawlDto): Observable<CrawlJob> {
    return this.http.post<CrawlJob>(
      `${this.base}/clients/${clientId}/crawl/start`,
      dto,
    );
  }

  list(clientId: string): Observable<CrawlJob[]> {
    return this.http.get<CrawlJob[]>(
      `${this.base}/clients/${clientId}/crawl`,
    );
  }

  status(clientId: string, jobId: string): Observable<CrawlJob> {
    return this.http.get<CrawlJob>(
      `${this.base}/clients/${clientId}/crawl/${jobId}/status`,
    );
  }

  pages(clientId: string, jobId: string): Observable<CrawlPage[]> {
    return this.http.get<CrawlPage[]>(
      `${this.base}/clients/${clientId}/crawl/${jobId}/pages`,
    );
  }

  analysis(clientId: string, jobId: string): Observable<CrawlAnalysis> {
    return this.http.get<CrawlAnalysis>(
      `${this.base}/clients/${clientId}/crawl/${jobId}/analysis`,
    );
  }

  csvUrl(clientId: string, jobId: string): string {
    return `${this.base}/clients/${clientId}/crawl/${jobId}/csv`;
  }

  csvBlob(clientId: string, jobId: string) {
    return this.http.get(
      `${this.base}/clients/${clientId}/crawl/${jobId}/csv`,
      { responseType: 'blob' },
    );
  }

  cancel(clientId: string, jobId: string) {
    return this.http.post<{ cancelled: boolean }>(
      `${this.base}/clients/${clientId}/crawl/${jobId}/cancel`,
      {},
    );
  }
}
