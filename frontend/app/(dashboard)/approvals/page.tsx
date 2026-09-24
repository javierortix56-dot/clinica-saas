import { getProposedAppointments } from "@/lib/supabase/server";
import { ApprovalsTable } from "./ApprovalsTable";

// Bandeja de solicitudes: todos los roles autenticados tienen acceso.
// El guard de sesión vive en middleware.ts.
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const appointments = await getProposedAppointments();

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-.02em] sm:text-[24px]">
          Solicitudes
        </h1>
        <p className="mt-1 text-[13px] font-medium text-muted-foreground sm:text-[14px]">
          Pedidos de turno que requieren tu decisión.
        </p>
      </div>

      <ApprovalsTable initialAppointments={appointments} now={Date.now()} />
    </div>
  );
}
