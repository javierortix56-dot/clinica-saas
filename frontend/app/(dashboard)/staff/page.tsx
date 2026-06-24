import { redirect } from "next/navigation";

import { getSessionAuth, getStaffMembers } from "@/lib/supabase/server";
import { StaffTable } from "./StaffTable";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  // Gestión de equipo: exclusiva del dueño de la clínica.
  const { isOwner } = await getSessionAuth();
  if (!isOwner) {
    redirect("/approvals");
  }

  const members = await getStaffMembers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
        <p className="text-sm text-muted-foreground">
          Miembros del staff y horarios de disponibilidad.
        </p>
      </div>

      <StaffTable members={members} />
    </div>
  );
}
