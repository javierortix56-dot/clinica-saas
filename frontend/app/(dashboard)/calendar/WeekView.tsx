"use client";

import { Plus } from "lucide-react";

import {
  formatMinutes,
  layoutLanes,
  type AgendaEntry,
  type DayModel,
  type Interval,
} from "./agenda-model";
import { BLOCK_STYLE, FREE_STYLE, STATUS_STYLE, blockLabel, calcAge } from "./agenda-ui";
import type { NewAppointmentPrefill } from "./DayView";

// 64 px por media hora: un turno de 30 min entra en dos líneas legibles.
const PX_PER_MIN = 64 / 30;
const WEEKDAY_SHORT = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

function EntryCard({
  e,
  top,
  height,
  left,
  width,
  showProfessional,
  canCreate,
  slotMinutes,
  onOpen,
  onFree,
}: {
  e: AgendaEntry;
  top: number;
  height: number;
  left: string;
  width: string;
  showProfessional: boolean;
  canCreate: boolean;
  slotMinutes: number;
  onOpen: (id: string) => void;
  onFree: (startMin: number) => void;
}) {
  const pos = { top, height, left, width };
  const compact = height < 44;
  const roomy = height >= 76;

  if (e.kind === "free") {
    if (!canCreate) return null;
    const slots = Math.floor((e.endMin - e.startMin) / slotMinutes);
    return (
      <button
        type="button"
        onClick={() => onFree(e.startMin)}
        style={pos}
        className={`absolute z-10 flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[10px] px-2 text-center transition ${FREE_STYLE}`}
      >
        {roomy ? (
          <>
            <span className="flex items-center gap-1 text-[13px] font-extrabold">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
              Libre {formatMinutes(e.startMin)} – {formatMinutes(e.endMin)}
            </span>
            <span className="text-[12px] font-semibold text-slate-500">
              {slots} {slots === 1 ? "turno" : "turnos"} de {slotMinutes} min
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1 truncate text-[12.5px] font-extrabold">
            <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
            Libre {formatMinutes(e.startMin)}
          </span>
        )}
      </button>
    );
  }

  if (e.kind === "block") {
    return (
      <div
        style={pos}
        className={`absolute z-10 flex flex-col justify-center overflow-hidden rounded-[10px] px-2.5 ${BLOCK_STYLE.card}`}
      >
        <span className={`truncate text-[12.5px] font-bold ${BLOCK_STYLE.title}`}>
          {compact ? `${formatMinutes(e.startMin)} · ` : ""}
          {e.block.reason || "Ocupado"}
        </span>
        {!compact && (
          <span className={`truncate text-[11.5px] font-semibold ${BLOCK_STYLE.sub}`}>
            {formatMinutes(e.startMin)} – {formatMinutes(e.endMin)} · {blockLabel(e.block.source)}
          </span>
        )}
      </div>
    );
  }

  const a = e.appointment;
  const st = STATUS_STYLE[a.status];
  const age = calcAge(a.patient_birth_date);
  const detail = a.status === "proposed" ? "Por confirmar" : (a.reason ?? a.treatment_label ?? st.label);
  return (
    <button
      type="button"
      onClick={() => onOpen(a.id)}
      style={pos}
      className={`absolute z-10 flex flex-col justify-center gap-px overflow-hidden rounded-[10px] px-2.5 text-left transition hover:shadow-[0_2px_10px_rgba(15,23,42,.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${st.card}`}
    >
      {roomy && (
        <span className={`truncate text-[11.5px] font-bold ${st.sub}`}>
          {formatMinutes(e.startMin)} – {formatMinutes(e.endMin)}
        </span>
      )}
      <span className={`truncate text-[13px] font-extrabold ${st.title}`}>
        {!roomy && `${formatMinutes(e.startMin)} · `}
        {a.patient_name}
        {age !== null && <span className={`font-semibold ${st.sub}`}> {age} a</span>}
      </span>
      {!compact && (
        <span className={`truncate text-[11.5px] font-semibold ${st.sub}`}>
          {[detail, showProfessional ? a.professional_name : null].filter(Boolean).join(" · ")}
        </span>
      )}
    </button>
  );
}

