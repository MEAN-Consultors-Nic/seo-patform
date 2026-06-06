import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SanitizerService {
  private sanitizer = inject(DomSanitizer);

  // Sanitize Quill HTML output and mark it safe for [innerHTML].
  // Allows basic formatting + links; forces target="_blank" rel="noopener noreferrer".
  trustRichHtml(html: string | undefined | null): SafeHtml {
    if (!html) return '';
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's',
        'a', 'ul', 'ol', 'li', 'h2', 'h3',
        'blockquote', 'code',
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ADD_ATTR: ['target'],
    });

    // Force external links to open in new tab safely
    const withSafeLinks = clean.replace(
      /<a\s+(?![^>]*target=)/gi,
      '<a target="_blank" rel="noopener noreferrer" ',
    );
    return this.sanitizer.bypassSecurityTrustHtml(withSafeLinks);
  }

  // True if HTML has visible (non-whitespace) text
  hasVisibleContent(html: string | undefined | null): boolean {
    if (!html) return false;
    const stripped = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return stripped.length > 0;
  }
}
