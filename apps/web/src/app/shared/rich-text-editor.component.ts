import { CommonModule } from '@angular/common';
import { Component, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillEditorComponent } from 'ngx-quill';
import type Quill from 'quill';
import { sanitizeText } from '@seo/shared';

/**
 * Tags that carry formatting we'd lose by falling back to the plain-text
 * paste path. If a clipboard's text/html contains none of them it's
 * structurally worthless — <pre>, <div> soup, <span style> soup, or a
 * run of <br> — and we're better off reflowing the plain text.
 */
const MEANINGFUL_HTML = /<\s*(strong|b|em|i|u|s|a|ul|ol|li|h[1-6]|blockquote|code|table|img)\b/i;

/**
 * Collapses soft-wrap newlines the way every writing tool does: a single
 * newline is a wrapped line and joins with a space, a blank line is a real
 * paragraph break and survives.
 *
 * Pasting "Demo lines\nwith linebreaks" therefore lands as
 * "Demo lines with linebreaks" instead of two stacked paragraphs, while a
 * genuine multi-paragraph paste keeps its paragraphs.
 */
function reflowPastedText(raw: string): string {
  // Private-use marker parks the real paragraph breaks while the
  // soft-wrap pass eats every remaining newline. Distinct from the
  // U+E000 marker sanitizeText uses internally, and sanitizeText has
  // already finished by the time we stamp it.
  const PARA = '\uE001';
  return sanitizeText(raw)
    .replace(/\r\n?/g, '\n')
    // A blank line (however padded) is a real paragraph break.
    .replace(/[ \t]*\n(?:[ \t]*\n)+[ \t]*/g, PARA)
    // Every newline still standing was a soft wrap.
    .replace(/[ \t]*\n[ \t]*/g, ' ')
    .replace(/\uE001/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Drop-in rich-text editor that wraps ngx-quill and adds a Visual ↔ HTML
 * toggle in the top-right corner. The toggle swaps the Quill surface for
 * a monospace `<textarea>` that shows the raw HTML; edits in either mode
 * write through to the same model value, so the user can flip back and
 * forth without losing work.
 *
 * Usage:
 *   <app-rich-text-editor
 *     [(value)]="summaryText"
 *     placeholder="…"
 *     [styles]="{ minHeight: '160px' }"></app-rich-text-editor>
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillEditorComponent],
  template: `
    <div class="rich-text-editor">
      <div class="mb-1.5 flex items-center justify-end">
        <div class="inline-flex overflow-hidden rounded-md border border-ink-200 text-[10px]">
          <button
            type="button"
            class="px-2 py-1 transition-colors"
            [class.bg-brand-50]="mode() === 'visual'"
            [class.text-brand-600]="mode() === 'visual'"
            [class.font-semibold]="mode() === 'visual'"
            [class.text-ink-500]="mode() !== 'visual'"
            (click)="mode.set('visual')"
            title="Visual editor (formatted)">
            Visual
          </button>
          <button
            type="button"
            class="border-l border-ink-200 px-2 py-1 transition-colors"
            [class.bg-brand-50]="mode() === 'code'"
            [class.text-brand-600]="mode() === 'code'"
            [class.font-semibold]="mode() === 'code'"
            [class.text-ink-500]="mode() !== 'code'"
            (click)="mode.set('code')"
            title="Raw HTML source">
            &lt;/&gt; HTML
          </button>
        </div>
      </div>

      @if (mode() === 'visual') {
        <quill-editor
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          (onEditorCreated)="onEditorCreated($event)"
          format="html"
          [placeholder]="placeholder()"
          [styles]="styles()"></quill-editor>
      } @else {
        <textarea
          class="input w-full font-mono text-xs leading-relaxed"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          [rows]="codeRows()"
          spellcheck="false"
          [placeholder]="placeholder()"></textarea>
      }
    </div>
  `,
})
export class RichTextEditorComponent {
  /** Two-way bound HTML value. */
  value = model<string | undefined>('');

  /** Placeholder text shown in both Visual and Code modes when empty. */
  placeholder = input<string>('');

  /**
   * Inline style overrides applied to the Quill container — same shape
   * ngx-quill accepts. Use `{ minHeight: '200px' }` to size the editor.
   */
  styles = input<Record<string, string> | undefined>(undefined);

  /** Number of rows for the Code-mode textarea. */
  codeRows = input<number>(12);

  /** Current display mode — flipped by the toggle buttons. */
  mode = signal<'visual' | 'code'>('visual');

  /**
   * Installs our own paste handler ahead of Quill's.
   *
   * Quill turns every "\n" in a plain-text paste into its own block, so
   * text copied out of a PDF, a terminal, a textarea or a chat bubble —
   * anything hard-wrapped at the source — arrives as a stack of one-line
   * paragraphs. We intercept those pastes and reflow them (see
   * reflowPastedText), and let Quill handle the rest untouched so pastes
   * from Docs/Notion/web pages keep their bold, links and lists.
   *
   * Registered in the capture phase on the same node Quill listens on;
   * stopImmediatePropagation is what keeps Quill's own handler from also
   * running when we've taken over.
   */
  onEditorCreated(quill: Quill): void {
    quill.root.addEventListener(
      'paste',
      (event: Event) => {
        const e = event as ClipboardEvent;
        const data = e.clipboardData;
        if (!data) return;

        const html = data.getData('text/html');
        const plain = data.getData('text/plain');
        if (!plain) return;
        // Real rich content — hand it back to Quill's converter.
        if (html && MEANINGFUL_HTML.test(html)) return;

        const text = reflowPastedText(plain);
        if (!text) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const range = quill.getSelection(true) ?? { index: 0, length: 0 };
        if (range.length > 0) {
          quill.deleteText(range.index, range.length, 'user');
        }
        quill.insertText(range.index, text, 'user');
        quill.setSelection(range.index + text.length, 0, 'silent');
      },
      true,
    );
  }
}
