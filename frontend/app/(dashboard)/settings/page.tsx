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
  getProfessionalsNoteConfigs,
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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { isOwner, role } = await getSessionAuth();
  const isDoctor = isDoctorRole(role);

  // La config de la clínica es del dueño; los campos de historia clínica son de
  // cada profesional. Un doctor no-dueño entra solo por su sección de campos.
  if (!isOwner && !isDoctor) {
    redirect("/approvals");
  }

  // Siembra las especialidades base la primera vez que se abre Ajustes.
  await ensureSpecialtiesSeeded();

  const [
    clinicSettings,
    treatmentTypes,
    specialties,
    customFields,
    noteConfig,
    professionalConfigs,
  ] = await Promise.all([
    isOwner ? getClinicSettings() : Promise.resolve(null),
    isOwner ? getTreatmentTypesWithPhases() : Promise.resolve([]),
    getClinicSpecialties(),
    getClinicSpecialtyFields(),
    isDoctor ? getProfessionalNoteConfig() : Promise.resolve(null),
    // El dueño configura la planilla de CADA médico; un doctor no-dueño solo la suya.
    isOwner ? getProfessionalsNoteConfigs() : Promise.resolve([]),
  ]);

  // ?profesional=<id> — de quién se está editando la planilla. Default: el primero.
  const selectedProfessionalId =
    typeof searchParams.profesional === "string" ? searchParams.profesional : null;
  const selectedProfessional =
    professionalConfigs.find((p) => p.professional_id === selectedProfessionalId) ??
    professionalConfigs[0] ??
    null;

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

      {/* Planilla de campos clínicos.
          El dueño elige a qué médico se la asigna; un doctor no-dueño edita la
          suya. Antes esta sección solo aparecía si el usuario logueado era
          doctor, así que un dueño con rol admin no podía configurar a nadie. */}
      {isOwner && selectedProfessional ? (
        <div className="space-y-4">
          {professionalConfigs.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[.05em] text-slate-400">
                Planilla de
              </p>
              <div className="flex flex-wrap gap-2">
                {professionalConfigs.map((p) => {
                  const active = p.professional_id === selectedProfessional.professional_id;
                  return (
                    <Link
                      key={p.professional_id}
                      href={`/settings?profesional=${p.professional_id}`}
                      scroll={false}
                      className={`rounded-[10px] border px-3 py-[7px] text-[13px] font-bold transition ${
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {p.full_name}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          <ClinicalFieldsConfig
            key={selectedProfessional.professional_id}
            config={selectedProfessional.note_field_config}
            professionalId={selectedProfessional.professional_id}
            professionalName={selectedProfessional.full_name}
            specialties={specialtyList}
            specialtyFieldDefs={specialtyFieldDefs}
          />
        </div>
      ) : isDoctor && noteConfig ? (
        <ClinicalFieldsConfig
          config={noteConfig}
          specialties={specialtyList}
          specialtyFieldDefs={specialtyFieldDefs}
        />
      ) : null}

      {/* Config de la clínica y especialidades — exclusivo del dueño. */}
      {isOwner && (
        <>
          <section className="rounded-card border border-border bg-white p-5 shadow-card-soft">
            <h2 className="text-lg font-semibold tracking-tight">
              Equipo y horarios
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Disponibilidad semanal, miembros del consultorio y conexión con
              Google Calendar.
            </p>
            <Link
              href="/staff"
              className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-[1.07]"
            >
              Configurar horarios
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
