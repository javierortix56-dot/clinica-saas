import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPatientById,
  getAppointmentsByPatient,
  getClinicalNotes,
  getPatientTreatments,
  getPatientClinicalProfile,
  getProfessionalNoteConfig,
  getSessionAuth,
} from "@/lib/supabase/server";
import { PatientTabs } from "../PatientTabs";
import { EditPatientButton } from "../EditPatientButton";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
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
  ] = await Promise.all([
    getSessionAuth(),
    getPatientById(params.id),
    getAppointmentsByPatient(params.id),
    getClinicalNotes(params.id),
    getPatientTreatments(params.id),
    getPatientClinicalProfile(params.id),
    getProfessionalNoteConfig(),
  ]);

  if (!patient) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/patients"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a pacientes
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          {patient.full_name}
        </h1>
        <EditPatientButton patient={patient} />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">DNI / ID</dt>
            <dd className="mt-1 text-sm">{patient.national_id}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Teléfono</dt>
            <dd className="mt-1 text-sm">{patient.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Email</dt>
            <dd className="mt-1 text-sm">{patient.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Fecha de alta</dt>
            <dd className="mt-1 text-sm">
              {dateFormatter.format(new Date(patient.created_at))}
            </dd>
          </div>
        </dl>
      </div>

      <PatientTabs
        patientId={params.id}
        appointments={appointments}
        notes={notes}
        treatments={treatments}
        role={role}
        clinicalProfile={clinicalProfile}
        noteConfig={noteConfig ?? {}}
      />
    </div>
  );
}
