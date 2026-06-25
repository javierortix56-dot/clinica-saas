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
    <div className="mx-auto max-w-[980px]">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-.02em] sm:text-[24px]">
          Aprobaciones
        </h1>
        <p className="mt-1 text-[13px] font-medium text-muted-foreground sm:text-[14px]">
          Solicitudes de turno pendientes de confirmación.
        </p>
      </div>

      <ApprovalsTable initialAppointments={appointments} />
    </div>
  );
}
