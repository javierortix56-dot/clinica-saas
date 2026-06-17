"use client";

import { useState } from "react";

import type { ClinicSettings, TreatmentTypeWithPhases } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TreatmentTypeSheet } from "./TreatmentTypeSheet";
import { ClinicSettingsForm } from "./ClinicSettingsForm";

export function SettingsClient({
  clinicSettings,
  treatmentTypes,
}: {
  clinicSettings: ClinicSettings | null;
  treatmentTypes: TreatmentTypeWithPhases[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"create" | "edit">("create");
  const [selectedType, setSelectedType] = useState<TreatmentTypeWithPhases | undefined>();

  function openCreate() {
    setSheetMode("create");
    setSelectedType(undefined);
    setSheetOpen(true);
  }

  function openEdit(type: TreatmentTypeWithPhases) {
    setSheetMode("edit");
    setSelectedType(type);
    setSheetOpen(true);
  }

  return (
    <>
      {/* Sección A — Tipos de tratamiento */}
      <section className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Tipos de tratamiento</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-prose">
              Los tipos de tratamiento parametrizan las fases del motor de scheduling. Cada fase
              define duración, tipo (clínica / laboratorio) y días de espera (cooldown) antes de
              agendar la fase siguiente.
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="shrink-0">
            + Nuevo tipo
          </Button>
        </div>

        {treatmentTypes.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No hay tipos de tratamiento definidos.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Fases</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {treatmentTypes.map((tt) => (
                  <TableRow
                    key={tt.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => openEdit(tt)}
                  >
                    <TableCell className="font-medium text-sm">{tt.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tt.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tt.phases.length}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tt.is_active ? "secondary" : "outline"}>
                        {tt.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <hr className="border-slate-200" />

      {/* Sección B — Configuración de la clínica */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Configuración de la clínica</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Datos generales y parámetros del motor de agendamiento.
          </p>
        </div>
        {clinicSettings ? (
          <ClinicSettingsForm settings={clinicSettings} />
        ) : (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No se pudo cargar la configuración.
          </p>
        )}
      </section>

      <TreatmentTypeSheet
        mode={sheetMode}
        type={selectedType}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
