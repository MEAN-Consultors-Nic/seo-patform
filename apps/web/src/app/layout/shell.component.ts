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
    <div class="flex flex-col h-screen overflow-hidden bg-ink-50">
      <!-- Top app header. Replaces the old left sidebar entirely so the
           client detail's internal sidebar stops competing for horizontal
           space. Logo + primary nav on the left, quick actions + user
           identity on the right. -->
      <header class="bg-white border-b border-ink-200 shadow-sm z-30">
        <!-- Inner container mirrors .page-container's max-w-7xl + horizontal
             padding so the header chrome lines up with the page content
             underneath. The header BACKGROUND remains full-width so the
             bar still spans the viewport visually. -->
        <div class="max-w-7xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 h-14">
          <!-- Brand + primary nav -->
          <div class="flex items-center gap-6 min-w-0">
            <a routerLink="/dashboard" class="flex items-center gap-2.5 flex-shrink-0">
              <div class="w-8 h-8 rounded-md bg-brand-500 text-white flex items-center justify-center font-bold text-sm">
                IT
              </div>
              <div class="hidden sm:block leading-none">
                <div class="text-sm font-bold text-ink-900">Internal Tools</div>
                <div class="text-[9px] text-ink-500 mt-0.5 uppercase tracking-wider">Media Spearhead</div>
              </div>
            </a>

            <nav class="hidden md:flex items-center gap-0.5">
              @for (item of visibleNavItems(); track item.route) {
                <a [routerLink]="item.route"
                   routerLinkActive="!text-brand-700 !bg-brand-500/10"
                   [routerLinkActiveOptions]="{ exact: item.exact || false }"
                   class="px-3 py-1.5 rounded-md text-sm font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors">
                  {{ item.label }}
                </a>
              }
            </nav>
          </div>

          <!-- Quick actions + user. Mobile hamburger lives here so the
               right-side spacing of the header doesn't shift between
               breakpoints. -->
          <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <div class="hidden md:flex items-center gap-1.5">
              <app-domain-info-button
                label="Domain info"
                buttonClass="h-8 text-xs font-semibold px-2.5 sm:px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition" />
              <app-schema-modeler-button
                label="Schema Modeler"
                buttonClass="h-8 text-xs font-semibold px-2.5 sm:px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition" />
            </div>

            <!-- User identity. Avatar opens a dropdown with role + sign
                 out so the header stays tight without leaking secondary
                 chrome. -->
            <div class="hidden md:block relative">
              <button type="button" (click)="toggleUserMenu($event)"
                      class="flex items-center gap-2 pl-2 py-1 rounded-md hover:bg-ink-50 transition-colors">
                <div class="w-8 h-8 rounded-full bg-ink-200 flex items-center justify-center text-xs font-bold text-ink-700">
                  {{ initials() }}
                </div>
                <div class="text-left leading-tight pr-1">
                  <div class="text-xs font-semibold text-ink-900 max-w-[120px] truncate">{{ auth.user()?.name || 'User' }}</div>
                  <div class="text-[10px] text-ink-500">{{ roleLabel() }}</div>
                </div>
                <span class="text-[10px] text-ink-400 leading-none pr-1">▾</span>
              </button>
              @if (userMenuOpen()) {
                <div
                  class="absolute right-0 top-full mt-1 bg-white border border-ink-200 rounded-md shadow-lg py-1 min-w-[180px] z-40"
                  (click)="$event.stopPropagation()">
                  <button type="button"
                          (click)="auth.logout(); userMenuOpen.set(false)"
                          class="w-full text-left px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-50 hover:text-danger-500 inline-flex items-center gap-2">
                    <span>⏻</span>
                    <span>Sign out</span>
                  </button>
                </div>
              }
            </div>

            <button type="button"
                    class="md:hidden w-9 h-9 rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 flex items-center justify-center"
                    (click)="toggleMobileMenu()"
                    aria-label="Open menu">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 4h12M2 8h12M2 12h12" stroke-linecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Mobile menu panel — slides down underneath the header. Includes
             nav items, quick actions and the user / sign-out row stacked
             vertically so everything's reachable in one place. -->
        @if (mobileMenuOpen()) {
          <div class="md:hidden border-t border-ink-200 bg-white">
            <div class="max-w-7xl mx-auto">
              <nav class="px-4 sm:px-6 py-2 space-y-0.5">
                @for (item of visibleNavItems(); track item.route) {
                  <a [routerLink]="item.route"
                     routerLinkActive="!text-brand-700 !bg-brand-500/10"
                     [routerLinkActiveOptions]="{ exact: item.exact || false }"
                     class="block px-3 py-2 rounded-md text-sm font-medium text-ink-700 hover:bg-ink-100 hover:text-ink-900">
                    {{ item.label }}
                  </a>
                }
              </nav>
              <div class="border-t border-ink-200 px-4 sm:px-6 py-2 flex flex-wrap gap-2">
                <app-domain-info-button
                  label="Domain info"
                  buttonClass="h-8 text-xs font-semibold px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition" />
                <app-schema-modeler-button
                  label="Schema Modeler"
                  buttonClass="h-8 text-xs font-semibold px-3 rounded-md border border-ink-200 text-ink-700 hover:border-ink-300 hover:bg-ink-50 inline-flex items-center gap-1.5 transition" />
              </div>
              <div class="border-t border-ink-200 px-4 sm:px-6 py-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-ink-200 flex items-center justify-center text-xs font-bold text-ink-700">
                    {{ initials() }}
                  </div>
                  <div class="leading-tight">
                    <div class="text-xs font-semibold text-ink-900">{{ auth.user()?.name || 'User' }}</div>
                    <div class="text-[10px] text-ink-500">{{ roleLabel() }}</div>
                  </div>
                </div>
                <button (click)="auth.logout()"
                        class="text-ink-500 hover:text-danger-500 text-sm inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-ink-50">
                  <span>⏻</span>
                  <span class="text-xs font-semibold">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        }
      </header>

      <main class="flex-1 overflow-y-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  protected auth = inject(AuthService);
  private router = inject(Router);

  mobileMenuOpen = signal(false);
  userMenuOpen = signal(false);

  constructor() {
    // Auto-close any open menu when the user navigates so the panel
    // doesn't linger over the new page after a click.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.mobileMenuOpen.set(false);
        this.userMenuOpen.set(false);
      });
    // Lock body scroll while the mobile menu is open.
    effect(() => {
      const open = this.mobileMenuOpen();
      document.body.style.overflow = open ? 'hidden' : '';
    });
    // Close the user menu when clicking anywhere outside it. Cheap and
    // avoids tracking refs to the trigger button.
    document.addEventListener('click', () => {
      if (this.userMenuOpen()) this.userMenuOpen.set(false);
    });
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update((v) => !v);
  }

  toggleUserMenu(ev: MouseEvent) {
    ev.stopPropagation();
    this.userMenuOpen.update((v) => !v);
  }

  /**
   * Top-level navigation grouped by module. Order reflects the
   * modularization laid out in the Phase 2 roadmap:
   *
   *   Dashboard    — landing / cross-module summary
   *   Clients      — client roster + CRUD (spans Clients + SEO tabs
   *                  inside a single client detail page for now).
   *   Reports      — report editor + share.
   *   Settings     — platform admin (users are surfaced from within
   *                  Settings via a sub-tab once the restructure of
   *                  the Users page under Core lands).
   *
   * Users stays as its own top-level entry for root only during the
   * transition; the plan is to fold it into Settings -> Users in the
   * Core UI slice later.
   */
  private navItems: NavItem[] = [
    { route: '/dashboard', label: 'Dashboard', exact: true },
    { route: '/clients', label: 'Clients' },
    { route: '/reports', label: 'Reports' },
    { route: '/settings/working-hours', label: 'Settings' },
    {
      route: '/users',
      label: 'Users',
      roles: ['root', 'owner', 'admin'],
    },
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
    return (
      name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?'
    );
  }
}
