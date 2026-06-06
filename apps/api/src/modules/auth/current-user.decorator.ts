import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './roles.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return req.user;
  },
);
