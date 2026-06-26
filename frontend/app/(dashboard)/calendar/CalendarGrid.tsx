"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import type { WeeklyAppointment, WeeklyBlock, ProfessionalForScheduling } from "@/lib/supabase/server";
import type { Patient } from "@clinica/shared";
import {
  DAY_LABELS,
  SLOTS,
  formatDayDate,
  formatDuration,
  formatSlot,
  formatTime,
  getDayIndex,
  getSlotIndex,
  getSlotSpan,
  isSameLocalDay,
  isToday,
  parseISODate,
} from "./grid-utils";
import { AppointmentSheet } from "./AppointmentSheet";
import { ManualAppointmentSheet } from "./ManualAppointmentSheet";

// Paleta de colores por profesional — solo se usa como left-border cuando hay
// múltiples profesionales visibles.
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

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

// Altura fija de cada franja de 30 min en el grid desktop.
const SLOT_H = "1.75rem";

export function CalendarGrid({
  weekDays: weekDayStrs,
  appointments,
  blocks = [],
  canCreateAppointment,
  patients,
  professionals,
}: {
  weekDays: string[];
  appointments: WeeklyAppointment[];
  blocks?: WeeklyBlock[];
  canCreateAppointment: boolean;
  patients: Pick<Patient, "id" | "full_name" | "national_id">[];
  professionals: ProfessionalForScheduling[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newApptOpen, setNewApptOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ patientId?: string; date?: string }>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const weekDays = weekDayStrs.map(parseISODate);

  const [mobileDayIdx, setMobileDayIdx] = useState(() => {
    const todayIdx = weekDays.findIndex((d) => isToday(d));
    return todayIdx >= 0 ? todayIdx : 0;
  });

  useEffect(() => {
    if (!canCreateAppointment) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("nuevo") === "1") {
      setPrefill({
        patientId: params.get("paciente") ?? undefined,
        date: params.get("fecha") ?? undefined,
      });
      setNewApptOpen(true);
      window.history.replaceState(null, "", "/calendar");
    }
  }, [canCreateAppointment]);

  const profNames = useMemo(() => {
    const names = new Set<string>();
    for (const a of appointments) if (a.professional_name) names.add(a.professional_name);
    for (const b of blocks) if (b.professional_name) names.add(b.professional_name);
    return Array.from(names).sort();
  }, [appointments, blocks]);

  // Cuando solo hay un profesional no necesitamos chips de filtro ni left-border de color.
  const multiProf = profNames.length > 1;

  function toggleProf(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  const visibleAppts = appointments.filter(
    (a) => !a.professional_name || !hidden.has(a.professional_name)
  );
  const visibleBlocks = blocks.filter(
    (b) => !b.professional_name || !hidden.has(b.professional_name)
  );
  const hasData = visibleAppts.length > 0 || visibleBlocks.length > 0;

  const mobileDayAppts = useMemo(
    () =>
      visibleAppts
        .filter((a) => isSameLocalDay(a.start_at, weekDays[mobileDayIdx]))
        .sort((a, b) => (a.start_at < b.start_at ? -1 : 1)),
    [visibleAppts, mobileDayIdx, weekDays]
  );

  const mobileDayBlocks = useMemo(
    () =>
      visibleBlocks
        .filter((b) => isSameLocalDay(b.start_at, weekDays[mobileDayIdx]))
        .sort((a, b) => (a.start_at < b.start_at ? -1 : 1)),
    [visibleBlocks, mobileDayIdx, weekDays]
  );

  return (
    <>
      {/* Barra de filtros + Nuevo turno */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {multiProf && (
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.06em] text-slate-400">
            Profesionales
          </span>
        )}
        {multiProf && profNames.map((name) => {
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

      {/* ── Vista MOBILE ──────────────────────────────────────────────────── */}
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
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${today ? "text-primary" : "text-slate-400"}`}>
                    {DAY_LABELS[i].slice(0, 2)}
                  </span>
                  <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${
                    today && active ? "bg-primary text-white" : today ? "text-primary" : active ? "text-foreground" : "text-slate-400"
                  }`}>
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

        {/* Lista de turnos */}
        {mobileDayAppts.length === 0 && mobileDayBlocks.length === 0 ? (
          <div className="py-8 text-center text-[13px] font-medium text-slate-400">
            {appointments.length === 0 && blocks.length === 0
              ? "Sin turnos este día."
              : "Nada visible. Activá un profesional arriba."}
          </div>
        ) : (
          <div className="divide-y divide-[#eef2f7]">
            {mobileDayAppts.map((a) => {
              const age = calcAge(a.patient_birth_date);
              const color = multiProf ? profColor(a.professional_name) : "var(--color-primary)";
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className="flex w-full items-center gap-3 px-4 py-[10px] text-left transition hover:bg-slate-50 active:bg-slate-100"
                >
                  <div className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
                  <div className="w-[48px] shrink-0 text-right">
                    <div className="font-mono text-[12px] font-bold text-slate-700">{formatTime(a.start_at)}</div>
                    <div className="text-[10px] text-slate-400">{formatDuration(a.start_at, a.end_at)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-foreground">
                      {a.patient_name}
                      {age !== null && <span className="ml-1 font-normal text-slate-400 text-[11px]">{age}a</span>}
                    </div>
                    {/* Mostrar doctor solo en vista multi-profesional */}
                    {(a.treatment_label || (multiProf && a.professional_name)) && (
                      <div className="truncate text-[11px] text-slate-400">
                        {[a.treatment_label, multiProf ? a.professional_name : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              );
            })}

            {mobileDayBlocks.map((b) => (
              <div key={b.id} className="flex w-full items-center gap-3 bg-slate-50/60 px-4 py-[10px]">
                <div className="h-8 w-[3px] shrink-0 rounded-full bg-slate-300" />
                <div className="w-[48px] shrink-0 text-right">
                  <div className="font-mono text-[12px] font-bold text-slate-500">{formatTime(b.start_at)}</div>
                  <div className="text-[10px] text-slate-400">{formatDuration(b.start_at, b.end_at)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-slate-500">{b.reason || "Ocupado"}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    {b.source === "google_calendar" ? "Google Calendar" : "Bloqueo"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Vista DESKTOP: grilla con filas de altura fija ─────────────────── */}
      <div className="hidden md:block overflow-hidden rounded-card border border-border bg-white shadow-card">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[640px]"
            style={{
              gridTemplateColumns: "3.25rem repeat(6, 1fr)",
              gridTemplateRows: hasData
                ? `auto repeat(${SLOTS.length}, ${SLOT_H})`
                : "auto auto",
            }}
          >
            {/* ── Header ── */}
            <div className="border-b border-border bg-[#fbfcfe]" />
            {weekDays.map((day, i) => {
              const today = isToday(day);
              return (
                <div
                  key={i}
                  className={`border-b border-l border-[#eef2f7] px-2 py-[8px] text-center ${today ? "bg-primary/10" : "bg-[#fbfcfe]"}`}
                >
                  <p className={`text-[10.5px] font-semibold uppercase tracking-wide ${today ? "text-primary" : "text-muted-foreground"}`}>
                    {DAY_LABELS[i]}
                  </p>
                  <p className={`mt-[1px] text-[12px] ${today ? "font-bold text-primary" : "text-slate-400"}`}>
                    {formatDayDate(day)}
                  </p>
                </div>
              );
            })}

            {/* ── Estado vacío ── */}
            {!hasData && (
              <React.Fragment>
                <div className="border-b border-[#eef2f7]" />
                <div className="col-span-6 border-b border-l border-[#eef2f7] px-4 py-10 text-center text-[13px] font-medium text-slate-400">
                  {appointments.length === 0 && blocks.length === 0
                    ? "No hay turnos confirmados en esta semana."
                    : "Ningún profesional visible. Activá un chip para ver sus turnos."}
                </div>
              </React.Fragment>
            )}

            {/* ── Celdas de fondo (bordes, color de hoy) — sin overflow-hidden ── */}
            {hasData && SLOTS.map((slot) => (
              <React.Fragment key={`${slot.hour}-${slot.minute}`}>
                <div className="relative border-b border-[#eef2f7] pr-1.5">
                  {slot.minute === 0 && (
                    <span className="absolute right-[5px] top-[3px] font-mono text-[9.5px] leading-none text-slate-400">
                      {formatSlot(slot)}
                    </span>
                  )}
                </div>
                {weekDays.map((day, di) => (
                  <div
                    key={di}
                    className={`border-b border-l border-[#eef2f7] ${isToday(day) ? "bg-primary/[.03]" : ""}`}
                  />
                ))}
              </React.Fragment>
            ))}

            {/* ── Bloqueos: explícitamente posicionados en el grid, con span real ── */}
            {hasData && visibleBlocks.map((b) => {
              const si = getSlotIndex(b.start_at);
              const span = getSlotSpan(b.start_at, b.end_at);
              const di = getDayIndex(b.start_at, weekDays);
              if (si < 0 || di < 0) return null;
              return (
                <div
                  key={b.id}
                  className="relative z-10 pointer-events-none"
                  style={{
                    gridRow: `${si + 2} / span ${span}`,
                    gridColumn: di + 2,
                  }}
                >
                  <div
                    title={`${formatTime(b.start_at)}–${formatTime(b.end_at)} · ${b.reason || "Ocupado"}`}
                    className="pointer-events-auto absolute inset-[1px] flex items-start overflow-hidden rounded-[3px] border border-slate-200 border-l-[2px] border-l-slate-300 bg-slate-100 px-[4px] py-[2px]"
                  >
                    <p className="truncate font-mono text-[8.5px] text-slate-400">
                      {b.reason || "Ocupado"}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* ── Turnos: explícitamente posicionados en el grid, con span real ── */}
            {hasData && visibleAppts.map((a) => {
              const si = getSlotIndex(a.start_at);
              const span = getSlotSpan(a.start_at, a.end_at);
              const di = getDayIndex(a.start_at, weekDays);
              if (si < 0 || di < 0) return null;
              const age = calcAge(a.patient_birth_date);
              const borderColor = multiProf ? profColor(a.professional_name) : undefined;
              return (
                <div
                  key={a.id}
                  className="relative z-20 pointer-events-none"
                  style={{
                    gridRow: `${si + 2} / span ${span}`,
                    gridColumn: di + 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="pointer-events-auto absolute inset-[1px] flex flex-col justify-start overflow-hidden rounded-[3px] border border-status-confirmado-border border-l-[2px] bg-status-confirmado-bg px-[4px] py-[2px] text-left transition-shadow hover:shadow-[0_2px_8px_rgba(15,23,42,.12)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    style={{ borderLeftColor: borderColor }}
                  >
                    <p className="truncate font-mono text-[8.5px] leading-tight text-status-confirmado-fg/70">
                      {formatTime(a.start_at)}
                    </p>
                    <p className="truncate text-[10px] font-semibold leading-tight text-status-confirmado-fg">
                      {a.patient_name}
                      {age !== null && (
                        <span className="ml-1 font-normal text-[8.5px] opacity-70">{age}a</span>
                      )}
                    </p>
                    {multiProf && a.professional_name && (
                      <p className="truncate text-[8px] leading-tight text-status-confirmado-fg/60">
                        {a.professional_name}
                      </p>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leyenda (solo desktop) */}
      <div className="mt-2 hidden flex-wrap items-center gap-4 md:flex">
        <div className="flex items-center gap-[6px] text-[11.5px] font-medium text-muted-foreground">
          <span className="h-[9px] w-[9px] rounded-[2px] border border-status-confirmado-border bg-status-confirmado-bg" />
          Confirmado
        </div>
        {visibleBlocks.length > 0 && (
          <div className="flex items-center gap-[6px] text-[11.5px] font-medium text-muted-foreground">
            <span className="h-[9px] w-[9px] rounded-[2px] border border-slate-200 bg-slate-100" />
            Ocupado (Google)
          </div>
        )}
        {multiProf && (
          <>
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-3">
              {profNames.map((name) => (
                <div key={name} className="flex items-center gap-[5px] text-[11.5px] font-medium text-muted-foreground">
                  <span className="h-[3px] w-[10px] rounded-full" style={{ background: profColor(name) }} />
                  {name}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <AppointmentSheet
        appointmentId={selectedId}
        open={selectedId !== null}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
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
