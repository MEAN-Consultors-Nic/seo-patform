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
        path: 'schedule',
        loadComponent: () =>
          import('./features/schedule/schedule.component').then((m) => m.ScheduleComponent),
      },
      {
        path: 'settings/working-hours',
        loadComponent: () =>
          import('./features/settings/working-hours-settings.component').then(
            (m) => m.WorkingHoursSettingsComponent,
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
