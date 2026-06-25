"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

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
  isSameLocalDay,
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

  // Mobile: día seleccionado en el navegador de día, centrado en hoy si aplica.
  const [mobileDayIdx, setMobileDayIdx] = useState(() => {
    const todayIdx = weekDays.findIndex((d) => isToday(d));
    return todayIdx >= 0 ? todayIdx : 0;
  });

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

  // Turnos del día seleccionado en mobile, ordenados por hora.
  const mobileDayAppts = useMemo(
    () =>
      visibleAppts
        .filter((a) => isSameLocalDay(a.start_at, weekDays[mobileDayIdx]))
        .sort((a, b) => (a.start_at < b.start_at ? -1 : 1)),
    [visibleAppts, mobileDayIdx, weekDays]
  );

  return (
    <>
      {/* Barra de filtros + Nuevo turno */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
              className="flex items-center gap-[6px] rounded-full border px-[10px] py-[4px] text-[12px] font-semibold transition"
              style={
                off
                  ? { borderColor: "#e2e8f0", background: "#fff", color: "#94a3b8" }
                  : { borderColor: `${color}40`, background: `${color}14`, color }
              }
            >
              <span
                className="h-[6px] w-[6px] rounded-full"
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
            className="ml-auto flex items-center gap-[6px] rounded-[10px] bg-primary px-[12px] py-[7px] text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07] sm:px-[13px] sm:py-[8px] sm:text-[12.5px]"
          >
            <Plus className="h-[13px] w-[13px]" strokeWidth={2.4} />
            Nuevo turno
          </button>
        )}
      </div>

      {/* ── Vista MOBILE: navegador de día + lista de turnos ───────────────── */}
      <div className="md:hidden overflow-hidden rounded-card border border-border bg-white shadow-card">
        {/* Selector de día */}
        <div className="flex items-center border-b border-border bg-[#fbfcfe]">
          <button
            type="button"
            onClick={() => setMobileDayIdx((i) => Math.max(0, i - 1))}
            disabled={mobileDayIdx === 0}
            className="flex h-10 w-9 shrink-0 items-center justify-center text-slate-400 transition hover:text-slate-700 disabled:opacity-30"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>

          <div className="flex flex-1 items-center justify-around px-1">
            {weekDays.map((day, i) => {
              const today = isToday(day);
              const active = i === mobileDayIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setMobileDayIdx(i)}
                  className={`flex flex-col items-center rounded-lg px-1.5 py-1.5 transition ${
                    active ? "bg-primary/10" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                      today ? "text-primary" : "text-slate-400"
                    }`}
                  >
                    {DAY_LABELS[i].slice(0, 2)}
                  </span>
                  <span
                    className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${
                      today && active
                        ? "bg-primary text-white"
                        : today
                        ? "text-primary"
                        : active
                        ? "text-foreground"
                        : "text-slate-400"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setMobileDayIdx((i) => Math.min(5, i + 1))}
            disabled={mobileDayIdx === 5}
            className="flex h-10 w-9 shrink-0 items-center justify-center text-slate-400 transition hover:text-slate-700 disabled:opacity-30"
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* Lista de turnos del día */}
        {mobileDayAppts.length === 0 ? (
          <div className="py-8 text-center text-[13px] font-medium text-slate-400">
            {appointments.length === 0 || visibleAppts.length === 0
              ? "Sin turnos este día."
              : "Sin turnos visibles. Activá un profesional arriba."}
          </div>
        ) : (
          <div className="divide-y divide-[#eef2f7]">
            {mobileDayAppts.map((a) => {
              const color = profColor(a.professional_name);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100"
                >
                  <div
                    className="h-8 w-[3px] shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <div className="w-[52px] shrink-0 text-right">
                    <div className="font-mono text-[12.5px] font-bold text-slate-700">
                      {formatTime(a.start_at)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatDuration(a.start_at, a.end_at)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-foreground">
                      {a.patient_name}
                    </div>
                    {(a.treatment_label || a.professional_name) && (
                      <div className="truncate text-[11px] text-slate-400">
                        {[a.treatment_label, a.professional_name]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Vista DESKTOP: grilla semanal ──────────────────────────────────── */}
      <div className="hidden md:block overflow-hidden rounded-card border border-border bg-white shadow-card">
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

      {/* Leyenda (solo desktop) */}
      <div className="mt-3 hidden flex-wrap items-center gap-5 md:flex">
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
