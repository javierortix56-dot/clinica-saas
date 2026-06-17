import { redirect } from "next/navigation";

import {
  getProposedAppointments,
  getSessionAuth,
  isDoctorRole,
} from "@/lib/supabase/server";
import { ApprovalsTable } from "./ApprovalsTable";

// Bandeja de aprobaciones: turnos en estado `proposed` esperando confirmación
// del staff. Server Component — datos frescos en cada request (sin cache).
// La actualización en tiempo real la maneja ApprovalsTable (Realtime).
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  // Guard de rol: la bandeja es solo para admin/reception. El doctor va a /calendar.
  const { role } = await getSessionAuth();
  if (isDoctorRole(role)) {
    redirect("/calendar");
  }

  const appointments = await getProposedAppointments();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Aprobaciones pendientes
        </h1>
        <p className="text-sm text-muted-foreground">
          Turnos propuestos por el asistente esperando confirmación.
        </p>
      </div>

      <ApprovalsTable initialAppointments={appointments} />
    </div>
  );
}
