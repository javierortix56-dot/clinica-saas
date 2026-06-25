import Link from "next/link";
import { CheckCircle2, Clock, Activity, ChevronLeft, ChevronRight } from "lucide-react";

import {
  getWeeklyAppointments,
  getSessionAuth,
  isDoctorRole,
  getPatients,
  getProfessionalsForScheduling,
} from "@/lib/supabase/server";
import { CalendarGrid } from "./CalendarGrid";
import {
  addDays,
  buildDaySummary,
  getMondayOf,
  getWeekDays,
  toISODate,
  formatTime,
} from "./grid-utils";

export const dynamic = "force-dynamic";

// Todos los roles autenticados tienen acceso. Guard de sesión en middleware.ts.

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {

  const now = new Date();
  const currentMonday = getMondayOf(now);

  // ?week=YYYY-MM-DD — lunes de la semana a mostrar. Default: semana actual.
  const weekParam =
    typeof searchParams.week === "string" ? searchParams.week : null;
  const displayedMonday = weekParam
    ? (() => {
        const d = new Date(weekParam);
        return isNaN(d.getTime()) ? currentMonday : getMondayOf(d);
      })()
    : currentMonday;

  const { role } = await getSessionAuth();
  const canCreateAppointment = role === "admin" || role === "reception" || role === "doctor";

  const [appointments, patients, professionals] = await Promise.all([
    getWeeklyAppointments(displayedMonday),
    canCreateAppointment ? getPatients() : Promise.resolve([]),
    canCreateAppointment ? getProfessionalsForScheduling() : Promise.resolve([]),
  ]);
  const weekDays = getWeekDays(displayedMonday);

  // El resumen siempre refleja "hoy" — si se navega a otra semana muestra 0.
  const summary = buildDaySummary(appointments, now);

  // Navegación semanal
  const prevWeek = toISODate(addDays(displayedMonday, -7));
  const nextWeek = toISODate(addDays(displayedMonday, 7));
  const todayWeek = toISODate(currentMonday);
  const isCurrentWeek = toISODate(displayedMonday) === todayWeek;

  const weekLabel = `Semana del ${weekDays[0].toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  })} al ${weekDays[5].toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  })}`;

  const iconBtn =
    "flex cursor-pointer items-center px-3 py-[9px] text-slate-600 transition hover:bg-slate-50";

  return (
    <div className="mx-auto max-w-[1240px]">
      {/* Header */}
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-extrabold tracking-[-.02em]">
            Calendario
          </h1>
          <p className="mt-[9px] text-[14px] font-medium text-muted-foreground">
            {weekLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isCurrentWeek && (
            <Link
              href="/calendar"
              className="rounded-[10px] border border-border bg-white px-[14px] py-[9px] text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Hoy
            </Link>
          )}
          <div className="flex overflow-hidden rounded-[10px] border border-border bg-white">
            <Link
              href={`/calendar?week=${prevWeek}`}
              className={`${iconBtn} border-r border-border`}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </Link>
            <Link
              href={`/calendar?week=${nextWeek}`}
              className={iconBtn}
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>

      {/* Resumen del día actual */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-white px-5 py-[18px] shadow-card-soft">
          <div className="flex items-center gap-[9px] text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CheckCircle2 className="h-[14px] w-[14px]" strokeWidth={2} />
            </span>
            Turnos hoy
          </div>
          <div className="my-[14px] text-[34px] font-extrabold leading-none tracking-[-.02em]">
            {summary.todayCount}
          </div>
          <div className="text-[13px] font-medium text-slate-400">
            confirmados
          </div>
        </div>

        <div className="rounded-card border border-border bg-white px-5 py-[18px] shadow-card-soft">
          <div className="flex items-center gap-[9px] text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <Clock className="h-[14px] w-[14px]" strokeWidth={2} />
            </span>
            Próximo turno
          </div>
          {summary.next ? (
            <>
              <div className="my-[14px] truncate text-[19px] font-extrabold leading-tight">
                {summary.next.patient_name}
              </div>
              <div className="text-[13px] font-medium text-slate-400">
                {formatTime(summary.next.start_at)} ·{" "}
                {summary.next.treatment_label ?? "—"}
              </div>
            </>
          ) : (
            <div className="my-[14px] text-[15px] font-medium text-slate-400">
              Sin turnos pendientes
            </div>
          )}
        </div>

        <div className="rounded-card border border-border bg-white px-5 py-[18px] shadow-card-soft">
          <div className="flex items-center gap-[9px] text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
              <Activity className="h-[14px] w-[14px]" strokeWidth={2} />
            </span>
            Restantes hoy
          </div>
          <div className="my-[14px] text-[34px] font-extrabold leading-none tracking-[-.02em]">
            {summary.remaining.length}
          </div>
          <div className="text-[13px] font-medium text-slate-400">
            por atender
          </div>
        </div>
      </div>

      {/* Grilla interactiva (Client Component: maneja el turno seleccionado) */}
      <CalendarGrid
        weekDays={weekDays.map(toISODate)}
        appointments={appointments}
        canCreateAppointment={canCreateAppointment}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name, national_id: p.national_id }))}
        professionals={professionals}
      />
    </div>
  );
}
