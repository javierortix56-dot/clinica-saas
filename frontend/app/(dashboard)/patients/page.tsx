import Link from "next/link";
import { redirect } from "next/navigation";

import { getPatients, getSessionAuth, isDoctorRole } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export default async function PatientsPage() {
  // Guard de rol: el listado completo es solo para admin/reception. El doctor va a /calendar.
  const { role } = await getSessionAuth();
  if (isDoctorRole(role)) {
    redirect("/calendar");
  }

  const patients = await getPatients();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Todos los pacientes registrados en la clínica.
          </p>
        </div>
      </div>

      {patients.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No hay pacientes registrados.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>DNI / ID</TableHead>
                <TableHead>Fecha de alta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/patients/${p.id}`}
                      className="hover:underline"
                    >
                      {p.full_name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.phone ?? "—"}</TableCell>
                  <TableCell>{p.national_id}</TableCell>
                  <TableCell>{formatDate(p.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
