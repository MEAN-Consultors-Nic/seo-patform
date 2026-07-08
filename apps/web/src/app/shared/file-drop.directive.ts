import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  Renderer2,
  inject,
} from '@angular/core';

/**
 * Reusable file drag-and-drop directive.
 *
 *   <div appFileDrop (filesDropped)="handle($event)"></div>
 *
 * Handles dragenter/dragover/dragleave/drop on the host element,
 * emits the dropped `File[]`, and toggles a `.file-drop-active`
 * class on the host so consumers can style the drag-over state via
 * `:host-context(.file-drop-active)` or a `[class.file-drop-active]`
 * mirror on the same element.
 *
 * The directive does NOT upload anything on its own — that's up to the
 * consumer, which typically pipes the file through the CloudinaryService
 * and then registers the metadata with its own API.
 */
@Directive({
  selector: '[appFileDrop]',
  standalone: true,
  exportAs: 'fileDrop',
  host: {
    '[class.file-drop-active]': 'active',
  },
})
export class FileDropDirective {
  /**
   * When false, the directive still cancels the browser's default
   * drop behavior on the host but doesn't emit or highlight — handy
   * for disabled states (e.g. Cloudinary unconfigured).
   */
  @Input() appFileDrop: boolean | '' = true;

  @Output() filesDropped = new EventEmitter<File[]>();

  private el = inject(ElementRef<HTMLElement>);
  private renderer = inject(Renderer2);

  active = false;

  private get enabled(): boolean {
    return this.appFileDrop !== false;
  }

  private hasFiles(dt: DataTransfer | null): boolean {
    if (!dt) return false;
    return Array.from(dt.types || []).includes('Files');
  }

  @HostListener('dragenter', ['$event'])
  onDragEnter(ev: DragEvent) {
    if (!this.enabled) return;
    if (!this.hasFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.active = true;
  }

  @HostListener('dragover', ['$event'])
  onDragOver(ev: DragEvent) {
    if (!this.enabled) return;
    if (!this.hasFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    ev.stopPropagation();
    // Signal "copy" cursor rather than the default move/link icon.
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    this.active = true;
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(ev: DragEvent) {
    if (!this.enabled) return;
    // Only clear when the pointer actually leaves the host — otherwise
    // dragging over a child element flickers the class off and on.
    const related = ev.relatedTarget as Node | null;
    if (related && this.el.nativeElement.contains(related)) return;
    this.active = false;
  }

  @HostListener('drop', ['$event'])
  onDrop(ev: DragEvent) {
    if (!this.enabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.active = false;
    const files = Array.from(ev.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    this.filesDropped.emit(files);
  }
}
