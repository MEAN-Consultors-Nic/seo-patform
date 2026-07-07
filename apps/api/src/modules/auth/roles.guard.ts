import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { INTERNAL_APP_ROLES, UserRole, normalizeRole } from '@seo/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  /** Optional: manager the strategist reports to. */
  managerId?: string;
}

// --- Role helpers ---------------------------------------------------------
//
// Prefer these over ad-hoc string comparisons. The precedence order is
// root > owner > admin > manager > strategist > client.

export function isRoot(role: UserRole | undefined): boolean {
  return role === 'root';
}

export function isOwner(role: UserRole | undefined): boolean {
  return role === 'root' || role === 'owner';
}

/** Anyone with platform-admin powers (users/packages/settings). */
export function isAdmin(role: UserRole | undefined): boolean {
  return role === 'root' || role === 'owner' || role === 'admin';
}

/** Anyone who can see the whole client roster (not scoped to their own). */
export function isManagerOrAbove(role: UserRole | undefined): boolean {
  return (
    role === 'root' ||
    role === 'owner' ||
    role === 'admin' ||
    role === 'manager'
  );
}

/**
 * @deprecated Use isManagerOrAbove. Kept temporarily for the legacy
 * clients.service.ts helper — will be swept out during Slice 1.1.
 */
export const isManager = isManagerOrAbove;

/** Owner-only capabilities (financials, revenue intel, etc.). */
export function canViewFinancials(role: UserRole | undefined): boolean {
  return role === 'root' || role === 'owner';
}

/** Roles allowed to administer users, packages, onboarding items. */
export function canAdministerPlatform(role: UserRole | undefined): boolean {
  return isAdmin(role);
}

/** Roles allowed to reassign clients between strategists in their scope. */
export function canManageTeam(role: UserRole | undefined): boolean {
  return isManagerOrAbove(role);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;

    // Normalize legacy role values (`seo-manager` / `seo-strategist`)
    // so JWTs issued before the migration keep working through their
    // natural expiry window.
    if (user?.role) {
      const normalized = normalizeRole(user.role);
      if (normalized) user.role = normalized;
    }

    // Every route requires an authenticated user (JwtAuthGuard runs
    // first). If the user is somehow a `client` role, block internal
    // routes here — the client portal has its own route namespace.
    if (user && !INTERNAL_APP_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'This account does not have access to the internal app.',
      );
    }

    if (!required || !required.length) return true;

    if (!user) throw new ForbiddenException('Not authenticated');
    // Normalize the required list too so a controller declaring
    // `@Roles('seo-manager')` still matches a user with role `manager`.
    const normalizedRequired = required
      .map((r) => normalizeRole(r) ?? r)
      .filter(Boolean);
    if (!normalizedRequired.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires one of: ${normalizedRequired.join(', ')}`,
      );
    }
    return true;
  }
}
