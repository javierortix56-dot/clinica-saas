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
import { TreatmentTypesSection } from "./TreatmentTypesSection";
import { ClinicSettingsForm } from "./ClinicSettingsForm";
import { SpecialtiesManager } from "./SpecialtiesManager";
import { ClinicalFieldsConfig } from "./ClinicalFieldsConfig";
import {
  SPECIALTY_PRESETS,
  presetToSpecialty,
  SPECIALTY_FIELD_DEFS,
  type SpecialtyFieldDef,
} from "../patients/clinical-fields";
import { ensureSpecialtiesSeeded } from "./actions";
import { HOME_PATH } from "@/lib/routes";

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
    redirect(HOME_PATH);
  }

  const [
    clinicSettings,
    treatmentTypes,
    loadedSpecialties,
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

  // Siembra las especialidades base solo la primera vez (clínica sin ninguna):
  // antes corría en cada visita, con dos consultas en serie antes de cargar.
  let specialties = loadedSpecialties;
  if (isOwner && specialties.length === 0) {
    const seeded = await ensureSpecialtiesSeeded();
    if (seeded.seeded) specialties = await getClinicSpecialties();
  }

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

  const hasClinicalFields = (isOwner && !!selectedProfessional) || (isDoctor && !!noteConfig);
  const sections = [
    ...(isOwner
      ? [
          { id: "datos", label: "Datos generales" },
          { id: "equipo", label: "Equipo y horarios" },
          { id: "tipos", label: "Tipos de consulta" },
        ]
      : []),
    ...(hasClinicalFields ? [{ id: "historia", label: "Historia clínica" }] : []),
    ...(isOwner ? [{ id: "avanzado", label: "Opciones avanzadas" }] : []),
  ];

  const sectionTitle = "text-lg font-semibold tracking-tight";

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-8">
      <div>
        <h1 className="text-[27px] font-extrabold tracking-[-.02em]">Mi consultorio</h1>
        <p className="mt-[9px] text-[14px] font-medium text-muted-foreground">
          {isOwner
            ? "Datos del consultorio, equipo, tipos de consulta y planillas clínicas."
            : "Configuración de tus campos de la historia clínica."}
        </p>
        {sections.length > 1 && (
          <nav aria-label="Secciones de Mi consultorio" className="mt-4 flex flex-wrap gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-border bg-white px-3 py-[6px] text-[12.5px] font-semibold text-slate-600 transition hover:border-primary/40 hover:text-primary"
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      {isOwner && (
        <>
          <section id="datos" className="scroll-mt-4 flex flex-col gap-4">
            <h2 className={sectionTitle}>Datos generales</h2>
            <div className="rounded-card border border-border bg-white p-5 shadow-card-soft">
              {clinicSettings ? (
                <ClinicSettingsForm settings={clinicSettings} />
              ) : (
                <p className="text-sm text-muted-foreground">No se pudo cargar la configuración.</p>
              )}
            </div>
          </section>

          <section
            id="equipo"
            className="scroll-mt-4 flex flex-wrap items-center justify-between gap-4 rounded-card border border-border bg-white p-5 shadow-card-soft"
          >
            <div>
              <h2 className={sectionTitle}>Equipo y horarios</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Miembros del consultorio, disponibilidad semanal y conexión con Google Calendar.
              </p>
            </div>
            <Link
              href="/staff"
              className="inline-flex shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-[1.07]"
            >
              Gestionar equipo
            </Link>
          </section>

          <section id="tipos" className="scroll-mt-4 flex flex-col gap-4">
            <h2 className={sectionTitle}>Tipos de consulta y procedimientos</h2>
            <TreatmentTypesSection treatmentTypes={treatmentTypes} />
          </section>
        </>
      )}

      {/* Planilla de campos clínicos.
          El dueño elige a qué médico se la asigna; un doctor no-dueño edita la
          suya. */}
      {isOwner && selectedProfessional ? (
        <div id="historia" className="scroll-mt-4 space-y-4">
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
        <div id="historia" className="scroll-mt-4">
          <ClinicalFieldsConfig
            config={noteConfig}
            specialties={specialtyList}
            specialtyFieldDefs={specialtyFieldDefs}
          />
        </div>
      ) : null}

      {/* Plantillas de especialidades: se configuran una vez; quedan plegadas. */}
      {isOwner && (
        <details
          id="avanzado"
          className="scroll-mt-4 rounded-card border border-border bg-white shadow-card-soft"
        >
          <summary className="cursor-pointer select-none px-5 py-4 text-[15px] font-semibold text-slate-800 marker:text-slate-400">
            Opciones avanzadas: especialidades y campos clínicos propios
          </summary>
          <div className="border-t border-slate-100 p-5">
            <SpecialtiesManager specialties={specialties} customFields={customFields} />
          </div>
        </details>
      )}
    </div>
  );
}
