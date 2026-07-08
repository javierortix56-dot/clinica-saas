import Link from "next/link";
import {
  Calendar,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock,
  Users,
} from "lucide-react";

import { getTodayOverview, type WeeklyAppointment } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/empty-state";
import { avatarColorOf, initialsOf } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TZ = "America/Argentina/Buenos_Aires";

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TZ,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TZ,
});

function StatTile({
  href,
  icon: Icon,
  label,
  value,
  accent,
}: {
  href: string;
  icon: typeof Calendar;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-card border bg-white p-4 shadow-card-soft transition hover:shadow-card ${
        accent ? "border-amber-300 bg-amber-50/60" : "border-border"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
          accent ? "bg-amber-100 text-amber-600" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[22px] font-extrabold leading-none tracking-[-.02em]">
          {value}
        </p>
        <p className="mt-1 truncate text-[12.5px] font-semibold text-muted-foreground">
          {label}
        </p>
      </div>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-400" />
    </Link>
  );
}

function AgendaRow({
  appt,
  state,
}: {
  appt: WeeklyAppointment;
  state: "past" | "next" | "upcoming";
}) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${
        state === "past" ? "opacity-45" : ""
      } ${state === "next" ? "bg-primary/[.04]" : ""}`}
    >
      <div className="w-[88px] shrink-0 text-[13px] font-bold tabular-nums text-foreground">
        {timeFormatter.format(new Date(appt.start_at))}
        <span className="font-medium text-muted-foreground">
          {" – "}
          {timeFormatter.format(new Date(appt.end_at))}
        </span>
      </div>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{ backgroundColor: avatarColorOf(appt.patient_name) }}
      >
        {initialsOf(appt.patient_name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold">{appt.patient_name}</p>
        <p className="truncate text-[12px] font-medium text-muted-foreground">
          {[appt.treatment_label ?? appt.reason, appt.professional_name]
            .filter(Boolean)
            .join(" · ") || "Consulta"}
        </p>
      </div>
      {state === "next" && (
        <span className="shrink-0 rounded-full bg-primary/10 px-[10px] py-[3px] text-[11px] font-bold text-primary">
          Próximo
        </span>
      )}
    </li>
  );
}

export default async function HomePage() {
  const { appointments, approvalsCount, newPatientsWeek } =
    await getTodayOverview();

  const now = Date.now();
  // Primer turno que todavía no terminó: se resalta como "Próximo".
  const nextIdx = appointments.findIndex(
    (a) => new Date(a.end_at).getTime() > now
  );
  const remaining =
    nextIdx === -1 ? 0 : appointments.length - nextIdx;

  const todayLabel = dateFormatter.format(new Date());

  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-.02em] sm:text-[24px]">
            Hoy
          </h1>
          <p className="mt-1 text-[13px] font-medium capitalize text-muted-foreground sm:text-[14px]">
            {todayLabel}
          </p>
        </div>
        <Link
          href="/calendar"
          className="flex items-center gap-[7px] rounded-[10px] bg-primary px-4 py-[10px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07]"
        >
          <CalendarPlus className="h-[15px] w-[15px]" strokeWidth={2.4} />
          Ir al calendario
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          href="/calendar"
          icon={Calendar}
          label={
            remaining > 0
              ? `Turnos hoy · ${remaining} por atender`
              : "Turnos hoy"
          }
          value={appointments.length}
        />
        <StatTile
          href="/approvals"
          icon={CheckCircle2}
          label="Solicitudes por aprobar"
          value={approvalsCount}
          accent={approvalsCount > 0}
        />
        <StatTile
          href="/patients"
          icon={Users}
          label="Pacientes nuevos (7 días)"
          value={newPatientsWeek}
        />
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-white shadow-card-soft">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-[14px] font-extrabold tracking-[-.01em]">
            <Clock className="h-4 w-4 text-primary" strokeWidth={2.2} />
            Agenda de hoy
          </h2>
          <Link
            href="/calendar"
            className="text-[12.5px] font-bold text-primary hover:underline"
          >
            Ver semana
          </Link>
        </div>

        {appointments.length === 0 ? (
          <div className="border-0 p-2 [&>div]:border-0 [&>div]:shadow-none">
            <EmptyState
              icon={Calendar}
              title="Sin turnos para hoy"
              description="Cuando se agenden turnos para hoy, van a aparecer acá."
            />
          </div>
        ) : (
          <ul className="divide-y divide-[#eef2f7]">
            {appointments.map((appt, i) => (
              <AgendaRow
                key={appt.id}
                appt={appt}
                state={
                  nextIdx === -1 || i < nextIdx
                    ? "past"
                    : i === nextIdx
                      ? "next"
                      : "upcoming"
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
