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
      // includeTabsContent MUST be true for the response to include
      // the `tabs` array. With false the API returns the legacy
      // single-body shape and tabs is undefined — that produced the
      // 'Existing tabs: none' message even when the doc clearly had
      // tabs in the sidebar.
      const doc = await docsAny.documents.get({
        documentId,
        includeTabsContent: true,
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
      priority?: string;
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

      // Layout (top → bottom):
      //   title          ← HEADING_3
      //   description    ← NORMAL_TEXT
      //   images         ← inline, each clickable to original
      //   separator      ← thin grey rule
      //   metadata       ← small grey italic: completion date /
      //                    category / priority
      //
      // Metadata sits at the BOTTOM of each entry like a signature
      // line, so the reader sees what was done first and how it was
      // tagged second. Images go between description and metadata
      // because they're evidence of the work, not provenance.
      const dateStr = (task.completedAt ?? new Date()).toLocaleDateString(
        'en-US',
        {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        },
      );
      const metaParts = [
        `Completed ${dateStr}`,
        task.category ? task.category.toUpperCase() : '',
        task.priority ? `${task.priority.toUpperCase()} PRIORITY` : '',
      ].filter(Boolean);
      const metaLine = metaParts.join('  ·  ');
      const separator =
        '────────────────────────────────────────────────────────';
      const title = task.title;
      const description = this.stripHtml(task.description || '').trim();

      // Find the current end-of-body so every insert lands at the
      // tail. includeTabsContent MUST be true for the response to
      // include the tabs[] array — false returns the legacy
      // single-body shape.
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

      const requests: unknown[] = [];

      // 1) Title + description block. Leading \n separates this
      //    entry from whatever the previous one left behind.
      const intro =
        `\n${title}\n` + (description ? `${description}\n` : '\n');
      const titleStart = cursor + 1; // skip the leading \n
      const titleEnd = titleStart + title.length;
      const descStart = titleEnd + 1;
      const descEnd = descStart + description.length;

      requests.push({
        insertText: { location: { index: cursor, tabId }, text: intro },
      });
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: titleStart, endIndex: titleEnd, tabId },
          paragraphStyle: { namedStyleType: 'HEADING_3' },
          fields: 'namedStyleType',
        },
      });
      if (description) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: descStart, endIndex: descEnd, tabId },
            paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
            fields: 'namedStyleType',
          },
        });
      }
      cursor += intro.length;

      // Inline images. Each is sized 480×320pt (a touch wider than the
      // previous 360×240 to better fit landscape screenshots in a doc
      // page), and gets a text-style hyperlink applied to its single-
      // character range so clicking the image in the doc opens the
      // original on Cloudinary. A blank paragraph between images keeps
      // them visually separated when more than one is attached.
      //
      // No URL-extension pre-filter here: Cloudinary URLs sometimes
      // come back without an extension (`/upload/v123/abc` instead of
      // `…/abc.png`). The calling side already filtered by Cloudinary
      // resourceType so anything reaching us is image-typed. If Docs
      // can't render a specific URL the entire batch fails and we
      // surface that error verbatim — much better than silently
      // skipping every image as the old extension check did.
      const images = (task.imageAttachments ?? []).filter((u): u is string => !!u);
      images.forEach((url, idx) => {
        const imageIndex = cursor;
        requests.push({
          insertInlineImage: {
            location: { index: cursor, tabId },
            uri: url,
            objectSize: {
              width: { magnitude: 480, unit: 'PT' },
              height: { magnitude: 320, unit: 'PT' },
            },
          },
        });
        cursor += 1;
        // Clickable image — apply link text-style on the image range.
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: imageIndex,
              endIndex: imageIndex + 1,
              tabId,
            },
            textStyle: { link: { url } },
            fields: 'link',
          },
        });
        // Blank line between images (newline + extra paragraph break
        // for the spacer when there's another image after this one).
        const sep = idx < images.length - 1 ? '\n\n' : '\n';
        requests.push({
          insertText: {
            location: { index: cursor, tabId },
            text: sep,
          },
        });
        cursor += sep.length;
      });

      // 3) Footer: separator rule + metadata signature line, then a
      //    blank line so the next entry has air around it.
      const footer = `${separator}\n${metaLine}\n\n`;
      const footerSepStart = cursor;
      const footerSepEnd = footerSepStart + separator.length;
      const footerMetaStart = footerSepEnd + 1;
      const footerMetaEnd = footerMetaStart + metaLine.length;

      requests.push({
        insertText: { location: { index: cursor, tabId }, text: footer },
      });
      // Separator: thin light grey rule.
      requests.push({
        updateTextStyle: {
          range: { startIndex: footerSepStart, endIndex: footerSepEnd, tabId },
          textStyle: {
            fontSize: { magnitude: 8, unit: 'PT' },
            foregroundColor: {
              color: { rgbColor: { red: 0.75, green: 0.75, blue: 0.75 } },
            },
          },
          fields: 'fontSize,foregroundColor',
        },
      });
      // Metadata: small grey italic so completion date / category /
      // priority sits as a muted signature beneath the entry.
      requests.push({
        updateTextStyle: {
          range: { startIndex: footerMetaStart, endIndex: footerMetaEnd, tabId },
          textStyle: {
            fontSize: { magnitude: 9, unit: 'PT' },
            italic: true,
            foregroundColor: {
              color: { rgbColor: { red: 0.42, green: 0.45, blue: 0.5 } },
            },
          },
          fields: 'fontSize,italic,foregroundColor',
        },
      });
      cursor += footer.length;

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
