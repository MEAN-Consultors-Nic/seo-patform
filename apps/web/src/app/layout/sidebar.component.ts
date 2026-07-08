import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { USER_ROLE_LABELS, UserRole } from '@seo/shared';
import { AuthService } from '../core/auth.service';
import { SIDEBAR_ICONS } from './sidebar-icons';

interface NavItem {
  route: string;
  label: string;
  icon: string;
  /** Optional right-aligned pill (NEW, PPC, …). Hidden when collapsed. */
  pill?: { label: string; variant?: 'new' | 'ppc' | 'neutral' };
  /** Restrict to specific roles. Item is hidden otherwise. */
  roles?: UserRole[];
  exact?: boolean;
}

interface NavSection {
  /** Uppercase heading rendered above the group. `null` = no heading. */
  label: string | null;
  items: NavItem[];
  /** If provided, the entire section is hidden unless the current user
   *  matches one of these roles. */
  roles?: UserRole[];
}

/**
 * Permanent left sidebar. Two size modes:
 *   - Expanded (240px): icons + labels + section headings + pills.
 *   - Collapsed (64px): icons only. Section headings and text are hidden;
 *     hover tooltips (via native `title`) still identify each item.
 *
 * Collapse state is owned by the parent shell so the main-content margin
 * can react to it; the sidebar only emits toggle intent.
 */
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside
      class="fixed inset-y-0 left-0 z-40 bg-white border-r border-ink-200 flex flex-col transition-[width] duration-200 ease-out"
      [class.w-60]="!collapsed"
      [class.w-16]="collapsed"
    >
      <!-- HEADER: brand + collapse toggle. -->
      <div
        class="h-14 flex items-center border-b border-ink-200 flex-shrink-0"
        [class.px-3]="!collapsed"
        [class.justify-between]="!collapsed"
        [class.px-0]="collapsed"
        [class.justify-center]="collapsed"
      >
        <a
          routerLink="/dashboard"
          class="flex items-center gap-2.5 min-w-0"
          [title]="collapsed ? 'Media Spearhead' : ''"
        >
          <div
            class="w-8 h-8 rounded-md bg-brand-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0"
          >
            IT
          </div>
          @if (!collapsed) {
            <div class="leading-tight min-w-0">
              <div class="text-sm font-bold text-ink-900 truncate">Internal Tools</div>
              <div
                class="text-[9px] text-ink-500 mt-0.5 uppercase tracking-wider truncate"
              >
                Media Spearhead
              </div>
            </div>
          }
        </a>
        @if (!collapsed) {
          <button
            type="button"
            (click)="toggle.emit()"
            class="w-7 h-7 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-800 flex items-center justify-center flex-shrink-0 transition-colors"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              [innerHTML]="chevronLeft"
            ></svg>
          </button>
        }
      </div>

      <!-- Collapsed-only expand button. Placed right under the header so
           the affordance is obvious even when the header collapse button
           is hidden. -->
      @if (collapsed) {
        <button
          type="button"
          (click)="toggle.emit()"
          class="mx-auto mt-2 mb-1 w-8 h-8 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-800 flex items-center justify-center transition-colors"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            [innerHTML]="chevronRight"
          ></svg>
        </button>
      }

      <!-- BODY: scrollable nav list. -->
      <nav class="flex-1 overflow-y-auto py-2">
        @for (section of visibleSections(); track section.label) {
          <div [class.mt-3]="!$first" [class.mt-1]="$first">
            @if (section.label && !collapsed) {
              <div
                class="px-4 pb-1.5 pt-2 text-[10px] font-semibold text-ink-400 uppercase tracking-wider"
              >
                {{ section.label }}
              </div>
            }
            @if (section.label && collapsed && !$first) {
              <!-- Slim divider stands in for the section heading when
                   the sidebar is collapsed. -->
              <div class="mx-3 my-1.5 border-t border-ink-100"></div>
            }
            <ul class="space-y-0.5" [class.px-2]="!collapsed" [class.px-2]="collapsed">
              @for (item of section.items; track item.route) {
                <li>
                  <a
                    [routerLink]="item.route"
                    routerLinkActive
                    #rla="routerLinkActive"
                    [routerLinkActiveOptions]="{ exact: item.exact || false }"
                    [title]="collapsed ? item.label : ''"
                    [class]="itemClasses(rla.isActive, collapsed)"
                  >
                    <!-- Active-state left accent bar. Absolutely positioned
                         so the icon stays horizontally centred when the
                         sidebar is collapsed. -->
                    @if (rla.isActive) {
                      <span
                        class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-white/80"
                      ></span>
                    }
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="flex-shrink-0"
                      [innerHTML]="iconFor(item.icon)"
                    ></svg>
                    @if (!collapsed) {
                      <span class="flex-1 truncate">{{ item.label }}</span>
                      @if (item.pill) {
                        <span [class]="pillClasses(item.pill.variant)">{{ item.pill.label }}</span>
                      }
                    }
                  </a>
                </li>
              }
            </ul>
          </div>
        }
      </nav>

      <!-- FOOTER: user identity + quick actions. The avatar + name area
           is a link to the personal profile page — that's where each
           user connects their own integrations. -->
      <div
        class="border-t border-ink-200 flex-shrink-0"
        [class.p-2]="collapsed"
        [class.p-3]="!collapsed"
      >
        <div
          class="flex items-center gap-2"
          [class.justify-center]="collapsed"
          [class.flex-col]="collapsed"
        >
          <a
            routerLink="/profile/integrations"
            routerLinkActive
            #profileRla="routerLinkActive"
            class="flex items-center gap-2 min-w-0 flex-1 rounded-md transition-colors"
            [class.hover:bg-ink-100]="!profileRla.isActive"
            [class.bg-brand-500]="profileRla.isActive"
            [class.text-white]="profileRla.isActive"
            [class.p-1]="!collapsed"
            [class.flex-col]="collapsed"
            [class.gap-0]="collapsed"
            [title]="collapsed ? userName() + ' — ' + roleLabel() : 'My profile'"
          >
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              [class.bg-ink-200]="!profileRla.isActive"
              [class.text-ink-700]="!profileRla.isActive"
              [class.bg-white/20]="profileRla.isActive"
              [class.text-white]="profileRla.isActive"
            >
              {{ initials() }}
            </div>
            @if (!collapsed) {
              <div class="leading-tight min-w-0 flex-1">
                <div class="text-xs font-semibold truncate"
                     [class.text-ink-900]="!profileRla.isActive"
                     [class.text-white]="profileRla.isActive">
                  {{ userName() }}
                </div>
                <div class="text-[10px] truncate"
                     [class.text-ink-500]="!profileRla.isActive"
                     [class.text-white/80]="profileRla.isActive">
                  {{ roleLabel() }}
                </div>
              </div>
            }
          </a>
          <div
            class="flex items-center gap-0.5"
            [class.flex-col]="collapsed"
            [class.mt-1]="collapsed"
          >
            <button
              type="button"
              routerLink="/settings/working-hours"
              class="w-7 h-7 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-800 flex items-center justify-center transition-colors"
              title="Platform settings"
              aria-label="Platform settings"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                [innerHTML]="settingsIcon"
              ></svg>
            </button>
            <button
              type="button"
              (click)="signOut.emit()"
              class="w-7 h-7 rounded-md text-ink-500 hover:bg-danger-100 hover:text-danger-500 flex items-center justify-center transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                [innerHTML]="logoutIcon"
              ></svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  private auth = inject(AuthService);
  private sanitizer = inject(DomSanitizer);

  /** Collapse state is owned by the shell so it can control the main
   *  content margin in the same render tick. */
  @Input() collapsed = false;
  @Output() toggle = new EventEmitter<void>();
  @Output() signOut = new EventEmitter<void>();

  /**
   * Icon strings are trusted (hand-authored in sidebar-icons.ts) but Angular's
   * default HTML sanitizer strips SVG child elements when bound via
   * `[innerHTML]`. Wrap them in SafeHtml so `<path>`, `<circle>`, etc. render.
   */
  private safe(name: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(SIDEBAR_ICONS[name] || '');
  }

  chevronLeft = this.safe('chevron-left');
  chevronRight = this.safe('chevron-right');
  settingsIcon = this.safe('settings-gear');
  logoutIcon = this.safe('logout');

  private iconCache = new Map<string, SafeHtml>();

  /**
   * Static nav tree. Grouping is purely presentational — the router
   * doesn't care about sections, it only sees the individual routes.
   */
  private sections: NavSection[] = [
    {
      label: null,
      items: [
        { route: '/dashboard', label: 'Dashboard', icon: 'home', exact: true },
      ],
    },
    {
      label: 'WORK THE BOOK',
      items: [
        { route: '/clients', label: 'Clients', icon: 'users' },
        { route: '/pipeline', label: 'Pipeline', icon: 'kanban' },
      ],
    },
    {
      label: 'REPORTING & DELIVERY',
      items: [
        { route: '/reports', label: 'Reports', icon: 'chart-bar' },
        { route: '/proposals', label: 'Proposals', icon: 'document-check' },
      ],
    },
    {
      label: 'CLIENT OUTREACH',
      items: [
        { route: '/bulk-send', label: 'Bulk send', icon: 'megaphone' },
        { route: '/intake-hub', label: 'Intake Hub', icon: 'inbox' },
      ],
    },
    {
      label: 'SETTINGS',
      items: [
        { route: '/settings/working-hours', label: 'Working hours', icon: 'clock' },
        { route: '/settings/report-layout', label: 'Report layout', icon: 'layout' },
        { route: '/settings/packages', label: 'Packages', icon: 'box' },
        { route: '/settings/onboarding', label: 'Onboarding', icon: 'check-list' },
        {
          route: '/settings/activity-log',
          label: 'Activity Log',
          icon: 'clipboard-list',
          roles: ['root', 'owner', 'admin'],
        },
      ],
    },
    {
      label: 'PLATFORM ADMIN',
      roles: ['root', 'owner', 'admin'],
      items: [
        { route: '/users', label: 'Users', icon: 'user-circle' },
      ],
    },
  ];

  /**
   * Filter sections + items by the caller's role. Hides an empty
   * section altogether so we don't render an orphan heading.
   */
  visibleSections = computed<NavSection[]>(() => {
    const role = this.auth.role();
    return this.sections
      .filter((s) => !s.roles || (role && s.roles.includes(role)))
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !item.roles || (role && item.roles.includes(role)),
        ),
      }))
      .filter((s) => s.items.length > 0);
  });

  roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? USER_ROLE_LABELS[role] : '';
  });

  userName = computed(() => this.auth.user()?.name || 'User');

  initials(): string {
    const name = this.auth.user()?.name || '';
    return (
      name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?'
    );
  }

  /**
   * Cached to avoid re-wrapping the same string on every change-detection
   * cycle (Angular runs the template getter each tick).
   */
  iconFor(name: string): SafeHtml {
    let cached = this.iconCache.get(name);
    if (!cached) {
      cached = this.safe(name);
      this.iconCache.set(name, cached);
    }
    return cached;
  }

  /**
   * Build the class list for a nav item. Solid brand fill on active — the
   * earlier coral→green gradient read as decorative and clashed with the
   * rest of the app (all buttons are solid).
   */
  itemClasses(active: boolean, collapsed: boolean): string {
    const base =
      'relative flex items-center rounded-md text-sm font-medium transition-colors';
    const padding = collapsed
      ? 'justify-center h-10 mx-0'
      : 'gap-2.5 px-3 py-2';
    if (active) {
      return `${base} ${padding} bg-brand-500 !text-white shadow-sm`;
    }
    return `${base} ${padding} text-ink-700 hover:bg-ink-100 hover:text-ink-900`;
  }

  pillClasses(variant?: 'new' | 'ppc' | 'neutral'): string {
    const base =
      'ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider';
    switch (variant) {
      case 'new':
        return `${base} bg-positive-100 text-positive-500`;
      case 'ppc':
        return `${base} bg-sky-500/15 text-sky-600`;
      default:
        return `${base} bg-ink-100 text-ink-600`;
    }
  }
}
