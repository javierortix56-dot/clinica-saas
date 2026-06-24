import { redirect } from "next/navigation";

import { getSessionAuth, getClinicSettings, getTreatmentTypesWithPhases } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Configuraciones: exclusivas del dueño de la clínica.
  const { isOwner } = await getSessionAuth();
  if (!isOwner) {
    redirect("/approvals");
  }

  const [clinicSettings, treatmentTypes] = await Promise.all([
    getClinicSettings(),
    getTreatmentTypesWithPhases(),
  ]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-10">
      <div>
        <h1 className="text-[27px] font-extrabold tracking-[-.02em]">Ajustes</h1>
        <p className="mt-[9px] text-[14px] font-medium text-muted-foreground">
          Configuración de la clínica y parámetros clínicos.
        </p>
      </div>

      <SettingsClient
        clinicSettings={clinicSettings}
        treatmentTypes={treatmentTypes}
      />
    </div>
  );
}
