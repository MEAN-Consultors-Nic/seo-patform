import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { USER_ROLE_LABELS, UserRole } from '@seo/shared';
import { AuthService } from '../core/auth.service';

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
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="flex h-screen overflow-hidden bg-ink-50">
      <!-- Sidebar -->
      <aside class="w-60 bg-white border-r border-ink-200 flex flex-col flex-shrink-0">
        <div class="px-5 py-4 border-b border-ink-200">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-md bg-brand-500 text-white flex items-center justify-center font-bold text-sm">
              S
            </div>
            <div>
              <div class="text-sm font-bold text-ink-900 leading-none">SEO Platform</div>
              <div class="text-[10px] text-ink-500 mt-0.5 uppercase tracking-wider">Media Spearhead</div>
            </div>
          </div>
        </div>

        <nav class="flex-1 px-3 py-3 space-y-0.5">
          @for (item of visibleNavItems(); track item.route) {
            <a [routerLink]="item.route"
               routerLinkActive="!bg-brand-50 !text-brand-700 !border-l-brand-500"
               [routerLinkActiveOptions]="{ exact: item.exact || false }"
               class="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-ink-600 border-l-2 border-l-transparent hover:bg-ink-50 hover:text-ink-900 transition-colors">
              <span class="text-base leading-none w-4 text-center">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="border-t border-ink-200 px-3 py-3">
          <div class="flex items-center gap-2.5 px-2 py-2 rounded-md">
            <div class="w-8 h-8 rounded-full bg-ink-200 flex items-center justify-center text-xs font-bold text-ink-700">
              {{ initials() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-ink-900 truncate">{{ auth.user()?.name || 'User' }}</div>
              <div class="text-[10px] text-ink-500 truncate">{{ roleLabel() }}</div>
            </div>
            <button (click)="auth.logout()"
                    class="text-ink-400 hover:text-danger-500 transition-colors text-base leading-none"
                    title="Sign out">
              ⏻
            </button>
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 overflow-y-auto">
        <router-outlet />
      </main>
    </div>
  `,
})
export class ShellComponent {
  protected auth = inject(AuthService);

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
