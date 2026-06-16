// TODO: bandeja de aprobaciones — turnos en estado `proposed` esperando confirmación.
// Accesible solo para roles: admin, reception.
// Polling manual (botón "Actualizar"). Sin Realtime por ahora.
// Confirmar turno vía POST /appointments/:id/confirm (endpoint NestJS — Phase 9).
export default function ApprovalsPage() {
  return <div>Aprobaciones pendientes</div>;
}
