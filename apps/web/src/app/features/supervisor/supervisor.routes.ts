import { Route } from '@angular/router';
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SupervisorService } from '../../core/supervisor.service';

/**
 * Lightweight gate that pushes the supervisor back to the PIN entry
 * page whenever their token is missing or expired. Reused on every
 * protected child route under /supervisor.
 */
const supervisorAuthGuard: CanActivateFn = () => {
  const svc = inject(SupervisorService);
  const router = inject(Router);
  if (svc.isAuthenticated()) return true;
  router.navigate(['/supervisor']);
  return false;
};

export const supervisorRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./supervisor-auth.component').then((m) => m.SupervisorAuthComponent),
  },
  {
    path: 'clients',
    canActivate: [supervisorAuthGuard],
    loadComponent: () =>
      import('./supervisor-clients.component').then(
        (m) => m.SupervisorClientsComponent,
      ),
  },
  {
    path: 'clients/:clientId',
    canActivate: [supervisorAuthGuard],
    loadComponent: () =>
      import('./supervisor-cycles.component').then(
        (m) => m.SupervisorCyclesComponent,
      ),
  },
  {
    path: 'clients/:clientId/cycles/:cycleId',
    canActivate: [supervisorAuthGuard],
    loadComponent: () =>
      import('./supervisor-dashboard.component').then(
        (m) => m.SupervisorDashboardComponent,
      ),
  },
];
