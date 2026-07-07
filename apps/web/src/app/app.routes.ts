import { Route } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'r/:token',
    loadComponent: () =>
      import('./features/public/public-report.component').then((m) => m.PublicReportComponent),
  },
  {
    path: 'supervisor',
    loadChildren: () =>
      import('./features/supervisor/supervisor.routes').then(
        (m) => m.supervisorRoutes,
      ),
  },
  {
    // Client-portal route namespace (Core Slice 1.5). Reserved so the
    // portal UI can land later without URL migrations. Renders a
    // "coming soon" placeholder until Phase 6+ ships the real portal.
    path: 'portal',
    loadComponent: () =>
      import('./features/portal/portal-placeholder.component').then(
        (m) => m.PortalPlaceholderComponent,
      ),
  },
  {
    path: 'portal/:token',
    loadComponent: () =>
      import('./features/portal/portal-placeholder.component').then(
        (m) => m.PortalPlaceholderComponent,
      ),
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
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/report-editor.component').then((m) => m.ReportEditorComponent),
      },
      {
        path: 'settings/working-hours',
        loadComponent: () =>
          import('./features/settings/working-hours-settings.component').then(
            (m) => m.WorkingHoursSettingsComponent,
          ),
      },
      {
        path: 'settings/integrations',
        loadComponent: () =>
          import('./features/settings/integrations.component').then(
            (m) => m.IntegrationsSettingsComponent,
          ),
      },
      {
        path: 'settings/report-layout',
        loadComponent: () =>
          import('./features/settings/report-layout-settings.component').then(
            (m) => m.ReportLayoutSettingsComponent,
          ),
      },
      {
        path: 'settings/packages',
        loadComponent: () =>
          import('./features/settings/packages-settings.component').then(
            (m) => m.PackagesSettingsComponent,
          ),
      },
      {
        path: 'settings/onboarding',
        loadComponent: () =>
          import('./features/settings/onboarding-settings.component').then(
            (m) => m.OnboardingSettingsComponent,
          ),
      },
      {
        path: 'settings/activity-log',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/settings/activity-log-settings.component').then(
            (m) => m.ActivityLogSettingsComponent,
          ),
      },
      {
        path: 'settings/supervisor',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/settings/supervisor-settings.component').then(
            (m) => m.SupervisorSettingsComponent,
          ),
      },
      {
        path: 'users',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/users/users-list.component').then((m) => m.UsersListComponent),
      },
    ],
  },
];
