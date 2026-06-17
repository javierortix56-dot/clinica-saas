import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getWeeklyAppointments, type WeeklyAppointment } from "@/lib/supabase/server";
import { RefreshButton } from "./refresh-button";

export const dynamic = "force-dynamic";

// Guard de rol: esta página es exclusiva del doctor.
// Admin/reception no deben llegar aquí (el layout los redirige a /approvals),
// pero si llegaran directamente van a /approvals.
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

// ─── Helpers de grilla ───────────────────────────────────────────────────────

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function getWeekDays(): Date[] {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function appointmentsForCell(
  appointments: WeeklyAppointment[],
  day: Date,
  hour: number
): WeeklyAppointment[] {
  return appointments.filter((a) => {
    const start = new Date(a.start_at);
    const localHour = new Date(start.toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })).getHours();
    const localDay = new Date(start.toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })).toDateString();
    return localHour === hour && localDay === day.toDateString();
  });
}

function formatDayDate(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function isToday(date: Date): boolean {
  const today = new Date().toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const d = date.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  return today === d;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function CalendarPage() {
  await assertDoctorRole();

  const appointments = await getWeeklyAppointments();
  const weekDays = getWeekDays();

  const now = new Date();
  const weekLabel = `Semana del ${weekDays[0].toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  })} al ${weekDays[6].toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Calendario</h1>
          <p className="text-sm text-slate-500">{weekLabel}</p>
        </div>
        <RefreshButton />
      </div>

      {appointments.length === 0 && (
        <p className="text-sm text-slate-500 py-2">
          No hay turnos confirmados esta semana.
        </p>
      )}

      {/* Grilla */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <div
          className="grid min-w-[640px]"
          style={{ gridTemplateColumns: "3.5rem repeat(7, 1fr)" }}
        >
          {/* Header */}
          <div className="border-b border-slate-200 bg-slate-50" />
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={`border-b border-l border-slate-200 bg-slate-50 px-2 py-2 text-center ${
                isToday(day) ? "bg-slate-100" : ""
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
                  isToday(day) ? "font-semibold text-slate-900" : "text-slate-400"
                }`}
              >
                {formatDayDate(day)}
              </p>
            </div>
          ))}

          {/* Filas de horas */}
          {HOURS.map((hour) => (
            <>
              {/* Etiqueta de hora */}
              <div
                key={`h-${hour}`}
                className="border-b border-slate-100 py-2 pr-2 text-right"
              >
                <span className="text-xs text-slate-400">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>

              {/* Celdas de cada día */}
              {weekDays.map((day, di) => {
                const cellAppts = appointmentsForCell(appointments, day, hour);
                return (
                  <div
                    key={`${hour}-${di}`}
                    className="min-h-[3.5rem] border-b border-l border-slate-100 p-1 space-y-1"
                  >
                    {cellAppts.map((a) => (
                      <div
                        key={a.id}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 space-y-0.5"
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
                          {formatTime(a.start_at)} – {formatTime(a.end_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
