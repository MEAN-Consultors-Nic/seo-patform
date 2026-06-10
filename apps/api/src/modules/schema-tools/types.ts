export interface CrawlPage {
  url: string;
  status: number;
  contentType?: string;
  schemas: SchemaItem[]; // JSON-LD + microdata, normalized to JSON-LD shape
  errors?: string[];
}

export interface SchemaItem {
  source: 'json-ld' | 'microdata';
  raw: unknown; // the original parsed JSON-LD object or normalized microdata
}

export interface SchemaNode {
  id: string; // either @id from the schema or a synthesized internal id
  types: string[]; // e.g. ["Organization", "LocalBusiness"]
  label: string; // friendly label (name / headline / @id tail)
  pages: string[]; // page URLs where this node was found
  properties: Record<string, unknown>; // flat (non-reference) properties
  schemaIdUrl?: string; // the actual @id URL if it was a full URL
}

export interface SchemaEdge {
  from: string;
  to: string;
  label: string; // property name (e.g. "publisher", "author", "isPartOf")
}

export interface SchemaGraph {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
}

export interface CrawlResult {
  domain: string;
  startUrl: string;
  pagesCrawled: number;
  pagesWithSchema: number;
  schemasFound: number;
  typeCounts: Array<{ type: string; count: number }>;
  pages: CrawlPage[];
  graph: SchemaGraph;
  errors: string[];
  durationMs: number;
  limit: number;
}
