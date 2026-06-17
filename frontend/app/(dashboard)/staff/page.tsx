import { redirect } from "next/navigation";

import { getSessionAuth, isDoctorRole, getStaffMembers } from "@/lib/supabase/server";
import { StaffTable } from "./StaffTable";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const { role } = await getSessionAuth();
  if (isDoctorRole(role)) {
    redirect("/calendar");
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
