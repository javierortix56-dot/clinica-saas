import {
  getProposedAppointments,
  type ProposedAppointment,
} from "@/lib/supabase/server";
import { ApprovalsTable } from "./ApprovalsTable";

// Bandeja de aprobaciones: todos los roles autenticados tienen acceso.
// El guard de sesión vive en middleware.ts.
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
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
