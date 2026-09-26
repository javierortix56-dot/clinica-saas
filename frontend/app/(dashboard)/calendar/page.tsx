import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, List } from "lucide-react";

import {
  getWeeklyAppointments,
  getWeeklyBlocks,
  getWeeklyAvailability,
  getSessionAuth,
  isDoctorRole,
  getProfessionalsForScheduling,
  getClinicSettings,
  getCurrentProfessionalId,
} from "@/lib/supabase/server";
import { CalendarGrid } from "./CalendarGrid";
import { RememberView } from "./RememberView";
import { ProfessionalSelect } from "./ProfessionalSelect";
import {
  ALL_PROFESSIONALS,
  CALENDAR_PROF_COOKIE,
  CALENDAR_VIEW_COOKIE,
  parseCalendarView,
  type CalendarView,
} from "./view-preference";
import {
  addDaysISO,
  formatISODate,
  isISODate,
  mondayOfISO,
  todayISO,
} from "@/lib/dates";

export const dynamic = "force-dynamic";

// Todos los roles autenticados tienen acceso. Guard de sesión en middleware.ts.

const VIEWS: { value: CalendarView; label: string; Icon: typeof List }[] = [
  { value: "day", label: "Día", Icon: List },
  { value: "week", label: "Semana", Icon: CalendarDays },
  { value: "summary", label: "Resumen", Icon: LayoutGrid },
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const currentMonday = mondayOfISO(todayISO());

  // ?week=YYYY-MM-DD — cualquier día de la semana a mostrar. Default: semana actual.
  const weekParam =
    typeof searchParams.week === "string" ? searchParams.week : null;
  const displayedMonday = isISODate(weekParam) ? mondayOfISO(weekParam) : currentMonday;
  // Vista: el parámetro explícito manda; si no, la última elección guardada en
  // cookie; si tampoco, "day". Así el enlace pelado del menú (/calendar) no
  // descarta la preferencia del usuario en cada visita.
  const view =
    parseCalendarView(typeof searchParams.view === "string" ? searchParams.view : null) ??
    parseCalendarView(cookies().get(CALENDAR_VIEW_COOKIE)?.value) ??
    "day";
  const isCurrentWeek = displayedMonday === currentMonday;

  const { role } = await getSessionAuth();
  const canCreateAppointment = role === "admin" || role === "reception" || role === "doctor";
  const isDoctor = isDoctorRole(role);

  const [professionals, currentProfessionalId] = await Promise.all([
    canCreateAppointment ? getProfessionalsForScheduling() : Promise.resolve([]),
    getCurrentProfessionalId(),
  ]);

  // Selector de profesional (admin/recepción): con uno solo muestra su nombre;
  // con varios, el parámetro ?prof= manda y si no, la última elección guardada
  // en cookie. Un id que ya no es de un profesional activo vuelve a "todos".
  const showProfessionalSelect = !isDoctor && professionals.length > 0;
  const profParam =
    (typeof searchParams.prof === "string" ? searchParams.prof : null) ??
    cookies().get(CALENDAR_PROF_COOKIE)?.value ??
    ALL_PROFESSIONALS;
  const selectedProfessionalId =
    professionals.length > 1 && !isDoctor && professionals.some((p) => p.id === profParam)
      ? profParam
      : null;
  // Un único profesional a la vista: el doctor (ve lo suyo), uno elegido, o
  // una clínica con un solo profesional.
  const singleProfessional = isDoctor || selectedProfessionalId !== null || professionals.length <= 1;

  const [appointments, blocks, availability, clinicSettings] = await Promise.all([
    getWeeklyAppointments(displayedMonday, selectedProfessionalId),
    getWeeklyBlocks(displayedMonday, selectedProfessionalId),
    getWeeklyAvailability(selectedProfessionalId),
    getClinicSettings(),
  ]);
  // Lun–Sáb de la semana mostrada.
  const weekDays = Array.from({ length: 6 }, (_, i) => addDaysISO(displayedMonday, i));

  const prevWeek = addDaysISO(displayedMonday, -7);
  const nextWeek = addDaysISO(displayedMonday, 7);

  const weekLabel = `Semana del ${formatISODate(weekDays[0], {
    day: "numeric",
    month: "long",
  })} al ${formatISODate(weekDays[5], {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}`;

  // Enlaces de la agenda: conservan el profesional elegido.
  const profQS = selectedProfessionalId ? `&prof=${selectedProfessionalId}` : "";
  const calendarHref = (week: string | null, v: string) =>
    `/calendar?${week ? `week=${week}&` : ""}view=${v}${profQS}`;

  const iconBtn =
    "flex cursor-pointer items-center px-3 py-[9px] text-slate-600 transition hover:bg-slate-50";

  return (
    <div className="mx-auto max-w-[1240px]">
      <RememberView view={view} />
      {/* Header — título + nav en la misma fila */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-[-.02em] sm:text-[27px]">
            Agenda
          </h1>
          <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground sm:text-[14px]">
            {weekLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isCurrentWeek && (
            <Link
              href={calendarHref(null, view)}
              className="rounded-[10px] border border-border bg-white px-[12px] py-[7px] text-[12px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:px-[14px] sm:py-[9px] sm:text-[13px]"
            >
              Hoy
            </Link>
          )}
          <div className="flex overflow-hidden rounded-[10px] border border-border bg-white">
            <Link
              href={calendarHref(prevWeek, view)}
              className={`${iconBtn} border-r border-border`}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </Link>
            <Link
              href={calendarHref(nextWeek, view)}
              className={iconBtn}
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>

      {/* Barra de herramientas: vista + profesional */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex w-fit overflow-hidden rounded-[10px] border border-border bg-white p-1 shadow-card-soft">
          {VIEWS.map(({ value, label, Icon }) => (
            <Link
              key={value}
              href={calendarHref(displayedMonday, value)}
              aria-current={view === value ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${view === value ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </div>
        {showProfessionalSelect && (
          <ProfessionalSelect professionals={professionals} selectedId={selectedProfessionalId} />
        )}
      </div>

      <CalendarGrid
        view={view}
        weekDays={weekDays}
        nowISO={new Date().toISOString()}
        appointments={appointments}
        blocks={blocks}
        availability={availability}
        canCreateAppointment={canCreateAppointment}
        canAttend={currentProfessionalId !== null}
        singleProfessional={singleProfessional}
        professionals={professionals}
        selectedProfessionalId={selectedProfessionalId}
        defaultDurationMinutes={clinicSettings?.default_appointment_minutes ?? 30}
      />
    </div>
  );
}
