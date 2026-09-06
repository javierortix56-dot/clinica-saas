import { redirect } from "next/navigation";
import Link from "next/link";

import {
  getSessionAuth,
  isDoctorRole,
  getClinicSettings,
  getTreatmentTypesWithPhases,
  getClinicSpecialties,
  getClinicSpecialtyFields,
  getProfessionalNoteConfig,
} from "@/lib/supabase/server";
import { SettingsClient } from "./SettingsClient";
import { SpecialtiesManager } from "./SpecialtiesManager";
import { ClinicalFieldsConfig } from "./ClinicalFieldsConfig";
import {
  SPECIALTY_PRESETS,
  presetToSpecialty,
  SPECIALTY_FIELD_DEFS,
  type SpecialtyFieldDef,
} from "../patients/clinical-fields";
import { ensureSpecialtiesSeeded } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { isOwner, role } = await getSessionAuth();
  const isDoctor = isDoctorRole(role);

  // La config de la clínica es del dueño; los campos de historia clínica son de
  // cada profesional. Un doctor no-dueño entra solo por su sección de campos.
  if (!isOwner && !isDoctor) {
    redirect("/approvals");
  }

  // Siembra las especialidades base la primera vez que se abre Ajustes.
  await ensureSpecialtiesSeeded();

  const [clinicSettings, treatmentTypes, specialties, customFields, noteConfig] =
    await Promise.all([
      isOwner ? getClinicSettings() : Promise.resolve(null),
      isOwner ? getTreatmentTypesWithPhases() : Promise.resolve([]),
      getClinicSpecialties(),
      getClinicSpecialtyFields(),
      isDoctor ? getProfessionalNoteConfig() : Promise.resolve(null),
    ]);

  // Especialidades para el selector de campos: las de la clínica o, si aún no se
  // sembraron, los presets estáticos de fallback.
  const specialtyList = specialties.length
    ? specialties
    : SPECIALTY_PRESETS.map(presetToSpecialty);
  // Catálogo de campos = base + los propios de la clínica (clinic_specialty_fields).
  const specialtyFieldDefs: SpecialtyFieldDef[] = [
    ...SPECIALTY_FIELD_DEFS,
    ...customFields.map((f) => ({
      key: f.key,
      label: f.label,
      placeholder: f.placeholder,
    })),
  ];

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-10">
      <div>
        <h1 className="text-[27px] font-extrabold tracking-[-.02em]">Mi consultorio</h1>
        <p className="mt-[9px] text-[14px] font-medium text-muted-foreground">
          {isOwner
            ? "Horarios, tipos de consulta y configuración de tu práctica."
            : "Configuración de tus campos de la historia clínica."}
        </p>
      </div>

      {/* Config de campos de la historia clínica — para cualquier profesional. */}
      {isDoctor && noteConfig && (
        <ClinicalFieldsConfig
          config={noteConfig}
          specialties={specialtyList}
          specialtyFieldDefs={specialtyFieldDefs}
        />
      )}

      {/* Config de la clínica y especialidades — exclusivo del dueño. */}
      {isOwner && (
        <>
          <section className="rounded-card border border-border bg-white p-5 shadow-card-soft">
            <h2 className="text-lg font-semibold tracking-tight">Horarios e integraciones</h2>
            <p className="mt-1 text-sm text-muted-foreground">Configura tu disponibilidad y la conexión con Google Calendar.</p>
            <Link href="/staff" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
              Configurar agenda personal
            </Link>
          </section>

          {isDoctor && noteConfig && <hr className="border-slate-200" />}

          <SettingsClient
            clinicSettings={clinicSettings}
            treatmentTypes={treatmentTypes}
          />

          <hr className="border-slate-200" />

          <SpecialtiesManager specialties={specialties} customFields={customFields} />
        </>
      )}
    </div>
  );
}
