import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface SchemaNode {
  id: string;
  types: string[];
  label: string;
  pages: string[];
  properties: Record<string, unknown>;
  schemaIdUrl?: string;
}

export interface SchemaEdge {
  from: string;
  to: string;
  label: string;
}

export interface SchemaGraph {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
}

export interface SchemaCrawlPage {
  url: string;
  status: number;
  contentType?: string;
  schemas: Array<{ source: 'json-ld' | 'microdata'; raw: unknown }>;
  errors?: string[];
}

export interface SchemaCrawlResult {
  domain: string;
  startUrl: string;
  pagesCrawled: number;
  pagesWithSchema: number;
  schemasFound: number;
  typeCounts: Array<{ type: string; count: number }>;
  pages: SchemaCrawlPage[];
  graph: SchemaGraph;
  errors: string[];
  durationMs: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class SchemaToolsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  crawl(url: string, maxPages?: number): Observable<SchemaCrawlResult> {
    return this.http.post<SchemaCrawlResult>(`${this.base}/schema-tools/crawl`, {
      url,
      maxPages,
    });
  }
}
