"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Patient } from "@clinica/shared";
import type { ProfessionalForScheduling } from "@/lib/supabase/server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createManualAppointment } from "./actions";

export function ManualAppointmentSheet({
  open,
  onOpenChange,
  patients,
  professionals,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Pick<Patient, "id" | "full_name" | "national_id">[];
  professionals: ProfessionalForScheduling[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [patientSearch, setPatientSearch] = useState("");

  const filteredPatients = patientSearch.trim()
    ? patients.filter((p) => {
        const q = patientSearch.toLowerCase();
        return (
          p.full_name.toLowerCase().includes(q) ||
          (p.national_id ?? "").toLowerCase().includes(q)
        );
      })
    : patients;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createManualAppointment(formData);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Turno creado.");
      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 p-6">
          <SheetTitle>Nuevo turno manual</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 p-6">
          {/* Paciente */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Paciente</label>
            <input
              type="search"
              placeholder="Buscar por nombre o DNI…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
            <select
              name="patient_id"
              required
              size={5}
              className="w-full rounded border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            >
              {filteredPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.national_id ? `· DNI ${p.national_id}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Profesional */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Profesional</label>
            <select
              name="professional_id"
              required
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">— Seleccionar —</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Fecha</label>
            <input
              type="date"
              name="date"
              required
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Inicio</label>
              <input
                type="time"
                name="start_time"
                required
                defaultValue="09:00"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Fin</label>
              <input
                type="time"
                name="end_time"
                required
                defaultValue="10:00"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          <div className="mt-auto pt-4">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Creando…" : "Crear turno"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
