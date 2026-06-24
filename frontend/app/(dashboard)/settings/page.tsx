import { redirect } from "next/navigation";

import {
  getSessionAuth,
  getClinicSettings,
  getTreatmentTypesWithPhases,
  getClinicSpecialties,
  getClinicSpecialtyFields,
} from "@/lib/supabase/server";
import { SettingsClient } from "./SettingsClient";
import { SpecialtiesManager } from "./SpecialtiesManager";
import { ensureSpecialtiesSeeded } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Configuraciones: exclusivas del dueño de la clínica.
  const { isOwner } = await getSessionAuth();
  if (!isOwner) {
    redirect("/approvals");
  }

  // Siembra las especialidades base la primera vez que el admin abre Ajustes.
  await ensureSpecialtiesSeeded();

  const [clinicSettings, treatmentTypes, specialties, customFields] =
    await Promise.all([
      getClinicSettings(),
      getTreatmentTypesWithPhases(),
      getClinicSpecialties(),
      getClinicSpecialtyFields(),
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

      <hr className="border-slate-200" />

      <SpecialtiesManager specialties={specialties} customFields={customFields} />
    </div>
  );
}
