import { getProposedAppointments } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmButton } from "./confirm-button";
import { RefreshButton } from "./refresh-button";

// Bandeja de aprobaciones: turnos en estado `proposed` esperando confirmación
// del staff. Server Component — datos en cada request (sin cache).
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

function formatDateTime(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export default async function ApprovalsPage() {
  const appointments = await getProposedAppointments();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Aprobaciones pendientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Turnos propuestos por el asistente esperando confirmación.
          </p>
        </div>
        <RefreshButton />
      </div>

      {appointments.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No hay turnos pendientes de aprobación.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Profesional</TableHead>
                <TableHead>Tratamiento</TableHead>
                <TableHead>Fecha/hora</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments.map((appt) => (
                <TableRow key={appt.id}>
                  <TableCell className="font-medium">
                    {appt.patient?.full_name ?? "—"}
                    {appt.patient?.phone && (
                      <span className="block text-xs text-muted-foreground">
                        {appt.patient.phone}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{appt.professional?.full_name ?? "—"}</TableCell>
                  <TableCell>{appt.treatment_type ?? "—"}</TableCell>
                  <TableCell>{formatDateTime(appt.start_at)}</TableCell>
                  <TableCell className="text-right">
                    <ConfirmButton appointmentId={appt.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
