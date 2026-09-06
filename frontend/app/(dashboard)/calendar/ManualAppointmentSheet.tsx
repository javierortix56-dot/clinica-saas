"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Patient } from "@clinica/shared";
import type { ProfessionalForScheduling, TreatmentTypeOption } from "@/lib/supabase/server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { createManualAppointment } from "./actions";

const INPUT =
  "w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400";

export function ManualAppointmentSheet({
  open,
  onOpenChange,
  patients,
  professionals,
  treatmentTypes = [],
  initialPatientId,
  initialDate,
  initialStartTime,
  initialEndTime,
  defaultDurationMinutes = 30,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Pick<Patient, "id" | "full_name" | "national_id">[];
  professionals: ProfessionalForScheduling[];
  treatmentTypes?: TreatmentTypeOption[];
  initialPatientId?: string;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  defaultDurationMinutes?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");

  useEffect(() => {
    if (!open) return;
    setSelectedPatientId(initialPatientId ?? "");
    setStartTime(initialStartTime ?? "09:00");
    setEndTime(initialEndTime ?? addMinutes(initialStartTime ?? "09:00", defaultDurationMinutes));
  }, [defaultDurationMinutes, initialEndTime, initialPatientId, initialStartTime, open]);

  function addMinutes(time: string, minutes: number): string {
    const [hours, mins] = time.split(":").map(Number);
    const total = Math.min(23 * 60 + 59, hours * 60 + mins + minutes);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

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
          <SheetTitle>Nuevo turno</SheetTitle>
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
              className={INPUT}
            />
            <input type="hidden" name="patient_id" value={selectedPatientId} />
            <div className="max-h-48 overflow-y-auto rounded border border-slate-200 bg-white p-1">
              {filteredPatients.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPatientId(p.id)}
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${selectedPatientId === p.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-slate-50"}`}
                >
                  <span>{p.full_name}</span>
                  <span className="text-xs text-slate-400">{p.national_id ? `DNI ${p.national_id}` : ""}</span>
                </button>
              ))}
              {filteredPatients.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-slate-400">No se encontraron pacientes.</p>
              )}
            </div>
            {!selectedPatientId && <p className="text-xs font-medium text-amber-600">Selecciona un paciente para continuar.</p>}
          </div>

          {/* Profesional */}
          {professionals.length === 1 ? (
            <>
              <input type="hidden" name="professional_id" value={professionals[0].id} />
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Profesional</label>
                <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {professionals[0].name}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Profesional</label>
              <select name="professional_id" required className={INPUT}>
                <option value="">— Seleccionar —</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Motivo de consulta */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Motivo <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="text"
              name="reason"
              list="treatment-types-list"
              placeholder="Primera consulta, control, procedimiento…"
              maxLength={200}
              className={INPUT}
            />
            {treatmentTypes.length > 0 && (
              <datalist id="treatment-types-list">
                {treatmentTypes.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Duración habitual</label>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set([defaultDurationMinutes, 20, 30, 45, 60])).sort((a, b) => a - b).map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setEndTime(addMinutes(startTime, minutes))}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary/40 hover:text-primary"
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Fecha</label>
            <input
              type="date"
              name="date"
              required
              defaultValue={initialDate}
              min={new Date().toISOString().slice(0, 10)}
              className={INPUT}
            />
          </div>

          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Inicio</label>
              <input type="time" name="start_time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={INPUT} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Fin</label>
              <input type="time" name="end_time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={INPUT} />
            </div>
          </div>

          <div className="mt-auto pt-4">
            <Button type="submit" disabled={isPending || !selectedPatientId} className="w-full">
              {isPending ? "Creando…" : "Crear turno"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
