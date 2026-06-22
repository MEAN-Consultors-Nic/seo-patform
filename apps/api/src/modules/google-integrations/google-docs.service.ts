import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOAuthService } from './google-oauth.service';

/**
 * Mirrors task completions and cycle starts into a client's Google Doc.
 *
 * The doc is organized as one tab per calendar MONTH (e.g. "March 2026")
 * — tabs are a 2024 Docs feature exposed via documents.batchUpdate's
 * createDocumentTab request. We never create a tab per cycle because
 * the user runs two bi-weekly cycles in the same month and wants them
 * to share a single tab.
 *
 * Both the public methods are idempotent:
 *   - getOrCreateMonthlyTab returns the existing tabId if a tab with
 *     that month label already exists.
 *   - appendTaskToTab is best-effort and logged on failure so the
 *     calling task / cycle flow is never blocked by a doc problem
 *     (missing scope, doc moved, user lost edit access, etc.).
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
   * Returns the tabId for the monthly tab matching `date`. Lists the
   * doc's existing tabs first; only creates a new one if there isn't
   * a match. Returns null if the call fails — callers should treat
   * null as "best-effort failed, log and move on" rather than fatal.
   */
  async getOrCreateMonthlyTab(
    userId: string,
    documentId: string,
    date: Date,
  ): Promise<string | null> {
    const label = GoogleDocsService.monthLabel(date);
    try {
      const auth = await this.oauth.getAuthorizedClient(userId);
      const docs = google.docs({ version: 'v1', auth });
      // tabs / createDocumentTab were added to the Docs API in 2024 and
      // aren't typed in googleapis@173 yet — cast through unknown so the
      // call compiles. Runtime supports it.
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
          }) => Promise<{
            data: {
              replies?: Array<{
                createDocumentTab?: {
                  documentTab?: { tabProperties?: { tabId?: string } };
                };
              }>;
            };
          }>;
        };
      };
      const doc = await docsAny.documents.get({
        documentId,
        includeTabsContent: false,
      });
      const existing = (doc.data.tabs ?? []).find(
        (t) => t.tabProperties?.title === label,
      );
      if (existing?.tabProperties?.tabId) {
        return existing.tabProperties.tabId;
      }
      // Create a fresh tab. Without a parent, it lands at the end of
      // the doc's tab list which is the natural place for "newest".
      const createRes = await docsAny.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            {
              createDocumentTab: {
                tabProperties: { title: label },
              },
            },
          ],
        },
      });
      const reply = createRes.data.replies?.[0]?.createDocumentTab;
      return reply?.documentTab?.tabProperties?.tabId ?? null;
    } catch (err) {
      this.logger.warn(
        `getOrCreateMonthlyTab failed for doc=${documentId} label=${label}: ${(err as Error).message}`,
      );
      return null;
    }
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
      this.logger.warn(
        `appendTaskToTab failed for doc=${documentId} tab=${tabId}: ${(err as Error).message}`,
      );
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
