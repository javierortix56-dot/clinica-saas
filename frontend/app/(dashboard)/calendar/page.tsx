import Link from "next/link";
import { CheckCircle2, Clock, Activity, ChevronLeft, ChevronRight } from "lucide-react";

import {
  getWeeklyAppointments,
  getWeeklyBlocks,
  getWeeklyAvailability,
  getSessionAuth,
  isDoctorRole,
  getPatients,
  getProfessionalsForScheduling,
  getTreatmentTypeOptions,
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

// Envuelve un fetch de datos: deja pasar señales de Next.js (redirect/not-found)
// pero convierte errores de BD en un valor por defecto para que la página
// no crashee si falta una columna o tabla todavía no migrada.
function safeData<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch((e: unknown) => {
    // Next.js redirect() y notFound() lanzan objetos con `digest`. Dejarlos pasar.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error("[calendar] data-fetch error:", e);
    return fallback;
  });
}

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

  const [appointments, blocks, availability, patients, professionals, treatmentTypes] = await Promise.all([
    safeData(getWeeklyAppointments(displayedMonday), []),
    safeData(getWeeklyBlocks(displayedMonday), []),
    safeData(getWeeklyAvailability(), []),
    canCreateAppointment ? safeData(getPatients(), []) : Promise.resolve([]),
    canCreateAppointment ? safeData(getProfessionalsForScheduling(), []) : Promise.resolve([]),
    canCreateAppointment ? safeData(getTreatmentTypeOptions(), []) : Promise.resolve([]),
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
      {/* Header — título + nav en la misma fila */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-[-.02em] sm:text-[27px]">
            Calendario
          </h1>
          <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground sm:text-[14px]">
            {weekLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isCurrentWeek && (
            <Link
              href="/calendar"
              className="rounded-[10px] border border-border bg-white px-[12px] py-[7px] text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:px-[14px] sm:py-[9px] sm:text-[13px]"
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

      {/* Resumen compacto — barra horizontal única en lugar de 3 cards */}
      <div className="mb-3 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-card border border-border bg-white shadow-card-soft">
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CheckCircle2 className="h-[14px] w-[14px]" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[20px] font-extrabold leading-none tracking-[-.02em] sm:text-[22px]">
              {summary.todayCount}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.05em] text-slate-400">
              Turnos hoy
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
            <Clock className="h-[14px] w-[14px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            {summary.next ? (
              <>
                <div className="truncate text-[13px] font-bold leading-none sm:text-[14px]">
                  {summary.next.patient_name}
                </div>
                <div className="mt-0.5 text-[10px] font-medium text-slate-400">
                  {formatTime(summary.next.start_at)}
                </div>
              </>
            ) : (
              <div className="text-[11px] font-medium text-slate-400">
                Sin próximo
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600">
            <Activity className="h-[14px] w-[14px]" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[20px] font-extrabold leading-none tracking-[-.02em] sm:text-[22px]">
              {summary.remaining.length}
            </div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.05em] text-slate-400">
              Restantes
            </div>
          </div>
        </div>
      </div>

      {/* Grilla interactiva (Client Component: maneja el turno seleccionado) */}
      <CalendarGrid
        weekDays={weekDays.map(toISODate)}
        appointments={appointments}
        blocks={blocks}
        availability={availability}
        canCreateAppointment={canCreateAppointment}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name, national_id: p.national_id }))}
        professionals={professionals}
        treatmentTypes={treatmentTypes}
      />
    </div>
  );
}
