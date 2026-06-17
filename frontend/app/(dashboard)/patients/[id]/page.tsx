import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPatientById,
  getAppointmentsByPatient,
} from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeZone: "America/Argentina/Buenos_Aires",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

type ApptStatus = "proposed" | "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";

const STATUS_LABELS: Record<string, string> = {
  proposed: "Propuesto",
  confirmed: "Confirmado",
  in_progress: "En curso",
  completed: "Completado",
  cancelled: "Cancelado",
  no_show: "Ausente",
};

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive" | "warning"> = {
    confirmed: "outline",
    completed: "secondary",
    proposed: "outline",
    in_progress: "default",
    cancelled: "outline",
    no_show: "destructive",
  };
  const variant = variants[status] ?? "outline";
  const extraClass = status === "cancelled" ? "text-slate-400" : "";
  return (
    <Badge variant={variant} className={extraClass}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export default async function PatientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [patient, appointments] = await Promise.all([
    getPatientById(params.id),
    getAppointmentsByPatient(params.id),
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

      {/* Historial de turnos */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Historial de turnos</h2>

        {appointments.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Este paciente no tiene turnos registrados.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha / hora</TableHead>
                  <TableHead>Profesional</TableHead>
                  <TableHead>Tratamiento / Fase</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((appt) => (
                  <TableRow key={appt.id}>
                    <TableCell className="text-sm">
                      {dateTimeFormatter.format(new Date(appt.start_at))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {appt.professional_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {appt.treatment_label ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={appt.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
