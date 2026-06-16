/**
 * Roles del staff tal como viven en el enum `user_role` de la BD (tras el
 * rename de la migración 0002: 'owner'->'admin', 'professional'->'doctor').
 * El custom access token hook (0007) inyecta este valor como claim `user_role`.
 */
export type StaffRole = 'admin' | 'doctor' | 'reception';

/**
 * Contexto autenticado del staff, derivado del JWT de Supabase ya verificado.
 * `clinicId` y `role` provienen de los claims que inyecta el access token hook;
 * sin ellos el guard rechaza la request (no hay contexto de clínica).
 */
export interface AuthUser {
  /** `sub` del JWT — UUID del usuario en Supabase Auth. Actor de auditoría. */
  userId: string;
  /** `clinic_id` inyectado por el hook. Base del aislamiento multi-tenant. */
  clinicId: string;
  /** `user_role` inyectado por el hook (enum user_role de la BD). */
  role: StaffRole;
}
