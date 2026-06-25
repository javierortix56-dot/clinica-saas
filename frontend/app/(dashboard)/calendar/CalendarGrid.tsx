"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import type { WeeklyAppointment, ProfessionalForScheduling } from "@/lib/supabase/server";
import type { Patient } from "@clinica/shared";
import {
  DAY_LABELS,
  SLOTS,
  appointmentsForSlot,
  formatDayDate,
  formatDuration,
  formatSlot,
  formatTime,
  isToday,
  parseISODate,
} from "./grid-utils";
import { AppointmentSheet } from "./AppointmentSheet";
import { ManualAppointmentSheet } from "./ManualAppointmentSheet";

// Paleta de colores por profesional (border-left de los eventos). Se asigna de
// forma estable por nombre para que cada profesional mantenga su color.
const PROF_COLORS = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0891b2",
];

function profColor(name: string | null): string {
  if (!name) return "#2563eb";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PROF_COLORS[hash % PROF_COLORS.length];
}

// Grilla semanal interactiva. page.tsx (Server Component) resuelve auth y datos y
// pasa solo props serializables: los días como ISO (YYYY-MM-DD) y los turnos.
// El estado del turno seleccionado vive acá; hay un único <Sheet> compartido.
export function CalendarGrid({
  weekDays: weekDayStrs,
  appointments,
  canCreateAppointment,
  patients,
  professionals,
}: {
  weekDays: string[];
  appointments: WeeklyAppointment[];
  canCreateAppointment: boolean;
  patients: Pick<Patient, "id" | "full_name" | "national_id">[];
  professionals: ProfessionalForScheduling[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newApptOpen, setNewApptOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ patientId?: string; date?: string }>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const weekDays = weekDayStrs.map(parseISODate);

  // Apertura desde "Generar turno" en la historia clínica:
  // /calendar?nuevo=1&paciente=<id>&fecha=<YYYY-MM-DD>. Precarga el alta manual.
  useEffect(() => {
    if (!canCreateAppointment) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("nuevo") === "1") {
      setPrefill({
        patientId: params.get("paciente") ?? undefined,
        date: params.get("fecha") ?? undefined,
      });
      setNewApptOpen(true);
      // Limpia la query para no reabrir el alta al refrescar.
      window.history.replaceState(null, "", "/calendar");
    }
  }, [canCreateAppointment]);


  // Profesionales presentes esta semana (para los chips de filtro y la leyenda).
  const profNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of appointments) {
      if (a.professional_name) names.add(a.professional_name);
    }
    return Array.from(names).sort();
  }, [appointments]);

  function toggleProf(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const visibleAppts = appointments.filter(
    (a) => !a.professional_name || !hidden.has(a.professional_name)
  );

  return (
    <>
      <div className="mb-[14px] flex flex-wrap items-center gap-2">
        {profNames.length > 0 && (
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">
            Profesionales
          </span>
        )}
        {profNames.map((name) => {
          const color = profColor(name);
          const off = hidden.has(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleProf(name)}
              className="flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] text-[12.5px] font-semibold transition"
              style={
                off
                  ? {
                      borderColor: "#e2e8f0",
                      background: "#fff",
                      color: "#94a3b8",
                    }
                  : {
                      borderColor: `${color}40`,
                      background: `${color}14`,
                      color,
                    }
              }
            >
              <span
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: off ? "#cbd5e1" : color }}
              />
              {name}
            </button>
          );
        })}
        {canCreateAppointment && (
          <button
            type="button"
            onClick={() => { setPrefill({}); setNewApptOpen(true); }}
            className="ml-auto flex items-center gap-[6px] rounded-[10px] bg-primary px-[13px] py-[8px] text-[12.5px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07]"
          >
            <Plus className="h-[14px] w-[14px]" strokeWidth={2.4} />
            Nuevo turno
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[640px]"
            style={{ gridTemplateColumns: "3.625rem repeat(6, 1fr)" }}
          >
            {/* Header row */}
            <div className="border-b border-border bg-[#fbfcfe]" />
            {weekDays.map((day, i) => {
              const today = isToday(day);
              return (
                <div
                  key={i}
                  className={`border-b border-l border-[#eef2f7] px-2 py-[10px] text-center ${
                    today ? "bg-primary/10" : "bg-[#fbfcfe]"
                  }`}
                >
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      today ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {DAY_LABELS[i]}
                  </p>
                  <p
                    className={`mt-[2px] text-[13px] ${
                      today ? "font-bold text-primary" : "text-slate-400"
                    }`}
                  >
                    {formatDayDate(day)}
                  </p>
                </div>
              );
            })}

            {/* Estado vacío */}
            {visibleAppts.length === 0 && (
              <React.Fragment>
                <div className="border-b border-[#eef2f7] py-3 pr-2 text-right">
                  <span className="font-mono text-[11px] text-slate-400">
                    08:00
                  </span>
                </div>
                <div className="col-span-6 border-b border-l border-[#eef2f7] px-4 py-10 text-center text-[13.5px] font-medium text-slate-400">
                  {appointments.length === 0
                    ? "No hay turnos confirmados en esta semana."
                    : "Ningún profesional visible. Activá un chip para ver sus turnos."}
                </div>
              </React.Fragment>
            )}

            {/* Filas de franjas horarias */}
            {visibleAppts.length > 0 &&
              SLOTS.map((slot) => (
                <React.Fragment key={`${slot.hour}-${slot.minute}`}>
                  {/* Etiqueta de hora — solo en punto */}
                  <div
                    className={`border-b border-[#eef2f7] pr-2 text-right ${
                      slot.minute === 0 ? "pb-0 pt-[6px]" : "pb-[6px] pt-0"
                    }`}
                  >
                    {slot.minute === 0 && (
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatSlot(slot)}
                      </span>
                    )}
                  </div>

                  {/* Celdas por día */}
                  {weekDays.map((day, di) => {
                    const cellAppts = appointmentsForSlot(
                      visibleAppts,
                      day,
                      slot.hour,
                      slot.minute
                    );
                    return (
                      <div
                        key={di}
                        className={`min-h-[1.75rem] space-y-[3px] border-b border-l border-[#eef2f7] p-[3px] ${
                          isToday(day) ? "bg-primary/[.035]" : ""
                        }`}
                      >
                        {cellAppts.map((a) => {
                          const color = profColor(a.professional_name);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => setSelectedId(a.id)}
                              style={{ borderLeftColor: color }}
                              className="w-full space-y-[2px] rounded-lg border border-status-confirmado-border border-l-[3px] bg-status-confirmado-bg px-[8px] py-[5px] text-left transition-shadow hover:shadow-[0_5px_14px_rgba(15,23,42,.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <p className="font-mono text-[9.5px] text-status-confirmado-fg">
                                {formatTime(a.start_at)} ·{" "}
                                {formatDuration(a.start_at, a.end_at)}
                              </p>
                              <p className="truncate text-[12px] font-semibold text-status-confirmado-fg">
                                {a.patient_name}
                              </p>
                              {(a.treatment_label || a.professional_name) && (
                                <p className="truncate text-[10px] text-status-confirmado-fg/70">
                                  {[a.treatment_label, a.professional_name]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-muted-foreground">
          <span className="h-[10px] w-[10px] rounded-[3px] border border-status-confirmado-border bg-status-confirmado-bg" />
          Confirmado
        </div>
        {profNames.length > 0 && <div className="flex-1" />}
        <div className="flex flex-wrap items-center gap-[14px]">
          {profNames.map((name) => (
            <div
              key={name}
              className="flex items-center gap-[6px] text-[12.5px] font-medium text-muted-foreground"
            >
              <span
                className="h-[3px] w-[11px] rounded-[2px]"
                style={{ background: profColor(name) }}
              />
              {name}
            </div>
          ))}
        </div>
      </div>

      <AppointmentSheet
        appointmentId={selectedId}
        open={selectedId !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
      />

      <ManualAppointmentSheet
        open={newApptOpen}
        onOpenChange={setNewApptOpen}
        patients={patients}
        professionals={professionals}
        initialPatientId={prefill.patientId}
        initialDate={prefill.date}
      />
    </>
  );
}
