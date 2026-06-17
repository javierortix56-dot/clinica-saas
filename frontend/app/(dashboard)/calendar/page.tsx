import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getWeeklyAppointments, type WeeklyAppointment } from "@/lib/supabase/server";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function assertDoctorRole() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const payload = session.access_token.split(".")[1];
  const { user_role } = JSON.parse(
    Buffer.from(payload, "base64").toString("utf8")
  ) as { user_role?: string };

  if (user_role !== "doctor" && user_role !== "professional") {
    redirect("/approvals");
  }
}

// ─── Grid constants ───────────────────────────────────────────────────────────

// 08:00 – 19:30 en franjas de 30 min = 24 slots.
const SLOTS: { hour: number; minute: number }[] = [];
for (let h = 8; h <= 19; h++) {
  SLOTS.push({ hour: h, minute: 0 });
  SLOTS.push({ hour: h, minute: 30 });
}

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMondayOf(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// YYYY-MM-DD en hora local del servidor (UTC en producción).
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Lun–Sáb a partir del lunes de la semana mostrada.
function getWeekDays(monday: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => addDays(monday, i));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatSlot({ hour, minute }: { hour: number; minute: number }): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDayDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000
  );
  return `${mins} min`;
}

// ─── Cell filtering ──────────────────────────────────────────────────────────

// Localiza el start_at en Buenos Aires, lo trunca al slot de 30 min más cercano
// (floor), y compara con la celda (day, hour, minute).
function appointmentsForSlot(
  appointments: WeeklyAppointment[],
  day: Date,
  hour: number,
  minute: number
): WeeklyAppointment[] {
  return appointments.filter((a) => {
    const localStr = new Date(a.start_at).toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const local = new Date(localStr);
    const slottedMinute = Math.floor(local.getMinutes() / 30) * 30;
    return (
      local.getHours() === hour &&
      slottedMinute === minute &&
      local.toDateString() === day.toDateString()
    );
  });
}

// ─── Day state ────────────────────────────────────────────────────────────────

function isToday(date: Date): boolean {
  const today = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return (
    date.toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    }) === today
  );
}

function isSameLocalDay(iso: string, ref: Date): boolean {
  return (
    new Date(iso).toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    }) ===
    ref.toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
}

// ─── Day summary (siempre basado en "hoy", no en la semana mostrada) ──────────

interface DaySummary {
  todayCount: number;
  remaining: WeeklyAppointment[];
  next: WeeklyAppointment | null;
}

function buildDaySummary(
  appointments: WeeklyAppointment[],
  now: Date
): DaySummary {
  const todays = appointments.filter((a) => isSameLocalDay(a.start_at, now));
  const remaining = todays.filter((a) => new Date(a.start_at) >= now);
  return { todayCount: todays.length, remaining, next: remaining[0] ?? null };
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

      {/* Grilla */}
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
                        <div
                          key={a.id}
                          className="rounded border border-slate-200 bg-white px-1.5 py-1 space-y-0.5"
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
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
        </div>
      </div>
    </div>
  );
}