export function WeekView({
  days,
  range,
  rangeMode,
  onRangeMode,
  todayISO,
  nowMin,
  showProfessional,
  canCreate,
  slotMinutes,
  selectedProfessionalId,
  onOpen,
  onNew,
  onGoToDay,
}: {
  days: DayModel[];
  range: Interval;
  rangeMode: "fit" | "full";
  onRangeMode: (m: "fit" | "full") => void;
  todayISO: string;
  nowMin: number;
  showProfessional: boolean;
  canCreate: boolean;
  slotMinutes: number;
  selectedProfessionalId: string | null;
  onOpen: (id: string) => void;
  onNew: (prefill: NewAppointmentPrefill) => void;
  onGoToDay: (idx: number) => void;
}) {
  // Sábado sin atención: fuera. Otros días sin atención: columna angosta.
  const visible = days
    .map((d, idx) => ({ d, idx }))
    .filter(({ d, idx }) => idx < 5 || d.hasAttention);
  const columns = visible.map(({ d }) => (d.hasAttention ? "minmax(150px, 1fr)" : "76px")).join(" ");
  const height = (range.endMin - range.startMin) * PX_PER_MIN;
  const marks: number[] = [];
  for (let m = range.startMin; m < range.endMin; m += 30) marks.push(m);
  const y = (min: number) => (Math.min(Math.max(min, range.startMin), range.endMin) - range.startMin) * PX_PER_MIN;
  const lines = {
    backgroundImage: "repeating-linear-gradient(to bottom, #e9eef5 0, #e9eef5 1px, transparent 1px, transparent 64px)",
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex rounded-[10px] border border-border bg-white p-1 shadow-card-soft" role="group" aria-label="Rango horario">
          {(["fit", "full"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={rangeMode === m}
              onClick={() => onRangeMode(m)}
              className={`rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${rangeMode === m ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {m === "fit" ? "Ajustado a tu horario" : "Día completo"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px ${columns}` }}>
          {/* Encabezados */}
          <div className="border-b border-border bg-[#fbfcfe]" />
          {visible.map(({ d, idx }) => {
            const today = d.dateISO === todayISO;
            const dayNum = Number(d.dateISO.slice(8));
            const counts = [
              d.confirmedCount ? `${d.confirmedCount} ${d.confirmedCount === 1 ? "turno" : "turnos"}` : null,
              d.pendingCount ? `${d.pendingCount} por confirmar` : null,
            ].filter(Boolean).join(" · ");
            return (
              <button
                key={d.dateISO}
                type="button"
                onClick={() => onGoToDay(idx)}
                title="Ver el día"
                className={`flex min-h-[56px] items-center border-b border-l border-border px-3 text-left transition hover:bg-slate-50 ${today ? "bg-primary/[.06]" : "bg-[#fbfcfe]"} ${d.hasAttention ? "justify-between gap-2" : "flex-col justify-center"}`}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className={`text-[11px] font-bold tracking-[.06em] ${today ? "text-primary" : "text-slate-500"}`}>{WEEKDAY_SHORT[idx]}</span>
                  <span className={`text-[17px] font-extrabold ${today ? "text-primary" : d.hasAttention ? "text-foreground" : "text-slate-400"}`}>{dayNum}</span>
                </span>
                {d.hasAttention && counts && (
                  <span className="truncate text-[11.5px] font-semibold text-slate-500">{counts}</span>
                )}
              </button>
            );
          })}

          {/* Horas */}
          <div className="relative" style={{ height }}>
            {marks.map((m) => (
              <span
                key={m}
                className={`absolute right-2 font-mono text-[11px] ${m % 60 === 0 ? "font-bold text-slate-600" : "text-slate-400"}`}
                style={{ top: y(m) + 3 }}
              >
                {formatMinutes(m)}
              </span>
            ))}
          </div>

          {/* Días */}
          {visible.map(({ d }) => {
            if (!d.hasAttention) {
              return (
                <div key={d.dateISO} className="flex items-center justify-center border-l border-[#eef2f7] bg-slate-50" style={{ height }}>
                  <span className="text-[12px] font-bold tracking-[.04em] text-slate-500 [writing-mode:vertical-rl] rotate-180">
                    Sin atención
                  </span>
                </div>
              );
            }
            const busy = layoutLanes(
              d.entries.filter((e) => e.kind !== "free" && e.endMin > range.startMin && e.startMin < range.endMin)
            );
            const free = d.entries.filter((e) => e.kind === "free");
            const showNow = d.dateISO === todayISO && nowMin >= range.startMin && nowMin < range.endMin;
            return (
              <div key={d.dateISO} className="relative border-l border-[#eef2f7] bg-slate-50" style={{ height }}>
                {d.windows.map((w) => (
                  <div
                    key={w.startMin}
                    className="absolute inset-x-0 bg-white"
                    style={{ top: y(w.startMin), height: y(w.endMin) - y(w.startMin) }}
                  />
                ))}
                <div className="pointer-events-none absolute inset-0" style={lines} />
                {free.map((e) => (
                  <EntryCard
                    key={e.key}
                    e={e}
                    top={y(e.startMin) + 3}
                    height={Math.max(26, y(e.endMin) - y(e.startMin) - 6)}
                    left="6px"
                    width="calc(100% - 12px)"
                    showProfessional={showProfessional}
                    canCreate={canCreate}
                    slotMinutes={slotMinutes}
                    onOpen={onOpen}
                    onFree={(startMin) =>
                      onNew({
                        date: d.dateISO,
                        startTime: formatMinutes(startMin),
                        endTime: formatMinutes(Math.min(startMin + slotMinutes, 23 * 60 + 59)),
                        professionalId: selectedProfessionalId ?? undefined,
                      })
                    }
                  />
                ))}
                {busy.map((e) => (
                  <EntryCard
                    key={e.key}
                    e={e}
                    top={y(e.startMin) + 3}
                    height={Math.max(26, y(e.endMin) - y(e.startMin) - 6)}
                    left={`calc(${(e.lane / e.lanes) * 100}% + 6px)`}
                    width={`calc(${100 / e.lanes}% - 12px)`}
                    showProfessional={showProfessional}
                    canCreate={canCreate}
                    slotMinutes={slotMinutes}
                    onOpen={onOpen}
                    onFree={() => undefined}
                  />
                ))}
                {showNow && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: y(nowMin) }}>
                    <div className="relative h-[2px] bg-red-500/80">
                      <span className="absolute -left-[3px] -top-[3px] h-2 w-2 rounded-full bg-red-500" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] font-semibold text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-emerald-200 bg-emerald-50" />Confirmado</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border-[1.5px] border-dashed border-orange-400 bg-orange-50" />Por confirmar</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border border-slate-200 bg-slate-100" />Ocupado</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] border-[1.5px] border-dashed border-slate-300 bg-white" />Libre</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-slate-50 ring-1 ring-slate-200" />Fuera de horario</span>
      </div>
    </div>
  );
}

