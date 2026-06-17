"use client";

import React, { useState } from "react";

import type { WeeklyAppointment } from "@/lib/supabase/server";
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

// Grilla semanal interactiva. page.tsx (Server Component) resuelve auth y datos y
// pasa solo props serializables: los días como ISO (YYYY-MM-DD) y los turnos.
// El estado del turno seleccionado vive acá; hay un único <Sheet> compartido.
export function CalendarGrid({
  weekDays: weekDayStrs,
  appointments,
}: {
  weekDays: string[];
  appointments: WeeklyAppointment[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const weekDays = weekDayStrs.map(parseISODate);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div
          className="grid min-w-[520px]"
          style={{ gridTemplateColumns: "3.5rem repeat(6, 1fr)" }}
        >
          {/* Header row */}
          <div className="border-b border-slate-200 bg-slate-50" />
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={`border-b border-l border-slate-200 px-2 py-2 text-center ${
                isToday(day) ? "bg-slate-100" : "bg-slate-50"
              }`}
            >
              <p
                className={`text-xs font-medium ${
                  isToday(day) ? "text-slate-900" : "text-slate-500"
                }`}
              >
                {DAY_LABELS[i]}
              </p>
              <p
                className={`text-xs ${
                  isToday(day)
                    ? "font-semibold text-slate-900"
                    : "text-slate-400"
                }`}
              >
                {formatDayDate(day)}
              </p>
            </div>
          ))}

          {/* Estado vacío: una fila que abarca todas las columnas */}
          {appointments.length === 0 && (
            <React.Fragment>
              <div className="border-b border-slate-100 py-3 pr-2 text-right">
                <span className="text-xs text-slate-400">08:00</span>
              </div>
              <div className="col-span-6 border-b border-l border-slate-100 px-4 py-6 text-center text-sm text-slate-400">
                No hay turnos confirmados en esta semana.
              </div>
            </React.Fragment>
          )}

          {/* Filas de franjas horarias (solo si hay turnos) */}
          {appointments.length > 0 &&
            SLOTS.map((slot) => (
              <React.Fragment key={`${slot.hour}-${slot.minute}`}>
                {/* Etiqueta de hora — solo en punto, no en :30 */}
                <div
                  className={`border-b border-slate-100 pr-2 text-right ${
                    slot.minute === 0 ? "pt-1.5 pb-0" : "pt-0 pb-1.5"
                  }`}
                >
                  {slot.minute === 0 && (
                    <span className="text-xs text-slate-400">
                      {formatSlot(slot)}
                    </span>
                  )}
                </div>

                {/* Celdas por día */}
                {weekDays.map((day, di) => {
                  const cellAppts = appointmentsForSlot(
                    appointments,
                    day,
                    slot.hour,
                    slot.minute
                  );
                  return (
                    <div
                      key={di}
                      className={`min-h-[1.75rem] border-b border-l border-slate-100 p-0.5 space-y-0.5 ${
                        isToday(day) ? "bg-slate-50/60" : ""
                      }`}
                    >
                      {cellAppts.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelectedId(a.id)}
                          className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 space-y-0.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        >
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {a.patient_name}
                          </p>
                          {a.treatment_label && (
                            <p className="text-xs text-slate-400 truncate">
                              {a.treatment_label}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">
                            {formatTime(a.start_at)} ·{" "}
                            {formatDuration(a.start_at, a.end_at)}
                          </p>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
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
    </>
  );
}
