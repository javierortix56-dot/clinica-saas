import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.interface';

/**
 * Inyecta el `AuthUser` que dejó `SupabaseJwtGuard` en `req.user`.
 * Usar solo en rutas protegidas por el guard (si no, será undefined).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    return req.user as AuthUser;
  },
);
