"use client";

import { Plus } from "lucide-react";

import { formatISODate } from "@/lib/dates";
import { formatMinutes, type DayModel } from "./agenda-model";
import { BLOCK_STYLE, FREE_STYLE, STATUS_STYLE, blockLabel } from "./agenda-ui";
import type { NewAppointmentPrefill } from "./DayView";

export function SummaryView({
  days,
  todayISO,
  canCreate,
  slotMinutes,
  showProfessional,
  selectedProfessionalId,
  onOpen,
  onNew,
  onGoToDay,
}: {
  days: DayModel[];
  todayISO: string;
  canCreate: boolean;
  slotMinutes: number;
  showProfessional: boolean;
  selectedProfessionalId: string | null;
  onOpen: (id: string) => void;
  onNew: (prefill: NewAppointmentPrefill) => void;
  onGoToDay: (idx: number) => void;
}) {
  const visible = days.map((d, idx) => ({ d, idx })).filter(({ d, idx }) => idx < 5 || d.hasAttention);
  const pct = (min: number, d: DayModel) => `${Math.min(100, (min / d.availableMinutes) * 100)}%`;

  return (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${visible.length > 5 ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
      {visible.map(({ d, idx }) => {
        const today = d.dateISO === todayISO;
        const weekday = formatISODate(d.dateISO, { weekday: "long" });
        const dayNum = Number(d.dateISO.slice(8));
        const hours = d.windows
          .map((w) => `${formatMinutes(w.startMin).replace(":00", "")}–${formatMinutes(w.endMin).replace(":00", "")} h`)
          .join(", ");

        if (!d.hasAttention) {
          return (
            <section key={d.dateISO} className="flex min-h-[120px] flex-col gap-2 rounded-card border border-dashed border-slate-300 bg-slate-50 p-3.5">
              <button type="button" onClick={() => onGoToDay(idx)} className="flex items-baseline gap-2 text-left">
                <span className="text-[12px] font-bold uppercase tracking-[.06em] text-slate-500">{weekday}</span>
                <span className="text-[20px] font-extrabold text-slate-400">{dayNum}</span>
              </button>
              <p className="my-auto text-center text-[13px] font-semibold text-slate-500">Sin atención</p>
            </section>
          );
        }

        const occupancy = d.availableMinutes ? Math.round((d.busyMinutes / d.availableMinutes) * 100) : null;
        return (
          <section
            key={d.dateISO}
            className={`flex flex-col gap-2 rounded-card bg-white p-3.5 shadow-card-soft ${today ? "border-2 border-primary" : "border border-border"}`}
          >
            <button type="button" onClick={() => onGoToDay(idx)} className="flex items-end justify-between gap-2 text-left" title="Ver el día">
              <span className="flex items-baseline gap-2">
                <span className={`text-[12px] font-extrabold uppercase tracking-[.06em] ${today ? "text-primary" : "text-slate-600"}`}>{weekday}</span>
                <span className="text-[20px] font-extrabold">{dayNum}</span>
              </span>
              {hours && <span className="text-[12px] font-bold text-slate-500">{hours}</span>}
            </button>

            {d.availableMinutes > 0 && (
              <div>
                <div className="flex h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden>
                  <div className="bg-emerald-500" style={{ width: pct(d.busyByKind.confirmed, d) }} />
                  <div className="bg-orange-400" style={{ width: pct(d.busyByKind.pending, d) }} />
                  <div className="bg-slate-400" style={{ width: pct(d.busyByKind.block, d) }} />
                </div>
                <div className="mt-1 text-[12px] font-bold text-slate-600">{occupancy} % ocupado</div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {d.entries.map((e) => {
                if (e.kind === "appointment") {
                  const a = e.appointment;
                  const st = STATUS_STYLE[a.status];
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => onOpen(a.id)}
                      className={`flex flex-col rounded-[10px] px-2.5 py-2 text-left transition hover:shadow-[0_2px_8px_rgba(15,23,42,.1)] ${st.card}`}
                    >
                      <span className={`text-[11.5px] font-bold ${st.sub}`}>
                        {formatMinutes(e.startMin)}
                        {e.endMin - e.startMin !== slotMinutes ? ` · ${e.endMin - e.startMin} min` : ""}
                        {a.status !== "confirmed" ? ` · ${st.label.toLowerCase()}` : ""}
                      </span>
                      <span className={`truncate text-[13.5px] font-extrabold ${st.title}`}>{a.patient_name}</span>
                      {(a.reason ?? a.treatment_label ?? (showProfessional ? a.professional_name : null)) && (
                        <span className={`truncate text-[12px] font-medium ${st.sub}`}>
                          {[a.reason ?? a.treatment_label, showProfessional ? a.professional_name : null].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </button>
                  );
                }
                if (e.kind === "block") {
                  return (
                    <div key={e.key} className={`rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-bold ${BLOCK_STYLE.card} ${BLOCK_STYLE.title}`}>
                      {formatMinutes(e.startMin)} – {formatMinutes(e.endMin)} · {e.block.reason || blockLabel(e.block.source)}
                    </div>
                  );
                }
                if (!canCreate) return null;
                const slots = Math.floor((e.endMin - e.startMin) / slotMinutes);
                return (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() =>
                      onNew({
                        date: d.dateISO,
                        startTime: formatMinutes(e.startMin),
                        endTime: formatMinutes(Math.min(e.startMin + slotMinutes, 23 * 60 + 59)),
                        professionalId: selectedProfessionalId ?? undefined,
                      })
                    }
                    className={`flex flex-col rounded-[10px] px-2.5 py-1.5 text-left transition ${FREE_STYLE}`}
                  >
                    <span className="flex items-center gap-1 text-[12.5px] font-extrabold">
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                      {slots > 1
                        ? `${formatMinutes(e.startMin)} – ${formatMinutes(e.endMin)} libre`
                        : `${formatMinutes(e.startMin)} libre`}
                    </span>
                    {slots > 1 && <span className="text-[11.5px] font-medium text-slate-500">{slots} turnos de {slotMinutes} min</span>}
                  </button>
                );
              })}
              {d.entries.length === 0 && <p className="py-3 text-center text-[12.5px] font-medium text-slate-500">Sin turnos</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
