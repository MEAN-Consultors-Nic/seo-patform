import { CommonModule } from '@angular/common';
import { Component, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillEditorComponent } from 'ngx-quill';

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
}
