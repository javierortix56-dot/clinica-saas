"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import type { TreatmentTypeWithPhases } from "@/lib/supabase/server";
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

export function TreatmentTypesSection({
  treatmentTypes,
}: {
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
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-muted-foreground">
          Las consultas y procedimientos habituales. Las fases sirven para procesos
          que requieren varias visitas.
        </p>
        <Button size="sm" onClick={openCreate} className="shrink-0">
          + Nuevo tipo
        </Button>
      </div>

      {treatmentTypes.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No hay tipos de consulta definidos. Podés comenzar con Primera consulta y Control.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden sm:table-cell">Descripción</TableHead>
                <TableHead>Fases</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[1%]">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {treatmentTypes.map((tt) => (
                <TableRow
                  key={tt.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => openEdit(tt)}
                >
                  <TableCell className="text-sm font-medium">{tt.name}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
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
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Editar ${tt.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(tt);
                      }}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TreatmentTypeSheet
        mode={sheetMode}
        type={selectedType}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
