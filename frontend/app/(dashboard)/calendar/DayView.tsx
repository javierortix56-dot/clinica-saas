"use client";

import Link from "next/link";
import { MessageCircle, MoreHorizontal, Plus } from "lucide-react";

import type { WeeklyAppointment } from "@/lib/supabase/server";
import { formatISODate } from "@/lib/dates";
import {
  formatHours,
  formatMinutes,
  type AgendaEntry,
  type DayModel,
} from "./agenda-model";
import {
  BLOCK_STYLE,
  FREE_STYLE,
  STATUS_STYLE,
  appointmentWhatsapp,
  blockLabel,
  calcAge,
  capitalizeFirst,
} from "./agenda-ui";

export interface NewAppointmentPrefill {
  patientId?: string;
  professionalId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  replacesAppointmentId?: string;
}

const WEEKDAY_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function dayStripSubtitle(d: DayModel): string {
  if (!d.hasAttention) return "Sin atención";
  const parts: string[] = [];
  if (d.confirmedCount) parts.push(`${d.confirmedCount} ${d.confirmedCount === 1 ? "turno" : "turnos"}`);
  if (d.pendingCount) parts.push(`${d.pendingCount} por confirmar`);
  if (!parts.length) return d.freeMinutes ? `${formatHours(d.freeMinutes)} libres` : "Sin turnos";
  return parts.join(" · ");
}

