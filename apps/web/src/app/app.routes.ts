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
        path: 'settings/supervisor',
        canActivate: [roleGuard('root', 'seo-manager')],
        loadComponent: () =>
          import('./features/settings/supervisor-settings.component').then(
            (m) => m.SupervisorSettingsComponent,
          ),
      },
      {
        path: 'users',
        canActivate: [roleGuard('root')],
        loadComponent: () =>
          import('./features/users/users-list.component').then((m) => m.UsersListComponent),
      },
    ],
  },
];
