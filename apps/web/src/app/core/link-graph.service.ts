import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface LinkGraphNode {
  url: string;
  title?: string;
  statusCode?: number;
  depth: number;
  inboundCount: number;
  outboundCount: number;
  isOrphan: boolean;
  contentLength?: number;
  contentType?: string;
  errorMessage?: string;
}

export interface LinkGraphEdge {
  from: string;
  to: string;
  anchor?: string;
}

export interface LinkGraphSnapshotSummary {
  _id: string;
  clientId: string;
  seedUrl: string;
  status: 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  totalPages: number;
  totalEdges: number;
  maxDepth: number;
  orphansCount: number;
  pageCap: number;
  capHit: boolean;
  warnings: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LinkGraphSnapshotDetail extends LinkGraphSnapshotSummary {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
}

@Injectable({ providedIn: 'root' })
export class LinkGraphService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  listSnapshots(clientId: string): Observable<LinkGraphSnapshotSummary[]> {
    return this.http.get<LinkGraphSnapshotSummary[]>(
      `${this.base}/clients/${clientId}/link-graph/snapshots`,
    );
  }

  getSnapshot(
    clientId: string,
    snapshotId: string,
  ): Observable<LinkGraphSnapshotDetail> {
    return this.http.get<LinkGraphSnapshotDetail>(
      `${this.base}/clients/${clientId}/link-graph/snapshots/${snapshotId}`,
    );
  }

  crawl(
    clientId: string,
    pageCap?: number,
  ): Observable<LinkGraphSnapshotSummary> {
    return this.http.post<LinkGraphSnapshotSummary>(
      `${this.base}/clients/${clientId}/link-graph/crawl`,
      { pageCap },
    );
  }
}