function DayStrip({
  days,
  selectedIdx,
  todayISO,
  onSelect,
}: {
  days: DayModel[];
  selectedIdx: number;
  todayISO: string;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
      {days.map((d, i) => {
        const active = i === selectedIdx;
        const today = d.dateISO === todayISO;
        const dayNum = Number(d.dateISO.slice(8));
        return (
          <button
            key={d.dateISO}
            type="button"
            onClick={() => onSelect(i)}
            aria-pressed={active}
            aria-label={`${WEEKDAY_SHORT[i]} ${dayNum}${today ? " (hoy)" : ""}: ${dayStripSubtitle(d)}`}
            className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center transition ${
              active
                ? "border-2 border-primary bg-primary/[.07]"
                : d.hasAttention
                  ? "border border-border bg-white hover:border-primary/40"
                  : "border border-border bg-slate-50 hover:bg-white"
            }`}
          >
            <span className={`text-[12px] font-extrabold ${active || today ? "text-primary" : d.hasAttention ? "text-foreground" : "text-slate-500"}`}>
              <span className="sm:hidden">{WEEKDAY_SHORT[i].slice(0, 2)} </span>
              <span className="hidden sm:inline">{WEEKDAY_SHORT[i]} </span>
              {dayNum}
            </span>
            <span className={`mt-0.5 hidden text-[11.5px] font-semibold leading-tight sm:block ${active ? "text-primary" : "text-slate-500"}`}>
              {dayStripSubtitle(d)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function durationLabel(e: AgendaEntry): string {
  return formatHours(e.endMin - e.startMin);
}

function AppointmentRow({
  entry,
  day,
  isToday,
  showProfessional,
  canAttend,
  canCreate,
  onOpen,
  onConfirm,
  onReschedule,
  confirmingId,
}: {
  entry: Extract<AgendaEntry, { kind: "appointment" }>;
  day: DayModel;
  isToday: boolean;
  showProfessional: boolean;
  canAttend: boolean;
  canCreate: boolean;
  onOpen: (id: string) => void;
  onConfirm: (id: string) => void;
  onReschedule: (a: WeeklyAppointment) => void;
  confirmingId: string | null;
}) {
  const a = entry.appointment;
  const st = STATUS_STYLE[a.status];
  const age = calcAge(a.patient_birth_date);
  const detail = [a.reason ?? a.treatment_label, showProfessional ? a.professional_name : null]
    .filter(Boolean)
    .join(" · ");
  const wa = appointmentWhatsapp(a, day.dateISO, entry.startMin);
  const attendable = canAttend && isToday && (a.status === "confirmed" || a.status === "in_progress");
  const iconBtn =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-black/10 bg-white/80 text-slate-600 transition hover:bg-white";

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 sm:flex-nowrap sm:px-3.5 ${st.card}`}>
      <button
        type="button"
        onClick={() => onOpen(a.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="min-w-0">
          <span className={`block truncate text-[14.5px] font-extrabold ${st.title}`}>
            {a.patient_name}
            {age !== null && <span className={`font-semibold ${st.sub}`}> · {age} años</span>}
          </span>
          <span className={`block truncate text-[12.5px] font-semibold ${st.sub}`}>
            {[detail, st.label].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>

      <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">
        {a.status === "proposed" && canCreate ? (
          <>
            <button
              type="button"
              disabled={confirmingId === a.id}
              onClick={() => onConfirm(a.id)}
              className="flex-1 rounded-[10px] bg-orange-700 px-3.5 py-2.5 text-[13px] font-extrabold text-white transition hover:bg-orange-800 disabled:opacity-60 sm:flex-none"
            >
              {confirmingId === a.id ? "Confirmando…" : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => onReschedule(a)}
              className="flex-1 rounded-[10px] border border-orange-300 bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-orange-800 transition hover:bg-orange-50 sm:flex-none"
            >
              Otro horario
            </button>
          </>
        ) : attendable ? (
          <Link
            href={`/patients/${a.patient_id}?tab=historia&nueva=1&turno=${a.id}`}
            className="flex-1 rounded-[10px] bg-primary px-3.5 py-2.5 text-center text-[13px] font-extrabold text-white shadow-[0_4px_12px_rgba(37,99,235,.25)] transition hover:brightness-[1.07] sm:flex-none"
          >
            {a.status === "in_progress" ? "Continuar" : "Atender"}
          </Link>
        ) : (
          <Link
            href={`/patients/${a.patient_id}`}
            className="flex-1 rounded-[10px] border border-black/10 bg-white/80 px-3.5 py-2.5 text-center text-[13px] font-bold text-slate-700 transition hover:bg-white sm:flex-none"
          >
            Ver ficha
          </Link>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${a.patient_name}`} className={iconBtn}>
            <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2} />
          </a>
        )}
        <button type="button" onClick={() => onOpen(a.id)} aria-label="Más acciones del turno" className={iconBtn}>
          <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

export function DayView({
  days,
  selectedIdx,
  onSelectDay,
  todayISO,
  nowMin,
  showFree,
  showProfessional,
  canAttend,
  canCreate,
  slotMinutes,
  selectedProfessionalId,
  onOpen,
  onNew,
  onConfirm,
  onReschedule,
  confirmingId,
}: {
  days: DayModel[];
  selectedIdx: number;
  onSelectDay: (idx: number) => void;
  todayISO: string;
  nowMin: number;
  showFree: boolean;
  showProfessional: boolean;
  canAttend: boolean;
  canCreate: boolean;
  slotMinutes: number;
  selectedProfessionalId: string | null;
  onOpen: (id: string) => void;
  onNew: (prefill: NewAppointmentPrefill) => void;
  onConfirm: (id: string) => void;
  onReschedule: (a: WeeklyAppointment) => void;
  confirmingId: string | null;
}) {
  const day = days[selectedIdx];
  const isToday = day.dateISO === todayISO;
  const professionalId = selectedProfessionalId ?? undefined;

  const newAt = (dateISO: string, startMin: number) =>
    onNew({
      date: dateISO,
      startTime: formatMinutes(startMin),
      endTime: formatMinutes(Math.min(startMin + slotMinutes, 23 * 60 + 59)),
      professionalId,
    });

  const next = isToday
    ? day.entries.find(
        (e): e is Extract<AgendaEntry, { kind: "appointment" }> =>
          e.kind === "appointment" &&
          (e.appointment.status === "in_progress" ||
            (e.appointment.status === "confirmed" && e.endMin > nowMin))
      )
    : undefined;

  const upcomingFree = showFree
    ? days
        .flatMap((d) => d.entries.filter((e) => e.kind === "free").map((e) => ({ d, e })))
        .slice(0, 4)
    : [];

  const occupancy = day.availableMinutes ? Math.round((day.busyMinutes / day.availableMinutes) * 100) : null;
  const hoursLabel = day.windows.map((w) => `${formatMinutes(w.startMin)} – ${formatMinutes(w.endMin)}`).join(", ");

  return (
    <div className="flex flex-col gap-3">
      <DayStrip days={days} selectedIdx={selectedIdx} todayISO={todayISO} onSelect={onSelectDay} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <section className="min-w-0 flex-1 rounded-card border border-border bg-white p-3 shadow-card-soft sm:p-4">
          <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
            <h2 className="text-[17px] font-extrabold tracking-[-.01em]">
              {capitalizeFirst(formatISODate(day.dateISO, { weekday: "long", day: "numeric", month: "long" }))}
            </h2>
            <span className="text-[12.5px] font-semibold text-slate-500">
              {hoursLabel ? `Atención ${hoursLabel}` : "Sin horario de atención"}
            </span>
          </header>

          {day.entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="text-[14px] font-semibold text-slate-600">
                {day.hasAttention ? "Sin turnos este día." : "No hay atención este día."}
              </p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => onNew({ date: day.dateISO, professionalId })}
                  className="flex items-center gap-1.5 rounded-[10px] border border-border bg-white px-3.5 py-2 text-[13px] font-bold text-primary transition hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                  Agendar igual
                </button>
              )}
            </div>
          ) : (
            <ol className="flex flex-col">
              {day.entries.map((e) => (
                <li key={e.key} className="flex items-center gap-3 border-b border-[#eef2f7] py-2 last:border-0 sm:gap-4">
                  <div className="w-[52px] shrink-0 sm:w-[64px]">
                    <div className={`text-[15px] font-extrabold ${e.kind === "appointment" ? "text-foreground" : "text-slate-500"}`}>
                      {formatMinutes(e.startMin)}
                    </div>
                    <div className="text-[11.5px] font-medium text-slate-500">{durationLabel(e)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {e.kind === "appointment" ? (
                      <AppointmentRow
                        entry={e}
                        day={day}
                        isToday={isToday}
                        showProfessional={showProfessional}
                        canAttend={canAttend}
                        canCreate={canCreate}
                        onOpen={onOpen}
                        onConfirm={onConfirm}
                        onReschedule={onReschedule}
                        confirmingId={confirmingId}
                      />
                    ) : e.kind === "block" ? (
                      <div className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 ${BLOCK_STYLE.card}`}>
                        <span className={`truncate text-[14px] font-bold ${BLOCK_STYLE.title}`}>{e.block.reason || "Ocupado"}</span>
                        <span className={`shrink-0 text-[12.5px] font-semibold ${BLOCK_STYLE.sub}`}>{blockLabel(e.block.source)}</span>
                      </div>
                    ) : canCreate ? (
                      <button
                        type="button"
                        onClick={() => newAt(day.dateISO, e.startMin)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left transition ${FREE_STYLE}`}
                      >
                        <span className="text-[14px] font-bold text-slate-600">
                          Libre
                          {e.endMin - e.startMin > slotMinutes && (
                            <span className="hidden sm:inline"> hasta las {formatMinutes(e.endMin)}</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5 text-[13px] font-extrabold">
                          <Plus className="h-4 w-4" strokeWidth={2.4} />
                          Agendar a las {formatMinutes(e.startMin)}
                        </span>
                      </button>
                    ) : (
                      <div className={`rounded-xl px-3.5 py-3 text-[14px] font-bold text-slate-600 ${FREE_STYLE}`}>Libre</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="flex w-full flex-col gap-3 lg:w-[300px] lg:shrink-0">
          {next && (
            <div className="rounded-card bg-[#0f172a] p-4 text-white">
              <div className="text-[11.5px] font-bold uppercase tracking-[.06em] text-slate-300">
                {next.appointment.status === "in_progress" ? "En consulta" : "Próximo"}
              </div>
              <div className="mt-1 truncate text-[18px] font-extrabold">{next.appointment.patient_name}</div>
              <div className="text-[13px] text-slate-200">
                {formatMinutes(next.startMin)}
                {next.appointment.reason ? ` · ${next.appointment.reason}` : ""}
                {next.startMin > nowMin ? ` · en ${formatHours(next.startMin - nowMin)}` : ""}
              </div>
              <Link
                href={
                  canAttend
                    ? `/patients/${next.appointment.patient_id}?tab=historia&nueva=1&turno=${next.appointment.id}`
                    : `/patients/${next.appointment.patient_id}`
                }
                className="mt-3 block rounded-[10px] bg-primary px-3 py-2.5 text-center text-[13.5px] font-extrabold text-white transition hover:brightness-[1.07]"
              >
                {canAttend ? (next.appointment.status === "in_progress" ? "Continuar consulta" : "Atender consulta") : "Ver ficha"}
              </Link>
            </div>
          )}

          <div className="rounded-card border border-border bg-white p-4 shadow-card-soft">
            <div className="mb-2.5 text-[13px] font-extrabold">Resumen del día</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[10px] bg-slate-50 p-2.5">
                <div className="text-[20px] font-extrabold">{day.confirmedCount}</div>
                <div className="text-[12px] font-medium text-slate-600">turnos</div>
              </div>
              <div className={`rounded-[10px] p-2.5 ${day.pendingCount ? "bg-orange-50" : "bg-slate-50"}`}>
                <div className={`text-[20px] font-extrabold ${day.pendingCount ? "text-orange-800" : ""}`}>{day.pendingCount}</div>
                <div className={`text-[12px] font-medium ${day.pendingCount ? "text-orange-800" : "text-slate-600"}`}>por confirmar</div>
              </div>
              <div className="rounded-[10px] bg-slate-50 p-2.5">
                <div className="text-[20px] font-extrabold">{day.freeMinutes ? formatHours(day.freeMinutes) : "—"}</div>
                <div className="text-[12px] font-medium text-slate-600">libre</div>
              </div>
              <div className="rounded-[10px] bg-slate-50 p-2.5">
                <div className="text-[20px] font-extrabold">{occupancy === null ? "—" : `${occupancy} %`}</div>
                <div className="text-[12px] font-medium text-slate-600">ocupación</div>
              </div>
            </div>
          </div>

          {canCreate && upcomingFree.length > 0 && (
            <div className="rounded-card border border-border bg-white p-4 shadow-card-soft">
              <div className="mb-2 text-[13px] font-extrabold">Próximos huecos libres</div>
              <div className="flex flex-col gap-1.5">
                {upcomingFree.map(({ d, e }) => (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => newAt(d.dateISO, e.startMin)}
                    className="flex items-center justify-between rounded-[10px] border border-border px-3 py-2 text-[13px] font-bold transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span>
                      {d.dateISO === todayISO
                        ? "Hoy"
                        : capitalizeFirst(formatISODate(d.dateISO, { weekday: "short", day: "numeric" }))}{" "}
                      · {formatMinutes(e.startMin)}
                    </span>
                    <span className="text-primary">Agendar</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
