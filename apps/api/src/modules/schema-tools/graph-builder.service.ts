import { Injectable } from '@nestjs/common';
import { CrawlPage, SchemaEdge, SchemaGraph, SchemaNode } from './types';

@Injectable()
export class GraphBuilderService {
  /**
   * Walk every schema item from every page and produce a graph:
   *  - Each unique @id (or synthesized id) becomes a node
   *  - When a property references another node (by @id or inline object),
   *    we create an edge labeled with the property name
   *  - Nested inline objects become their own nodes
   *  - Nodes that appear on multiple pages list all those page URLs
   */
  build(pages: CrawlPage[]): SchemaGraph {
    const nodes = new Map<string, SchemaNode>();
    const edges: SchemaEdge[] = [];
    const edgeKeys = new Set<string>();

    let synthCounter = 0;
    const synth = (typeHint?: string) => `_:n${++synthCounter}${typeHint ? `_${typeHint}` : ''}`;

    const addEdge = (from: string, to: string, label: string) => {
      const key = `${from}|${label}|${to}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({ from, to, label });
    };

    const upsertNode = (
      obj: Record<string, unknown>,
      pageUrl: string,
      preferredId?: string,
    ): string => {
      const types = this.coerceTypes(obj['@type']);
      const id =
        preferredId ||
        (typeof obj['@id'] === 'string' ? (obj['@id'] as string) : undefined) ||
        synth(types[0]);

      let node = nodes.get(id);
      if (!node) {
        node = {
          id,
          types,
          label: '',
          pages: [],
          properties: {},
          schemaIdUrl:
            typeof obj['@id'] === 'string' && /^https?:\/\//i.test(obj['@id'] as string)
              ? (obj['@id'] as string)
              : undefined,
        };
        nodes.set(id, node);
      } else {
        for (const t of types) {
          if (!node.types.includes(t)) node.types.push(t);
        }
      }
      if (!node.pages.includes(pageUrl)) node.pages.push(pageUrl);

      for (const [key, value] of Object.entries(obj)) {
        if (key === '@context' || key === '@type' || key === '@id') continue;
        this.handleProperty(node!, key, value, pageUrl, addEdge, upsertNode);
      }

      // Derive a friendly label
      node.label = this.deriveLabel(node);
      return id;
    };

    for (const page of pages) {
      for (const item of page.schemas) {
        const raw = item.raw;
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          upsertNode(raw as Record<string, unknown>, page.url);
        } else if (Array.isArray(raw)) {
          for (const child of raw) {
            if (child && typeof child === 'object') {
              upsertNode(child as Record<string, unknown>, page.url);
            }
          }
        }
      }
    }

    return { nodes: [...nodes.values()], edges };
  }

  private handleProperty(
    parent: SchemaNode,
    key: string,
    value: unknown,
    pageUrl: string,
    addEdge: (from: string, to: string, label: string) => void,
    upsertNode: (obj: Record<string, unknown>, pageUrl: string, preferredId?: string) => string,
  ) {
    if (value == null) return;

    if (Array.isArray(value)) {
      for (const v of value) {
        this.handleProperty(parent, key, v, pageUrl, addEdge, upsertNode);
      }
      return;
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      // A reference-only object: { "@id": "..." } with nothing else of interest
      const onlyRef =
        typeof obj['@id'] === 'string' &&
        Object.keys(obj).every((k) => k === '@id' || k === '@type');
      if (onlyRef) {
        addEdge(parent.id, obj['@id'] as string, key);
        return;
      }
      // Inline nested object — lift as a node and connect.
      const childId = upsertNode(obj, pageUrl);
      addEdge(parent.id, childId, key);
      return;
    }

    if (typeof value === 'string') {
      // Some sites express references as bare URL strings (esp. sameAs).
      // For "sameAs" / "url" / "image", keep them as flat properties for display.
      const flatKeys = new Set([
        'sameAs',
        'url',
        'image',
        'logo',
        'telephone',
        'email',
        'address',
        'description',
        'name',
        'headline',
        'inLanguage',
      ]);
      if (!flatKeys.has(key)) {
        // Heuristic: looks like an @id reference (full URL on this domain)
        // — but to keep things simple in the MVP, treat all strings as flat.
      }
      this.appendFlat(parent, key, value);
      return;
    }

    this.appendFlat(parent, key, value);
  }

  private appendFlat(node: SchemaNode, key: string, value: unknown) {
    const existing = node.properties[key];
    if (existing === undefined) {
      node.properties[key] = value;
    } else if (Array.isArray(existing)) {
      if (!existing.includes(value as never)) existing.push(value);
    } else if (existing !== value) {
      node.properties[key] = [existing, value];
    }
  }

  private coerceTypes(t: unknown): string[] {
    if (typeof t === 'string') return [t.replace(/^https?:\/\/schema\.org\//, '')];
    if (Array.isArray(t)) {
      return t
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.replace(/^https?:\/\/schema\.org\//, ''));
    }
    return ['Thing'];
  }

  private deriveLabel(node: SchemaNode): string {
    const props = node.properties;
    const candidates = [
      props['name'],
      props['headline'],
      props['title'],
      props['legalName'],
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 80);
    }
    if (node.schemaIdUrl) {
      try {
        const u = new URL(node.schemaIdUrl);
        const last = u.hash || u.pathname.split('/').filter(Boolean).pop();
        if (last) return last;
      } catch {
        // ignore
      }
    }
    return node.types[0] || 'Node';
  }
}
