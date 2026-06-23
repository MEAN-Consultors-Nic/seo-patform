import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { USER_ROLE_LABELS, UserRole } from '@seo/shared';
import { AuthService } from '../core/auth.service';
import { DomainInfoButtonComponent } from '../features/clients/domain-info-button.component';
import { SchemaModelerButtonComponent } from '../features/clients/schema-modeler-button.component';

interface NavItem {
  route: string;
  label: string;
  icon: string;
  exact?: boolean;
  roles?: UserRole[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    DomainInfoButtonComponent,
    SchemaModelerButtonComponent,
  ],
  template: `
    <div class="flex h-screen overflow-hidden bg-ink-50 relative">
      <!-- Mobile backdrop -->
      @if (sidebarOpen()) {
        <button type="button"
                class="md:hidden fixed inset-0 z-30 bg-ink-900/40 transition-opacity"
                aria-label="Close menu"
                (click)="closeSidebar()"></button>
      }

      <!-- Sidebar -->
      <aside
        class="bg-white border-r border-ink-200 flex flex-col flex-shrink-0 z-40
               fixed inset-y-0 left-0 w-64 transform transition-all duration-200
               md:static md:translate-x-0"
        [class.translate-x-0]="sidebarOpen()"
        [class.-translate-x-full]="!sidebarOpen()"
        [class.md:w-60]="!sidebarCollapsed()"
        [class.md:w-16]="sidebarCollapsed()">
        <div class="px-5 py-4 border-b border-ink-200 flex items-center justify-between"
             [class.md:px-3]="sidebarCollapsed()"
             [class.md:justify-center]="sidebarCollapsed()">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-md bg-brand-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              S
            </div>
            @if (!sidebarCollapsed()) {
              <div class="min-w-0">
                <div class="text-sm font-bold text-ink-900 leading-none">SEO Platform</div>
                <div class="text-[10px] text-ink-500 mt-0.5 uppercase tracking-wider">Media Spearhead</div>
              </div>
            }
          </div>
          <button type="button"
                  class="md:hidden text-ink-400 hover:text-ink-900 text-xl leading-none p-1"
                  (click)="closeSidebar()"
                  aria-label="Close menu">×</button>
        </div>

        <nav class="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto"
             [class.md:px-2]="sidebarCollapsed()">
          @for (item of visibleNavItems(); track item.route) {
            <a [routerLink]="item.route"
               routerLinkActive="!bg-brand-50 !text-brand-700 !border-l-brand-500"
               [routerLinkActiveOptions]="{ exact: item.exact || false }"
               [title]="sidebarCollapsed() ? item.label : ''"
               class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-ink-600 border-l-2 border-l-transparent hover:bg-ink-50 hover:text-ink-900 transition-colors"
               [class.md:justify-center]="sidebarCollapsed()"
               [class.md:px-2]="sidebarCollapsed()">
              <span class="text-base leading-none w-4 text-center flex-shrink-0">{{ item.icon }}</span>
              @if (!sidebarCollapsed()) {
                <span>{{ item.label }}</span>
              }
            </a>
          }
        </nav>

        <div class="border-t border-ink-200 px-3 py-3"
             [class.md:px-2]="sidebarCollapsed()">
          <div class="flex items-center gap-2.5 px-2 py-2 rounded-md"
               [class.md:px-0]="sidebarCollapsed()"
               [class.md:justify-center]="sidebarCollapsed()">
            <div class="w-8 h-8 rounded-full bg-ink-200 flex items-center justify-center text-xs font-bold text-ink-700 flex-shrink-0"
                 [title]="sidebarCollapsed() ? (auth.user()?.name || 'User') + ' · ' + roleLabel() : ''">
              {{ initials() }}
            </div>
            @if (!sidebarCollapsed()) {
              <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold text-ink-900 truncate">{{ auth.user()?.name || 'User' }}</div>
                <div class="text-[10px] text-ink-500 truncate">{{ roleLabel() }}</div>
              </div>
              <button (click)="auth.logout()"
                      class="text-ink-400 hover:text-danger-500 transition-colors text-base leading-none"
                      title="Sign out">
                ⏻
              </button>
            }
          </div>
        </div>

        <!-- Desktop collapse toggle. Lives at the bottom edge of the
             sidebar so it's reachable without leaving the rail. Hidden
             on mobile where the entire sidebar is a drawer. -->
        <button type="button"
                (click)="toggleCollapsed()"
                class="hidden md:flex items-center justify-center border-t border-ink-200 py-2 text-ink-400 hover:text-ink-900 hover:bg-ink-50 text-xs gap-1.5 transition-colors"
                [title]="sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
          @if (sidebarCollapsed()) {
            <span>›</span>
          } @else {
            <span>‹</span>
            <span>Collapse</span>
          }
        </button>
      </aside>

      <!-- Main content area -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">
        <!-- Top header bar with quick actions -->
        <header class="min-h-12 bg-white border-b border-ink-200 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-1.5 flex-shrink-0">
          <button type="button"
                  class="md:hidden w-9 h-9 rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 flex items-center justify-center flex-shrink-0"
                  (click)="openSidebar()"
                  aria-label="Open menu">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M2 4h12M2 8h12M2 12h12" stroke-linecap="round" />
            </svg>
          </button>

          <div class="flex flex-wrap items-center justify-end gap-2 flex-1 min-w-0">
            <span class="hidden sm:inline text-[10px] uppercase tracking-wider font-bold text-ink-400 mr-1">
              Quick actions
            </span>
            <app-domain-info-button
              label="Domain info"
              buttonClass="h-8 text-xs font-semibold px-2.5 sm:px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition" />
            <app-schema-modeler-button
              label="Schema Modeler"
              buttonClass="h-8 text-xs font-semibold px-2.5 sm:px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition" />
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

  sidebarOpen = signal(false);
  /**
   * Desktop-only collapsed state. When true the sidebar shrinks to a
   * 64px icon rail; when false the full 240px panel with labels. We
   * persist the choice in localStorage so a user who prefers the rail
   * doesn't have to re-collapse it every session. Mobile drawer
   * behavior is unaffected — sidebarOpen still controls that.
   */
  sidebarCollapsed = signal<boolean>(this.readCollapsed());

  constructor() {
    // Auto-close drawer on route changes so users navigating via the mobile
    // menu don't end up looking at the backdrop after a click.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.sidebarOpen.set(false));
    // Lock body scroll while the drawer is open on mobile.
    effect(() => {
      const open = this.sidebarOpen();
      document.body.style.overflow = open ? 'hidden' : '';
    });
    // Persist the collapsed preference.
    effect(() => {
      try {
        localStorage.setItem(
          'sidebar-collapsed',
          this.sidebarCollapsed() ? '1' : '0',
        );
      } catch {
        // localStorage can throw in private mode — non-fatal.
      }
    });
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem('sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  }

  openSidebar() {
    this.sidebarOpen.set(true);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  toggleCollapsed() {
    this.sidebarCollapsed.update((v) => !v);
  }

  private navItems: NavItem[] = [
    { route: '/dashboard', label: 'Dashboard', icon: '⌂', exact: true },
    { route: '/schedule', label: 'My Schedule', icon: '◷' },
    { route: '/clients', label: 'Clients', icon: '◫' },
    { route: '/reports', label: 'Reports', icon: '◰' },
    { route: '/settings/working-hours', label: 'Settings', icon: '⚙' },
    { route: '/users', label: 'Users', icon: '◔', roles: ['root'] },
  ];

  visibleNavItems = computed(() => {
    const role = this.auth.role();
    return this.navItems.filter(
      (item) => !item.roles || (role && item.roles.includes(role)),
    );
  });

  roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? USER_ROLE_LABELS[role] : '';
  });

  initials() {
    const name = this.auth.user()?.name || '';
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  }
}
