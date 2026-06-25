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
import { PatientUser } from './patient-user.interface';

/**
 * Verifica el JWT de Supabase de un paciente del portal (misma criptografía
 * asimétrica que `SupabaseJwtGuard`: firma contra JWKS, issuer y audience).
 *
 * A diferencia del guard del staff, exige el claim `patient_id` (lo inyecta el
 * custom access token hook para usuarios paciente, migración 0009). Un token de
 * staff —sin `patient_id`— se rechaza con 401. En éxito adjunta el `PatientUser`
 * a `req.patient` para `@CurrentPatient()`.
 */
@Injectable()
export class SupabasePatientGuard implements CanActivate {
  private readonly logger = new Logger(SupabasePatientGuard.name);
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
      this.logger.warn(`JWT de paciente inválido: ${(err as Error).message}`);
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    const patientId =
      typeof payload.patient_id === 'string' ? payload.patient_id : null;

    if (!userId) {
      throw new UnauthorizedException('Token sin identidad de usuario (sub).');
    }
    if (!patientId) {
      throw new UnauthorizedException('Token sin contexto de paciente.');
    }

    (req as Request & { patient?: PatientUser }).patient = { userId, patientId };
    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header)) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
