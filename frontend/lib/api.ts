// Wrapper de fetch hacia los endpoints NestJS.
// Los endpoints de turnos (POST /appointments, POST /appointments/:id/confirm)
// son a implementar en Phase 9 — no existen todavía.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// TODO: implementar en Phase 9
export async function confirmAppointment(_id: string, _token: string) {
  // POST /appointments/:id/confirm
  throw new Error("Not implemented");
}
