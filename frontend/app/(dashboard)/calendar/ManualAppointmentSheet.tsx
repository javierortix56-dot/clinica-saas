"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

import type { Patient } from "@clinica/shared";
import type { ProfessionalForScheduling, TreatmentTypeOption } from "@/lib/supabase/server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";
import { createManualAppointment } from "./actions";
import { rejectAppointment } from "../approvals/actions";

const INPUT =
  "w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400";
const LABEL = "text-sm font-medium text-slate-700";

function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hours * 60 + mins + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function ManualAppointmentSheet({
  open,
  onOpenChange,
  patients,
  professionals,
  treatmentTypes = [],
  initialPatientId,
  initialProfessionalId,
  replacesAppointmentId,
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
  initialProfessionalId?: string;
  replacesAppointmentId?: string;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  defaultDurationMinutes?: number;
}) {
  const router = useRouter();
  const ids = useId();
  const [isPending, startTransition] = useTransition();
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId ?? "");
  const [professionalId, setProfessionalId] = useState(initialProfessionalId ?? "");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const minDate = todayISO();

  useEffect(() => {
    if (!open) return;
    const today = todayISO();
    setPatientSearch("");
    setSelectedPatientId(initialPatientId ?? "");
    setProfessionalId(initialProfessionalId ?? "");
    // Una solicitud vencida trae su fecha original: se propone hoy como mínimo.
    setDate(initialDate && initialDate >= today ? initialDate : initialDate ? today : "");
    setStartTime(initialStartTime ?? "09:00");
    setEndTime(initialEndTime ?? addMinutes(initialStartTime ?? "09:00", defaultDurationMinutes));
  }, [defaultDurationMinutes, initialDate, initialEndTime, initialPatientId, initialProfessionalId, initialStartTime, open]);

  // Un profesional que ya no está disponible (inactivo) no queda preseleccionado.
  const professionalValue = professionals.some((p) => p.id === professionalId) ? professionalId : "";

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;
  const query = patientSearch.trim().toLowerCase();
  const matches = query
    ? patients.filter(
        (p) =>
          p.full_name.toLowerCase().includes(query) ||
          (p.national_id ?? "").toLowerCase().includes(query)
      )
    : patients;
  // El paciente elegido queda siempre visible arriba, aunque no esté entre los primeros.
  const visiblePatients = [
    ...(selectedPatient ? [selectedPatient] : []),
    ...matches.filter((p) => p.id !== selectedPatientId),
  ].slice(0, 8);
  const currentDuration = minutesBetween(startTime, endTime);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createManualAppointment(formData);
      if (result.error) { toast.error(result.error); return; }
      if (replacesAppointmentId) {
        const rejected = await rejectAppointment(replacesAppointmentId);
        if (rejected.error) {
          toast.warning("Turno creado, pero la solicitud original sigue pendiente. Descartala desde Solicitudes.");
        } else {
          toast.success("Turno creado. La solicitud original quedó descartada.");
        }
      } else {
        toast.success("Turno creado.");
      }
      router.refresh();
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 p-6">
          <SheetTitle>{replacesAppointmentId ? "Proponer otro horario" : "Nuevo turno"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 p-6">
          {replacesAppointmentId && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Al crear este turno, la solicitud original se descarta automáticamente.
            </p>
          )}

          {/* Paciente */}
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-patient`} className={LABEL}>Paciente</label>
            <input
              id={`${ids}-patient`}
              type="search"
              placeholder="Buscar por nombre o DNI…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className={INPUT}
              autoComplete="off"
            />
            <input type="hidden" name="patient_id" value={selectedPatientId} />
            <div
              role="group"
              aria-label="Resultados de pacientes"
              className="max-h-48 overflow-y-auto rounded border border-slate-200 bg-white p-1"
            >
              {visiblePatients.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selectedPatientId === p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${selectedPatientId === p.id ? "bg-primary/10 font-semibold text-primary" : "hover:bg-slate-50"}`}
                >
                  <span>{p.full_name}</span>
                  <span className="text-xs text-slate-400">{p.national_id ? `DNI ${p.national_id}` : ""}</span>
                </button>
              ))}
              {matches.length === 0 && (
                <div className="flex flex-col items-center gap-2 px-3 py-4 text-center text-xs text-slate-400">
                  No se encontraron pacientes.
                  <Link
                    href="/patients?nuevo=1"
                    className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Registrar paciente nuevo
                  </Link>
                </div>
              )}
            </div>
            {!selectedPatientId && <p className="text-xs font-medium text-amber-600">Seleccioná un paciente para continuar.</p>}
          </div>

          {/* Profesional */}
          {professionals.length === 1 ? (
            <>
              <input type="hidden" name="professional_id" value={professionals[0].id} />
              <div className="space-y-1.5">
                <span className={LABEL}>Profesional</span>
                <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {professionals[0].name}
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-prof`} className={LABEL}>Profesional</label>
              <select
                id={`${ids}-prof`}
                name="professional_id"
                required
                value={professionalValue}
                onChange={(e) => setProfessionalId(e.target.value)}
                className={INPUT}
              >
                <option value="">— Seleccionar —</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Motivo de consulta */}
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-reason`} className={LABEL}>
              Motivo <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id={`${ids}-reason`}
              type="text"
              name="reason"
              list={`${ids}-types`}
              placeholder="Primera consulta, control, procedimiento…"
              maxLength={200}
              className={INPUT}
            />
            {treatmentTypes.length > 0 && (
              <datalist id={`${ids}-types`}>
                {treatmentTypes.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            )}
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <label htmlFor={`${ids}-date`} className={LABEL}>Fecha</label>
            <input
              id={`${ids}-date`}
              type="date"
              name="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={minDate}
              className={INPUT}
            />
          </div>

          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-start`} className={LABEL}>Inicio</label>
              <input
                id={`${ids}-start`}
                type="time"
                name="start_time"
                required
                value={startTime}
                onChange={(e) => {
                  const next = e.target.value;
                  // Mantiene la duración elegida al mover el inicio.
                  if (next && currentDuration > 0) setEndTime(addMinutes(next, currentDuration));
                  setStartTime(next);
                }}
                className={INPUT}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-end`} className={LABEL}>Fin</label>
              <input id={`${ids}-end`} type="time" name="end_time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={INPUT} />
            </div>
          </div>

          <div className="space-y-1.5">
            <span id={`${ids}-dur`} className={LABEL}>Duración</span>
            <div role="group" aria-labelledby={`${ids}-dur`} className="flex flex-wrap gap-2">
              {Array.from(new Set([defaultDurationMinutes, 20, 30, 45, 60])).sort((a, b) => a - b).map((minutes) => {
                const active = currentDuration === minutes;
                return (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setEndTime(addMinutes(startTime, minutes))}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary"}`}
                  >
                    {minutes} min
                  </button>
                );
              })}
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
