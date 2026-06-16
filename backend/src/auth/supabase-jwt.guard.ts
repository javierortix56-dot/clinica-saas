import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Request } from 'express';
import { AuthUser, StaffRole } from './auth-user.interface';

const VALID_ROLES: readonly StaffRole[] = ['admin', 'doctor', 'reception'];

/**
 * Verifica el JWT de Supabase Auth con criptografía asimétrica (JWKS).
 *
 * - La firma se valida contra las claves públicas de Supabase, expuestas en
 *   `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `createRemoteJWKSet`
 *   cachea las claves y rota automáticamente; no hay secreto compartido.
 * - Se exige `issuer` = `${SUPABASE_URL}/auth/v1` y `audience` = `authenticated`.
 * - De los claims se toman `sub`, `clinic_id` y `user_role`. Los dos últimos los
 *   inyecta el custom access token hook (migración 0007); si faltan, el token no
 *   tiene contexto de clínica y se rechaza (401).
 *
 * En éxito, adjunta el `AuthUser` a `req.user` para `@CurrentUser()` y el
 * `RolesGuard`.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseJwtGuard.name);
  private readonly jwks: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(config: ConfigService) {
    const supabaseUrl = config
      .getOrThrow<string>('SUPABASE_URL')
      .replace(/\/+$/, '');
    this.issuer = `${supabaseUrl}/auth/v1`;
    this.jwks = createRemoteJWKSet(
      new URL(`${this.issuer}/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('Falta el token de autenticación.');
    }

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
      });
      payload = result.payload as Record<string, unknown>;
    } catch (err) {
      // Detalle solo en el log del servidor; al cliente, mensaje genérico.
      this.logger.warn(`JWT inválido: ${(err as Error).message}`);
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    const user = this.toAuthUser(payload);
    (req as Request & { user?: AuthUser }).user = user;
    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header)) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }

  private toAuthUser(payload: Record<string, unknown>): AuthUser {
    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    const clinicId =
      typeof payload.clinic_id === 'string' ? payload.clinic_id : null;
    const role = payload.user_role;

    if (!userId) {
      throw new UnauthorizedException('Token sin identidad de usuario (sub).');
    }
    if (
      !clinicId ||
      typeof role !== 'string' ||
      !VALID_ROLES.includes(role as StaffRole)
    ) {
      // Faltan los claims del custom access token hook (¿no está activo?).
      throw new UnauthorizedException(
        'Token sin contexto de clínica. Verificá que el access token hook esté activo.',
      );
    }

    return { userId, clinicId, role: role as StaffRole };
  }
}
