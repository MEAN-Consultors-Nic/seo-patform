import { Injectable, Logger } from '@nestjs/common';
import { docs_v1, google } from 'googleapis';
import { GoogleOAuthService } from './google-oauth.service';
import {
  DocsContent,
  groupListBlocks,
  htmlToDocsContent,
} from './html-to-docs';

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
  /**
   * Returns the flat list of tab titles + ids for the doc, including
   * nested child tabs (walked one level deep — mirrors findMonthlyTab).
   * Used by the frontend to build the 'target tab' picker on the task
   * completion modal.
   */
  async listTabs(
    userId: string,
    documentId: string,
  ): Promise<Array<{ tabId: string; title: string }>> {
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
              childTabs?: Array<{
                tabProperties?: { tabId?: string; title?: string };
              }>;
            }>;
          };
        }>;
      };
    };
    const doc = await docsAny.documents.get({
      documentId,
      includeTabsContent: true,
    });
    const tabs = doc.data.tabs ?? [];
    const flat: Array<{ tabId: string; title: string }> = [];
    const walk = (
      t: {
        tabProperties?: { tabId?: string; title?: string };
        childTabs?: unknown[];
      },
    ) => {
      if (t.tabProperties?.tabId && t.tabProperties?.title) {
        flat.push({
          tabId: t.tabProperties.tabId,
          title: t.tabProperties.title,
        });
      }
      for (const c of (t.childTabs ?? []) as Array<{
        tabProperties?: { tabId?: string; title?: string };
        childTabs?: unknown[];
      }>) {
        walk(c);
      }
    };
    for (const t of tabs) walk(t);
    return flat;
  }

  /**
   * Same as findMonthlyTab but the target tab is picked by exact
   * user-provided name instead of derived from a date. When the user
   * picks a tab from the completion modal's dropdown we call this
   * directly and skip the monthly auto-lookup.
   */
  async findTabByName(
    userId: string,
    documentId: string,
    title: string,
  ): Promise<string> {
    const tabs = await this.listTabs(userId, documentId);
    const match = tabs.find((t) => t.title === title);
    if (!match) {
      const have = tabs
        .map((t) => t.title)
        .slice(0, 8)
        .join(', ');
      throw new Error(
        `The doc has no tab named "${title}". Existing tabs: ${have || 'none'}`,
      );
    }
    return match.tabId;
  }

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
      /**
       * Structured attachment list. Images are inlined as thumbnails
       * (max 2); everything else is written as a "📎 filename" line
       * with a hyperlink to the file so the reader can open the
       * document/PDF/video without breaking the Docs API on a
       * non-image URI.
       */
      attachments?: Array<{
        url: string;
        originalFilename?: string;
        resourceType?: 'image' | 'raw' | 'video';
      }>;
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
      const description = htmlToDocsContent(task.description);

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

      // 1) Title + HR + description block. Title is HEADING_2 with
      //    the brand coral color so each entry leads with a strong
      //    visual hook. A separator row sits between title and
      //    description as a hard-rule horizontal divider.
      //
      // No leading \n on the intro. HEADING_2 contributes its own
      // SPACE_ABOVE (~18pt by default) which provides breathing
      // room between consecutive entries without needing an extra
      // empty paragraph.
      //
      // The description is inserted as its own request so its index
      // math stays independent of the title block — it can span many
      // paragraphs now that headings, lists and links survive.
      const intro = `${title}\n${separator}\n`;
      const titleStart = cursor;
      const titleEnd = titleStart + title.length;
      const introSepStart = titleEnd + 1;
      const introSepEnd = introSepStart + separator.length;

      requests.push({
        insertText: { location: { index: cursor, tabId }, text: intro },
      });
      // Title paragraph: HEADING_2 surfaces it in the Docs outline
      // and bumps the font ~6pt over HEADING_3.
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: titleStart, endIndex: titleEnd, tabId },
          paragraphStyle: { namedStyleType: 'HEADING_2' },
          fields: 'namedStyleType',
        },
      });
      // Title text: brand coral + bold. HEADING_2 already implies a
      // weight bump but explicit bold guarantees it across themes
      // the user may apply to the doc later.
      requests.push({
        updateTextStyle: {
          range: { startIndex: titleStart, endIndex: titleEnd, tabId },
          textStyle: {
            bold: true,
            foregroundColor: {
              color: {
                // #E5613D — brand-600, darker than the bright coral
                // for better contrast on a white doc background.
                rgbColor: { red: 0.898, green: 0.380, blue: 0.239 },
              },
            },
          },
          fields: 'bold,foregroundColor',
        },
      });
      // HR under the title: same em-dash row as the footer, also
      // small + light grey so it reads as a divider rather than
      // competing with the title above.
      requests.push({
        updateTextStyle: {
          range: { startIndex: introSepStart, endIndex: introSepEnd, tabId },
          textStyle: {
            fontSize: { magnitude: 8, unit: 'PT' },
            foregroundColor: {
              color: { rgbColor: { red: 0.75, green: 0.75, blue: 0.75 } },
            },
          },
          fields: 'fontSize,foregroundColor',
        },
      });
      cursor += intro.length;

      // 2) Description. Rendered with real Docs structure — headings,
      //    bullet/numbered lists, bold/italic/underline/strikethrough,
      //    hyperlinks, blockquotes and code — so the entry reads the
      //    same in the doc as it did in the editor, and survives a
      //    "Download as .docx" into Word.
      if (description.text) {
        const descBase = cursor;
        const descText = `${description.text}\n`;
        requests.push({
          insertText: { location: { index: cursor, tabId }, text: descText },
        });
        requests.push(
          ...this.descriptionStyleRequests(description, descBase, tabId),
        );
        cursor += descText.length;
      }

      // Split attachments by kind: images get inlined as thumbnails
      // (capped at 2 so the row fits inside the 468pt LETTER content
      // width), everything else is rendered as a "📎 filename" line
      // with a hyperlink. Trying to insertInlineImage on a PDF / doc /
      // video URI causes the Docs API to reject the whole batch
      // ("Access to the provided image was forbidden").
      //
      // Cloudinary sometimes tags PDFs as resource_type=image (it
      // rasterizes them on the fly), so trusting resourceType alone
      // isn't enough — we also require an actual raster extension
      // (png/jpg/gif/webp) via isLikelyImage(). Anything ambiguous
      // falls into the file-links bucket so nothing that isn't a
      // real image ever reaches insertInlineImage.
      const allAttachments = (task.attachments ?? []).filter((a) => !!a?.url);
      const images = allAttachments
        .filter(
          (a) => a.resourceType === 'image' && this.isLikelyImage(a.url),
        )
        .slice(0, 2);
      const fileLinks = allAttachments.filter(
        (a) => !(a.resourceType === 'image' && this.isLikelyImage(a.url)),
      );

      images.forEach((att, idx) => {
        const imageIndex = cursor;
        requests.push({
          insertInlineImage: {
            location: { index: cursor, tabId },
            uri: att.url,
            objectSize: {
              width: { magnitude: 210, unit: 'PT' },
              height: { magnitude: 140, unit: 'PT' },
            },
          },
        });
        cursor += 1;
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: imageIndex,
              endIndex: imageIndex + 1,
              tabId,
            },
            textStyle: { link: { url: att.url } },
            fields: 'link',
          },
        });
        if (idx === 0 && images.length > 1) {
          requests.push({
            insertText: { location: { index: cursor, tabId }, text: ' ' },
          });
          cursor += 1;
        }
      });
      if (images.length > 0) {
        requests.push({
          insertText: { location: { index: cursor, tabId }, text: '\n' },
        });
        cursor += 1;
      }

      // Non-image attachments: one line each, "📎 filename" with the
      // filename hyperlinked to the file. Falls back to the URL path
      // segment when the original filename isn't stored. The 📎 prefix
      // isn't styled as a link so the icon stays visible even if the
      // doc theme hides link decorations.
      fileLinks.forEach((att) => {
        const label = att.originalFilename?.trim() || this.urlFilename(att.url);
        const prefix = '📎 ';
        const lineText = `${prefix}${label}\n`;
        const lineStart = cursor;
        const labelStart = lineStart + prefix.length;
        const labelEnd = labelStart + label.length;
        requests.push({
          insertText: { location: { index: cursor, tabId }, text: lineText },
        });
        // Style just the filename portion as a hyperlink (blue +
        // underlined via Docs' default link style).
        requests.push({
          updateTextStyle: {
            range: { startIndex: labelStart, endIndex: labelEnd, tabId },
            textStyle: {
              link: { url: att.url },
              fontSize: { magnitude: 10, unit: 'PT' },
            },
            fields: 'link,fontSize',
          },
        });
        cursor += lineText.length;
      });

      // 4) Footer: separator rule + metadata signature line. Single
      //    trailing newline (NOT \n\n) so no empty paragraph lingers
      //    after each entry — Google was rendering that empty
      //    paragraph as visible whitespace between the metadata and
      //    the next title. HEADING_2's SPACE_ABOVE on the next title
      //    already provides ~18pt of breathing room.
      const footer = `${separator}\n${metaLine}\n`;
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
   * Turns the converter's block/run ranges into Docs API requests.
   *
   * Request ORDER matters and is deliberate:
   *   1. paragraph styles   — headings, quote indent, code font
   *   2. nested-list indent — must land BEFORE bullets, because Docs
   *                           derives a bullet's nesting level (and so
   *                           its glyph: disc -> circle -> square) from
   *                           the paragraph's indentation at the moment
   *                           createParagraphBullets runs
   *   3. bullets            — one request per run of same-type items so
   *                           numbering doesn't restart every line
   *   4. inline styles      — last, and each with a narrow `fields`
   *                           mask so it merges with the paragraph-level
   *                           styling above instead of replacing it
   *
   * None of these insert or remove characters, so every index stays
   * valid for the whole batch.
   */
  private descriptionStyleRequests(
    content: DocsContent,
    base: number,
    tabId: string,
  ): docs_v1.Schema$Request[] {
    // Typed against the generated schema on purpose: it turns a field
    // typo (strikeThrough vs strikethrough, say) into a build error
    // instead of a rejected batch at sync time.
    const requests: docs_v1.Schema$Request[] = [];
    const rangeOf = (b: { start: number; end: number }) => ({
      startIndex: base + b.start,
      endIndex: base + b.end,
      tabId,
    });

    // 1) Paragraph-level styling.
    for (const b of content.blocks) {
      const range = rangeOf(b);
      if (b.type === 'heading2' || b.type === 'heading3') {
        // The entry title already owns HEADING_2, so description
        // headings start one level down to keep the doc outline sane.
        requests.push({
          updateParagraphStyle: {
            range,
            paragraphStyle: {
              namedStyleType:
                b.type === 'heading2' ? 'HEADING_3' : 'HEADING_4',
            },
            fields: 'namedStyleType',
          },
        });
        continue;
      }

      requests.push({
        updateParagraphStyle: {
          range,
          paragraphStyle:
            b.type === 'quote'
              ? {
                  namedStyleType: 'NORMAL_TEXT',
                  indentStart: { magnitude: 24, unit: 'PT' },
                }
              : { namedStyleType: 'NORMAL_TEXT' },
          fields:
            b.type === 'quote' ? 'namedStyleType,indentStart' : 'namedStyleType',
        },
      });

      if (b.type === 'quote') {
        requests.push({
          updateTextStyle: {
            range,
            textStyle: {
              italic: true,
              foregroundColor: {
                color: { rgbColor: { red: 0.42, green: 0.45, blue: 0.5 } },
              },
            },
            fields: 'italic,foregroundColor',
          },
        });
      } else if (b.type === 'code') {
        requests.push({
          updateTextStyle: {
            range,
            textStyle: {
              weightedFontFamily: { fontFamily: 'Courier New' },
              fontSize: { magnitude: 9.5, unit: 'PT' },
            },
            fields: 'weightedFontFamily,fontSize',
          },
        });
      }
    }

    // 2) Nested list indentation — see the ordering note above.
    for (const b of content.blocks) {
      if (b.type !== 'bullet' && b.type !== 'number') continue;
      if (b.indent <= 0) continue;
      const magnitude = 18 * (b.indent + 1);
      requests.push({
        updateParagraphStyle: {
          range: rangeOf(b),
          paragraphStyle: {
            indentStart: { magnitude, unit: 'PT' },
            indentFirstLine: { magnitude: magnitude - 18, unit: 'PT' },
          },
          fields: 'indentStart,indentFirstLine',
        },
      });
    }

    // 3) Bullets, grouped per contiguous run.
    for (const group of groupListBlocks(content.blocks)) {
      requests.push({
        createParagraphBullets: {
          range: rangeOf(group),
          bulletPreset:
            group.type === 'number'
              ? 'NUMBERED_DECIMAL_ALPHA_ROMAN'
              : 'BULLET_DISC_CIRCLE_SQUARE',
        },
      });
    }

    // 4) Inline character styling.
    for (const r of content.runs) {
      const textStyle: docs_v1.Schema$TextStyle = {};
      const fields: string[] = [];
      if (r.style.bold) {
        textStyle.bold = true;
        fields.push('bold');
      }
      if (r.style.italic) {
        textStyle.italic = true;
        fields.push('italic');
      }
      if (r.style.underline) {
        textStyle.underline = true;
        fields.push('underline');
      }
      if (r.style.strikethrough) {
        textStyle.strikethrough = true;
        fields.push('strikethrough');
      }
      if (r.style.code) {
        textStyle.weightedFontFamily = { fontFamily: 'Courier New' };
        fields.push('weightedFontFamily');
      }
      if (r.style.link) {
        textStyle.link = { url: r.style.link };
        fields.push('link');
      }
      if (fields.length === 0) continue;
      requests.push({
        updateTextStyle: {
          range: rangeOf(r),
          textStyle,
          fields: fields.join(','),
        },
      });
    }

    return requests;
  }

  /**
   * Extract a filename from a Cloudinary URL when the caller didn't
   * pass originalFilename. Takes the last path segment and strips the
   * query string — good enough for a "📎 label" display line.
   */
  private urlFilename(url: string): string {
    try {
      const path = url.split('?')[0];
      const seg = path.split('/').pop() || 'attachment';
      return decodeURIComponent(seg);
    } catch {
      return 'attachment';
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

}
