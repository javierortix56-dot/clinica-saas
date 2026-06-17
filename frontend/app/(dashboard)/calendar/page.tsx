import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getWeeklyAppointments,
  getSessionAuth,
  isDoctorRole,
} from "@/lib/supabase/server";
import { RefreshButton } from "./refresh-button";
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

// ─── Auth guard ───────────────────────────────────────────────────────────────

// El calendario es exclusivo del doctor. Sin sesión → /login; otro rol → /approvals.
async function assertDoctorRole() {
  const { hasSession, role } = await getSessionAuth();
  if (!hasSession) redirect("/login");
  if (!isDoctorRole(role)) redirect("/approvals");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await assertDoctorRole();

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

  const appointments = await getWeeklyAppointments(displayedMonday);
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

  const navLinkBase =
    "rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Calendario</h1>
          <p className="text-sm text-slate-500">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/calendar?week=${prevWeek}`} className={navLinkBase}>
            ← Anterior
          </Link>
          {!isCurrentWeek && (
            <Link href="/calendar" className={navLinkBase}>
              Hoy
            </Link>
          )}
          <Link href={`/calendar?week=${nextWeek}`} className={navLinkBase}>
            Siguiente →
          </Link>
          <RefreshButton />
        </div>
      </div>

      {/* Resumen del día actual */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Turnos hoy
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {summary.todayCount}
          </p>
          <p className="text-xs text-slate-500">confirmados</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Próximo turno
          </p>
          {summary.next ? (
            <div className="mt-1 space-y-0.5">
              <p className="truncate text-sm font-semibold text-slate-900">
                {summary.next.patient_name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {summary.next.treatment_label ?? "—"}
              </p>
              <p className="text-xs text-slate-400">
                {formatTime(summary.next.start_at)} –{" "}
                {formatTime(summary.next.end_at)}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Sin turnos pendientes</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Restantes hoy
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {summary.remaining.length}
          </p>
          <p className="text-xs text-slate-500">por atender</p>
        </div>
      </div>

      {/* Grilla interactiva (Client Component: maneja el turno seleccionado) */}
      <CalendarGrid
        weekDays={weekDays.map(toISODate)}
        appointments={appointments}
      />
    </div>
  );
}
