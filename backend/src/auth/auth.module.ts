import { Module } from '@nestjs/common';
import { SupabaseJwtGuard } from './supabase-jwt.guard';
import { SupabasePatientGuard } from './supabase-patient.guard';
import { RolesGuard } from './roles.guard';

/**
 * AuthModule — guards de autenticación/autorización del staff.
 * Verifica el JWT de Supabase (JWKS) y autoriza por rol. Los exporta para que
 * los módulos de dominio (p.ej. AppointmentsModule) los usen con `@UseGuards`.
 */
@Module({
  providers: [SupabaseJwtGuard, SupabasePatientGuard, RolesGuard],
  exports: [SupabaseJwtGuard, SupabasePatientGuard, RolesGuard],
})
export class AuthModule {}
