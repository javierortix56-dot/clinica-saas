import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import {
  getPatientById,
  getAppointmentsByPatient,
  getClinicalNotes,
  getPatientTreatments,
  getPatientClinicalProfile,
  getProfessionalNoteConfig,
  getClinicSpecialties,
  getClinicSpecialtyFields,
  getSessionAuth,
} from "@/lib/supabase/server";
import { PatientTabs } from "../PatientTabs";
import { initialsOf } from "@/lib/utils";
import { EditPatientButton } from "../EditPatientButton";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeZone: "America/Argentina/Buenos_Aires",
});

const shortDateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
});


export default async function PatientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [
    { role },
    patient,
    appointments,
    notes,
    treatments,
    clinicalProfile,
    noteConfig,
    specialties,
    customSpecialtyFields,
  ] = await Promise.all([
    getSessionAuth(),
    getPatientById(params.id),
    getAppointmentsByPatient(params.id),
    getClinicalNotes(params.id),
    getPatientTreatments(params.id),
    getPatientClinicalProfile(params.id),
    getProfessionalNoteConfig(),
    getClinicSpecialties(),
    getClinicSpecialtyFields(),
  ]);

  if (!patient) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/patients"
        className="mb-[18px] flex items-center gap-[7px] text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        Volver a pacientes
      </Link>

      <div className="mb-[22px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-[15px]">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-[19px] font-extrabold text-white shadow-[0_6px_16px_rgba(37,99,235,.3)]">
            {initialsOf(patient.full_name)}
          </div>
          <div>
            <h1 className="text-[26px] font-extrabold tracking-[-.02em]">
              {patient.full_name}
            </h1>
            <div className="mt-2 flex items-center gap-[10px]">
              <span className="font-mono text-[13.5px] text-muted-foreground">
                {patient.national_id}
              </span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="text-[13.5px] font-medium text-muted-foreground">
                Activo desde {shortDateFormatter.format(new Date(patient.created_at))}
              </span>
            </div>
          </div>
        </div>
        <EditPatientButton patient={patient} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-x-10 gap-y-5 rounded-card border border-border bg-white px-6 py-[22px] shadow-card-soft sm:grid-cols-2">
        <div>
          <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">
            DNI / ID
          </div>
          <div className="font-mono text-[15px] font-semibold text-slate-800">
            {patient.national_id}
          </div>
        </div>
        <div>
          <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">
            Teléfono
          </div>
          <div className="font-mono text-[15px] font-semibold text-slate-800">
            {patient.phone ?? "—"}
          </div>
        </div>
        <div>
          <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">
            Email
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-slate-800">
            <span>{patient.email ?? "—"}</span>
            {patient.email ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Portal activo
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                Sin acceso al portal
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">
            Fecha de alta
          </div>
          <div className="text-[15px] font-medium text-slate-800">
            {dateFormatter.format(new Date(patient.created_at))}
          </div>
        </div>
      </div>

      <PatientTabs
        patientId={params.id}
        appointments={appointments}
        notes={notes}
        treatments={treatments}
        role={role}
        clinicalProfile={clinicalProfile}
        noteConfig={noteConfig ?? {}}
        specialties={specialties}
        customSpecialtyFields={customSpecialtyFields}
      />
    </div>
  );
}
