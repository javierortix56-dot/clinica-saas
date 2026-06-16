// DTOs para los endpoints NestJS de escritura de turnos.
// A implementar en Phase 9 — los endpoints no existen todavía.

// POST /appointments
export interface CreateAppointmentRequest {
  // TODO: definir campos en Phase 9
}
export interface CreateAppointmentResponse {
  // TODO
}

// POST /appointments/:id/confirm
// El id del turno viaja en la URL; no hay body. Auth: Bearer JWT de Supabase
// (roles admin | reception). Idempotente: confirmar un turno ya confirmado
// devuelve 200 con el mismo turno.
export type ConfirmAppointmentRequest = Record<string, never>;

export interface ConfirmAppointmentResponse {
  id: string;
  status: string;
  start_at: string; // ISO-8601
  end_at: string; // ISO-8601
}
