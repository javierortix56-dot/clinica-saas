import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import type { AuthUser, StaffRole } from './auth-user.interface';

/**
 * Autoriza por rol según `@Roles(...)`. Requiere que `SupabaseJwtGuard` haya
 * corrido antes y dejado `req.user`. Sin `@Roles` en el handler, no restringe.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('No tenés permiso para esta acción.');
    }
    return true;
  }
}
