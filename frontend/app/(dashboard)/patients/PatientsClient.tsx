"use client";

import { useState } from "react";
import Link from "next/link";

import type { Patient } from "@clinica/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PatientSheet } from "./PatientSheet";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function PatientsClient({ patients }: { patients: Patient[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? patients.filter(
        (p) =>
          p.full_name.toLowerCase().includes(search.toLowerCase()) ||
          p.national_id.includes(search.trim())
      )
    : patients;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            Todos los pacientes registrados en la clínica.
          </p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>+ Nuevo paciente</Button>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre o DNI…"
        className="w-full max-w-sm rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />

      {filtered.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          {search ? "Sin resultados para esa búsqueda." : "No hay pacientes registrados."}
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
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link href={`/patients/${p.id}`} className="hover:underline">
                      {p.full_name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.phone ?? "—"}</TableCell>
                  <TableCell>{p.national_id}</TableCell>
                  <TableCell>
                    {dateFormatter.format(new Date(p.created_at))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PatientSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
