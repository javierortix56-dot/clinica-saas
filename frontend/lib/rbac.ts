import type { StaffRole } from "@clinica/shared";

// TODO: implementar helpers de autorización por rol.
// El rol viene del claim `user_role` en el JWT de Supabase Auth
// (inyectado por el Custom Access Token Hook de Phase 9).

export function canAccessApprovals(role: StaffRole): boolean {
  return role === "admin" || role === "reception";
}

export function canManageClinic(role: StaffRole): boolean {
  return role === "admin";
}
