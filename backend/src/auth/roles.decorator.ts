import { SetMetadata } from '@nestjs/common';
import type { StaffRole } from './auth-user.interface';

export const ROLES_KEY = 'roles';

/**
 * Restringe un handler/controlador a los roles indicados. Lo evalúa el
 * `RolesGuard`, que debe correr DESPUÉS del `SupabaseJwtGuard` (necesita
 * `req.user` ya seteado).
 */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);
