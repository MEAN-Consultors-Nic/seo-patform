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
    path: 'p/:token',
    loadComponent: () =>
      import('./features/public/public-proposal.component').then(
        (m) => m.PublicProposalComponent,
      ),
  },
  {
    path: 'q/:token',
    loadComponent: () =>
      import('./features/public/public-questionnaire.component').then(
        (m) => m.PublicQuestionnaireComponent,
      ),
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
        path: 'pipeline',
        loadComponent: () =>
          import('./features/sales/pipeline.component').then(
            (m) => m.SalesPipelineComponent,
          ),
      },
      {
        path: 'proposals',
        loadComponent: () =>
          import('./features/sales/proposals.component').then(
            (m) => m.SalesProposalsComponent,
          ),
      },
      {
        path: 'intake-hub',
        loadComponent: () =>
          import('./features/questionnaires/intake-hub.component').then(
            (m) => m.IntakeHubComponent,
          ),
      },
      {
        path: 'bulk-send',
        loadComponent: () =>
          import('./features/comms/bulk-send.component').then(
            (m) => m.BulkSendComponent,
          ),
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
      // Core: org-wide admin catalogs. Moved out of /settings/* because
      // Services / Packages / Users are administrative and global to
      // the platform, not per-operator config.
      {
        path: 'core/packages',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/settings/packages-settings.component').then(
            (m) => m.PackagesSettingsComponent,
          ),
      },
      {
        path: 'core/services',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/settings/services-settings.component').then(
            (m) => m.ServicesSettingsComponent,
          ),
      },
      {
        path: 'core/users',
        canActivate: [roleGuard('root', 'owner', 'admin')],
        loadComponent: () =>
          import('./features/users/users-list.component').then((m) => m.UsersListComponent),
      },
      // Backwards-compat redirects for old bookmarks + prior UI links.
      {
        path: 'settings/packages',
        redirectTo: 'core/packages',
        pathMatch: 'full',
      },
      {
        path: 'settings/services',
        redirectTo: 'core/services',
        pathMatch: 'full',
      },
      {
        path: 'users',
        redirectTo: 'core/users',
        pathMatch: 'full',
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
    ],
  },
];
