import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PatientUser } from './patient-user.interface';

/**
 * Inyecta el `PatientUser` que dejó `SupabasePatientGuard` en `req.patient`.
 * Usar solo en rutas protegidas por ese guard (si no, será undefined).
 */
export const CurrentPatient = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PatientUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { patient?: PatientUser }>();
    return req.patient as PatientUser;
  },
);
