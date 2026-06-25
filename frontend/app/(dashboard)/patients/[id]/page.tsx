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
        className="mb-3 flex items-center gap-[7px] text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary sm:mb-[18px]"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        Volver a pacientes
      </Link>

      <div className="mb-4 flex items-start justify-between gap-3 sm:mb-[22px] sm:items-center">
        <div className="flex min-w-0 items-center gap-3 sm:gap-[15px]">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-[15px] font-extrabold text-white shadow-[0_6px_16px_rgba(37,99,235,.3)] sm:h-14 sm:w-14 sm:rounded-2xl sm:text-[19px]">
            {initialsOf(patient.full_name)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[21px] font-extrabold tracking-[-.02em] sm:text-[26px]">
              {patient.full_name}
            </h1>
            <div className="mt-[3px] flex flex-wrap items-center gap-x-[10px] gap-y-1 sm:mt-2">
              <span className="font-mono text-[12.5px] text-muted-foreground sm:text-[13.5px]">
                {patient.national_id}
              </span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="text-[12.5px] font-medium text-muted-foreground sm:text-[13.5px]">
                Activo desde {shortDateFormatter.format(new Date(patient.created_at))}
              </span>
            </div>
          </div>
        </div>
        <EditPatientButton patient={patient} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-5 gap-y-[14px] rounded-card border border-border bg-white p-4 shadow-card-soft sm:mb-5 sm:gap-x-10 sm:gap-y-5 sm:px-6 sm:py-[22px]">
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.06em] text-slate-400 sm:mb-[7px] sm:text-[11px]">
            DNI / ID
          </div>
          <div className="font-mono text-[14px] font-semibold text-slate-800 sm:text-[15px]">
            {patient.national_id}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.06em] text-slate-400 sm:mb-[7px] sm:text-[11px]">
            Teléfono
          </div>
          <div className="font-mono text-[14px] font-semibold text-slate-800 sm:text-[15px]">
            {patient.phone ?? "—"}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.06em] text-slate-400 sm:mb-[7px] sm:text-[11px]">
            Email
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-slate-800 sm:text-[15px]">
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
        <div className="col-span-2 sm:col-span-1">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.06em] text-slate-400 sm:mb-[7px] sm:text-[11px]">
            Fecha de alta
          </div>
          <div className="text-[14px] font-medium text-slate-800 sm:text-[15px]">
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
