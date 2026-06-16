import Link from "next/link";
import { notFound } from "next/navigation";

import { getPatientById } from "@/lib/supabase/server";

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
  const patient = await getPatientById(params.id);

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

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {patient.full_name}
        </h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              DNI / ID
            </dt>
            <dd className="mt-1 text-sm">{patient.national_id}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Teléfono
            </dt>
            <dd className="mt-1 text-sm">{patient.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              Fecha de alta
            </dt>
            <dd className="mt-1 text-sm">
              {dateFormatter.format(new Date(patient.created_at))}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-2 text-base font-semibold">Turnos</h2>
        <p className="text-sm text-muted-foreground">
          Historial de turnos próximamente.
        </p>
      </div>
    </div>
  );
}
