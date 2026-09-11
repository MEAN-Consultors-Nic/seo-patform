import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Keyword, KeywordIntent, KeywordListWithStats } from '@seo/shared';
import { API_BASE_URL } from './api.config';

/** One row as the paste parser understood it, before it's committed. */
export interface ParsedKeywordRow {
  text: string;
  volume?: number;
  difficulty?: number;
  cpc?: number;
  intent?: KeywordIntent;
  parentTopic?: string;
  targetUrl?: string;
  notes?: string;
}

export interface ParseResult {
  rows: ParsedKeywordRow[];
  warnings: string[];
}

export interface BulkImportResult {
  created: number;
  updated: number;
  skipped: number;
  rows: number;
  warnings: string[];
}

@Injectable({ providedIn: 'root' })
export class KeywordListsService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  byClient(clientId: string): Observable<KeywordListWithStats[]> {
    return this.http.get<KeywordListWithStats[]>(
      `${this.base}/keyword-lists?clientId=${clientId}`,
    );
  }

  create(dto: {
    clientId: string;
    name: string;
    description?: string;
  }): Observable<KeywordListWithStats> {
    return this.http.post<KeywordListWithStats>(
      `${this.base}/keyword-lists`,
      dto,
    );
  }

  update(
    id: string,
    dto: { name?: string; description?: string },
  ): Observable<KeywordListWithStats> {
    return this.http.patch<KeywordListWithStats>(
      `${this.base}/keyword-lists/${id}`,
      dto,
    );
  }

  remove(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/keyword-lists/${id}`,
    );
  }

  keywords(id: string): Observable<Keyword[]> {
    return this.http.get<Keyword[]>(
      `${this.base}/keyword-lists/${id}/keywords`,
    );
  }

  /** Dry run — shows what the paste box understood before writing. */
  parse(text: string): Observable<ParseResult> {
    return this.http.post<ParseResult>(`${this.base}/keyword-lists/parse`, {
      text,
    });
  }

  import(
    id: string,
    rows: ParsedKeywordRow[],
    opts: { tracked?: boolean; overwrite?: boolean } = {},
  ): Observable<BulkImportResult> {
    return this.http.post<BulkImportResult>(
      `${this.base}/keyword-lists/${id}/import`,
      { rows, ...opts },
    );
  }

  addExisting(id: string, keywordIds: string[]): Observable<{ added: number }> {
    return this.http.post<{ added: number }>(
      `${this.base}/keyword-lists/${id}/keywords`,
      { keywordIds },
    );
  }

  removeKeyword(id: string, keywordId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/keyword-lists/${id}/keywords/${keywordId}`,
    );
  }
}
