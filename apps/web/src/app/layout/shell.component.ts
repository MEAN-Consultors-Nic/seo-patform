import { CommonModule } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { DomainInfoButtonComponent } from '../features/clients/domain-info-button.component';
import { SchemaModelerButtonComponent } from '../features/clients/schema-modeler-button.component';
import { SIDEBAR_ICONS } from './sidebar-icons';
import { SidebarComponent } from './sidebar.component';

const SIDEBAR_COLLAPSE_KEY = 'it.sidebar.collapsed';

/**
 * Application shell. Owns the layout skeleton:
 *   - Left sidebar (permanent on ≥md, overlay on <md).
 *   - Top utility strip with Domain info / Schema Modeler.
 *   - Router outlet for the routed feature.
 *
 * Sidebar collapse state is persisted to localStorage so it survives
 * reloads. On mobile the sidebar renders as an off-canvas overlay
 * regardless of collapse state.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    DomainInfoButtonComponent,
    SchemaModelerButtonComponent,
  ],
  template: `
    <div class="min-h-screen bg-ink-50">
      <!-- Desktop sidebar. Always mounted; the SidebarComponent flips
           between 240px and 64px based on [collapsed]. -->
      <div class="hidden md:block">
        <app-sidebar
          [collapsed]="collapsed()"
          (toggle)="toggleCollapsed()"
          (signOut)="auth.logout()"
        />
      </div>

      <!-- Mobile off-canvas sidebar. Rendered inside a fixed backdrop so
           tapping outside dismisses it. The sidebar itself stays fixed
           on the left and slides in with a transform. -->
      @if (mobileMenuOpen()) {
        <div
          class="md:hidden fixed inset-0 z-50 bg-ink-900/40"
          (click)="mobileMenuOpen.set(false)"
        >
          <div (click)="$event.stopPropagation()">
            <app-sidebar
              [collapsed]="false"
              (toggle)="mobileMenuOpen.set(false)"
              (signOut)="auth.logout(); mobileMenuOpen.set(false)"
            />
          </div>
        </div>
      }

      <!-- Main column. Offsets by the sidebar width on ≥md so content
           doesn't slide under the fixed aside. -->
      <div
        class="flex flex-col min-h-screen transition-[margin] duration-200 ease-out"
        [class.md:ml-60]="!collapsed()"
        [class.md:ml-16]="collapsed()"
      >
        <!-- Slim top utility strip. Mobile: burger on the left. Desktop:
             quick-action buttons on the right. -->
        <header
          class="h-12 bg-white border-b border-ink-200 flex items-center justify-between px-3 sm:px-4 lg:px-6 flex-shrink-0"
        >
          <button
            type="button"
            class="md:hidden w-9 h-9 rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 flex items-center justify-center"
            (click)="mobileMenuOpen.set(true)"
            aria-label="Open menu"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              [innerHTML]="menuIcon"
            ></svg>
          </button>

          <!-- Left slot on desktop is empty — the sidebar owns navigation.
               Keeping the flex container so the right-hand cluster still
               anchors to the far edge. -->
          <div class="hidden md:block"></div>

          <div class="flex items-center gap-1.5">
            <app-domain-info-button
              label="Domain info"
              buttonClass="h-8 text-xs font-semibold px-2.5 sm:px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition"
            />
            <app-schema-modeler-button
              label="Schema Modeler"
              buttonClass="h-8 text-xs font-semibold px-2.5 sm:px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition"
            />
          </div>
        </header>

        <main class="flex-1 overflow-y-auto">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  protected auth = inject(AuthService);
  private router = inject(Router);

  menuIcon = SIDEBAR_ICONS['menu'];

  /** Persisted sidebar collapse state. `'1'` in localStorage = collapsed. */
  collapsed = signal<boolean>(
    (typeof localStorage !== 'undefined' &&
      localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1') ||
      false,
  );

  mobileMenuOpen = signal(false);

  constructor() {
    // Route change auto-closes the mobile drawer so it doesn't linger
    // over the newly-navigated page.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.mobileMenuOpen.set(false));

    // Lock body scroll while the mobile drawer is open.
    effect(() => {
      const open = this.mobileMenuOpen();
      if (typeof document !== 'undefined') {
        document.body.style.overflow = open ? 'hidden' : '';
      }
    });

    // Persist collapse state. `effect` covers both toggle paths without
    // us needing to remember to write in every mutator.
    effect(() => {
      const c = this.collapsed();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, c ? '1' : '0');
      }
    });
  }

  toggleCollapsed() {
    this.collapsed.update((v) => !v);
  }
}
