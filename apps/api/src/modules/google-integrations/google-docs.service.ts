import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from './google-oauth.service';

/**
 * Mirrors task completions into a client's Google Doc.
 *
 * The doc is organized as one tab per calendar MONTH (e.g. "March 2026").
 * Google Docs API exposes tab CONTENT for reads + writes (via tabId on
 * each request) but does NOT support creating tabs programmatically —
 * verified empirically with a 'createDocumentTab Unknown name' error,
 * and confirmed in the Docs API v1 reference where the Request union
 * has no tab-creation variant. So the integration assumes the user
 * pre-creates a tab for each new month they want sync'd to (the
 * existing template doc already has this convention). When a task
 * completes for a month whose tab doesn't exist yet, we surface a
 * clear "create the 'June 2026' tab and retry" message instead of
 * silently failing.
 */
@Injectable()
export class GoogleDocsService {
  private readonly logger = new Logger(GoogleDocsService.name);

  constructor(private readonly oauth: GoogleOAuthService) {}

  /**
   * Builds a "March 2026" style label from the given date in the
   * server's local timezone. The label is the source of truth for
   * tab matching, so any change to this format would orphan existing
   * tabs.
   */
  static monthLabel(d: Date): string {
    return d.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  /**
   * Returns the tabId for the existing monthly tab matching `date`.
   * Throws a clear message if the tab doesn't exist — Docs API
   * doesn't support creating tabs, so the user has to add the month's
   * tab to the doc manually before the next sync.
   */
  async findMonthlyTab(
    userId: string,
    documentId: string,
    date: Date,
  ): Promise<string> {
    const label = GoogleDocsService.monthLabel(date);
    let docsAny;
    try {
      const auth = await this.oauth.getAuthorizedClient(userId);
      const docs = google.docs({ version: 'v1', auth });
      // tabs are exposed via documents.get(includeTabsContent: true) but
      // not yet typed in googleapis@173 — cast through unknown.
      docsAny = docs as unknown as {
        documents: {
          get: (params: {
            documentId: string;
            includeTabsContent?: boolean;
          }) => Promise<{
            data: {
              tabs?: Array<{
                tabProperties?: { tabId?: string; title?: string };
                documentTab?: {
                  body?: { content?: Array<{ endIndex?: number }> };
                };
                childTabs?: Array<{
                  tabProperties?: { tabId?: string; title?: string };
                }>;
              }>;
            };
          }>;
          batchUpdate: (params: {
            documentId: string;
            requestBody: { requests: unknown[] };
          }) => Promise<unknown>;
        };
      };
    } catch (err) {
      const upstream = (err as Error).message || 'unknown error';
      throw new Error(
        `Google OAuth not available: ${upstream}. Disconnect Google in Settings → Integrations and reconnect — the new "documents" scope needs to be granted.`,
      );
    }

    let tabs: Array<{
      tabProperties?: { tabId?: string; title?: string };
      childTabs?: Array<{ tabProperties?: { tabId?: string; title?: string } }>;
    }>;
    try {
      const doc = await docsAny.documents.get({
        documentId,
        includeTabsContent: false,
      });
      tabs = doc.data.tabs ?? [];
    } catch (err) {
      const e = err as {
        code?: number;
        message?: string;
        response?: { data?: { error?: { message?: string } } };
      };
      const upstream =
        e.response?.data?.error?.message || e.message || 'unknown error';
      this.logger.warn(
        `documents.get failed for doc=${documentId}: ${upstream}`,
      );
      throw new Error(
        e.code === 403 || /permission|scope|insufficient/i.test(upstream)
          ? `Google rejected the doc read: ${upstream}. The connected Google account needs Editor access to this doc, and you may need to disconnect + reconnect Google so the "documents" scope is granted.`
          : `Google Docs error: ${upstream}`,
      );
    }

    // Tabs can be nested (a tab with child tabs) — flatten so we find
    // the right one whether the user organized by month at the root or
    // grouped them under a parent like "2026".
    const flat: Array<{ tabId?: string; title?: string }> = [];
    const walk = (
      t: { tabProperties?: { tabId?: string; title?: string }; childTabs?: unknown[] },
    ) => {
      if (t.tabProperties) flat.push(t.tabProperties);
      for (const c of (t.childTabs ?? []) as Array<{
        tabProperties?: { tabId?: string; title?: string };
        childTabs?: unknown[];
      }>) {
        walk(c);
      }
    };
    for (const t of tabs) walk(t);

    const match = flat.find((p) => p.title === label);
    if (match?.tabId) return match.tabId;

    const have = flat
      .map((p) => p.title)
      .filter((s): s is string => !!s)
      .slice(0, 5)
      .join(', ');
    throw new Error(
      `The doc has no tab named "${label}". Google Docs API does not support creating tabs — add a tab called "${label}" to the doc manually and re-trigger the sync. (Existing tabs: ${have || 'none'})`,
    );
  }

  /**
   * Appends a completed-task entry at the end of the given tab. The
   * entry layout (heading line + description + image grid) is
   * intentionally simple — the user can reformat by hand if needed
   * and our writes never blow away their edits because we always
   * insert at the end.
   */
  async appendTaskToTab(
    userId: string,
    documentId: string,
    tabId: string,
    task: {
      title: string;
      description?: string;
      category?: string;
      completedAt?: Date;
      imageAttachments?: string[];
    },
  ): Promise<void> {
    try {
      const auth = await this.oauth.getAuthorizedClient(userId);
      const docs = google.docs({ version: 'v1', auth });
      const docsAny = docs as unknown as {
        documents: {
          get: (params: {
            documentId: string;
            includeTabsContent?: boolean;
          }) => Promise<{
            data: {
              tabs?: Array<{
                tabProperties?: { tabId?: string; title?: string };
                documentTab?: {
                  body?: { content?: Array<{ endIndex?: number }> };
                };
              }>;
            };
          }>;
          batchUpdate: (params: {
            documentId: string;
            requestBody: { requests: unknown[] };
          }) => Promise<unknown>;
        };
      };

      // Build the visible header line.
      const dateStr = (task.completedAt ?? new Date()).toLocaleDateString(
        'en-US',
        { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
      );
      const heading = `${dateStr} · ${task.category?.toUpperCase() ?? 'TASK'} — ${task.title}`;
      const description = this.stripHtml(task.description || '').trim();

      // We need to know the current end-of-body index for the tab so
      // every insertion lands at the tail. documents.get with
      // includeTabsContent gives us each tab's body.content array;
      // the last element's endIndex is the tab's end-of-body cursor.
      const doc = await docsAny.documents.get({
        documentId,
        includeTabsContent: true,
      });
      const tab = (doc.data.tabs ?? []).find(
        (t) => t.tabProperties?.tabId === tabId,
      );
      const content = tab?.documentTab?.body?.content ?? [];
      const lastBlock = content[content.length - 1];
      // endIndex is exclusive; subtract one so we insert BEFORE the
      // implicit trailing newline at the very end of the body.
      let cursor = (lastBlock?.endIndex ?? 1) - 1;

      // Compose the body text first (heading + description + spacer).
      const bodyText =
        `\n${heading}\n` +
        (description ? `${description}\n` : '') +
        '\n';
      const headingStart = cursor + 1; // skip the leading \n we just added
      const headingEnd = headingStart + heading.length;

      const requests: unknown[] = [
        {
          insertText: {
            location: { index: cursor, tabId },
            text: bodyText,
          },
        },
        {
          updateParagraphStyle: {
            range: {
              startIndex: headingStart,
              endIndex: headingEnd,
              tabId,
            },
            paragraphStyle: { namedStyleType: 'HEADING_3' },
            fields: 'namedStyleType',
          },
        },
      ];
      cursor += bodyText.length;

      // Inline images — each pushed as its own insertInlineImage at
      // the current cursor + a newline separator.
      for (const url of task.imageAttachments ?? []) {
        if (!url || !this.isLikelyImage(url)) continue;
        requests.push({
          insertInlineImage: {
            location: { index: cursor, tabId },
            uri: url,
            objectSize: {
              width: { magnitude: 360, unit: 'PT' },
              height: { magnitude: 240, unit: 'PT' },
            },
          },
        });
        cursor += 1; // image consumes 1 index slot
        requests.push({
          insertText: {
            location: { index: cursor, tabId },
            text: '\n',
          },
        });
        cursor += 1;
      }

      await docsAny.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
    } catch (err) {
      const e = err as {
        code?: number;
        message?: string;
        response?: { data?: { error?: { message?: string } } };
      };
      const upstream =
        e.response?.data?.error?.message || e.message || 'unknown error';
      this.logger.warn(
        `appendTaskToTab failed for doc=${documentId} tab=${tabId}: ${upstream}`,
      );
      throw new Error(`Google Docs append failed: ${upstream}`);
    }
  }

  /**
   * Cheap mime guess from the URL extension. Cloudinary URLs preserve
   * the extension, so this is good enough to filter out PDFs / docs /
   * video before the Docs API rejects them as non-image inputs.
   */
  private isLikelyImage(url: string): boolean {
    const lower = url.toLowerCase().split('?')[0];
    return (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.webp')
    );
  }

  /**
   * Description in tasks is rich HTML coming out of Quill. The Docs
   * API only accepts plain-text via insertText, so we flatten to a
   * single paragraph and rely on sanitizeText elsewhere to have
   * cleaned out invisibles.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
