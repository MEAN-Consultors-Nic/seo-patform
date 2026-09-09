import { Route } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'set-password',
    loadComponent: () =>
      import('./features/auth/set-password.component').then(
        (m) => m.SetPasswordComponent,
      ),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    // Onboarding wizard is authenticated but lives outside the shell so
    // the sidebar doesn't distract from the first-run flow.
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then(
        (m) => m.OnboardingComponent,
      ),
  },
  {
    path: 'r/:token',
    loadComponent: () =>
      import('./features/public/public-report.component').then((m) => m.PublicReportComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./features/clients/clients-list.component').then((m) => m.ClientsListComponent),
      },
      {
        path: 'clients/new',
        loadComponent: () =>
          import('./features/clients/new-client-wizard.component').then((m) => m.NewClientWizardComponent),
      },
      {
        path: 'clients/:id',
        loadComponent: () =>
          import('./features/clients/client-detail.component').then((m) => m.ClientDetailComponent),
      },
      {
        path: 'clients/:id/edit',
        loadComponent: () =>
          import('./features/clients/edit/client-edit.component').then(
            (m) => m.ClientEditComponent,
          ),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/report-editor.component').then((m) => m.ReportEditorComponent),
      },
      {
        path: 'profile/integrations',
        loadComponent: () =>
          import('./features/profile/profile-integrations.component').then(
            (m) => m.ProfileIntegrationsComponent,
          ),
      },
      // Backwards-compat: old bookmarks + the OAuth callback that still
      // encodes the old path in its state land on the new page.
      {
        path: 'settings/integrations',
        redirectTo: 'profile/integrations',
        pathMatch: 'full',
      },
      {
        path: 'settings/report-layout',
        loadComponent: () =>
          import('./features/settings/report-layout-settings.component').then(
            (m) => m.ReportLayoutSettingsComponent,
          ),
      },
      {
        path: 'core/users',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/users/users-list.component').then((m) => m.UsersListComponent),
      },
      {
        path: 'users',
        redirectTo: 'core/users',
        pathMatch: 'full',
      },
      {
        path: 'settings/activity-log',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/settings/activity-log-settings.component').then(
            (m) => m.ActivityLogSettingsComponent,
          ),
      },
    ],
  },
];
