import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * Marker for endpoints under /supervisor that don't need a valid
 * supervisor session (e.g. the PIN-entry endpoint itself).
 */
export const IS_SUPERVISOR_PUBLIC = 'isSupervisorPublic';
export const SupervisorPublic = () => SetMetadata(IS_SUPERVISOR_PUBLIC, true);

export interface SupervisorPrincipal {
  /** Discriminator so handlers can be sure this is a supervisor token. */
  kind: 'supervisor';
  /** Id of the registered Supervisor doc — used for audit + lastSeen updates. */
  supervisorId: string;
  /** Human-readable name carried in the JWT so handlers can stamp comments. */
  name: string;
}

/**
 * Validates the supervisor JWT (issued by SupervisorAuthService) sitting in
 * the Authorization header as `Bearer <token>`. Tokens are signed with a
 * dedicated audience claim so they can't be confused with regular user
 * tokens — a leaked supervisor JWT can never authenticate as a real user.
 */
@Injectable()
export class SupervisorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_SUPERVISOR_PUBLIC,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      supervisor?: SupervisorPrincipal;
    }>();
    const auth = req.headers['authorization'] || req.headers['Authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing supervisor token');
    }
    const token = auth.slice(7).trim();
    try {
      const payload = this.jwt.verify<{
        sub: string;
        aud: string;
        kind?: string;
        name?: string;
      }>(token, {
        secret:
          this.config.get<string>('JWT_SECRET') || 'dev-secret-change-me',
        audience: 'supervisor',
      });
      if (payload.kind !== 'supervisor') {
        throw new UnauthorizedException('Token is not a supervisor token');
      }
      req.supervisor = {
        kind: 'supervisor',
        supervisorId: payload.sub,
        name: payload.name || 'Supervisor',
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired supervisor token');
    }
  }
}
