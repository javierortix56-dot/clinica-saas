"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import type {
  WeeklyAppointment,
  WeeklyBlock,
  AvailabilityWindow,
  ProfessionalForScheduling,
  TreatmentTypeOption,
} from "@/lib/supabase/server";
import type { Patient } from "@clinica/shared";
import { dateISOInTZ } from "@/lib/dates";
import { buildWeekModel, formatHours, minutesInTZ, weekRange } from "./agenda-model";
import { DayView, type NewAppointmentPrefill } from "./DayView";
import { WeekView } from "./WeekView";
import { SummaryView } from "./SummaryView";
import { AppointmentSheet } from "./AppointmentSheet";
import { ManualAppointmentSheet } from "./ManualAppointmentSheet";
import { confirmAppointment } from "../approvals/actions";
import type { CalendarView } from "./view-preference";

// Parámetros de "abrir formulario con contexto" que se consumen una sola vez.
const PREFILL_PARAMS = ["nuevo", "paciente", "fecha", "profesional", "reemplaza"];
const RANGE_KEY = "agenda-rango";

// "Ahora" arranca con el valor del servidor (misma primera pintura en server y
// cliente) y se actualiza cada minuto.
function useNow(initialISO: string): Date {
  const [now, setNow] = useState(() => new Date(initialISO));
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function CalendarGrid({
  view,
  weekDays,
  nowISO,
  appointments,
  blocks,
  availability,
  canCreateAppointment,
  canAttend,
  singleProfessional,
  patients,
  professionals,
  selectedProfessionalId = null,
  treatmentTypes = [],
  defaultDurationMinutes = 30,
}: {
  view: CalendarView;
  weekDays: string[];
  nowISO: string;
  appointments: WeeklyAppointment[];
  blocks: WeeklyBlock[];
  availability: AvailabilityWindow[];
  canCreateAppointment: boolean;
  // El usuario tiene perfil profesional: puede iniciar la consulta.
  canAttend: boolean;
  // Un único profesional a la vista: se muestran huecos libres y no hace
  // falta el nombre del profesional en cada turno.
  singleProfessional: boolean;
  patients: Pick<Patient, "id" | "full_name" | "national_id">[];
  professionals: ProfessionalForScheduling[];
  selectedProfessionalId?: string | null;
  treatmentTypes?: TreatmentTypeOption[];
  defaultDurationMinutes?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = useNow(nowISO);
  const todayISO = dateISOInTZ(now);
  const nowMin = minutesInTZ(now);
  const slotMinutes = defaultDurationMinutes;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newApptOpen, setNewApptOpen] = useState(false);
  const [prefill, setPrefill] = useState<NewAppointmentPrefill>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<"fit" | "full">("fit");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(RANGE_KEY) === "full") setRangeMode("full");
    } catch {
      // Sin almacenamiento: queda "ajustado".
    }
  }, []);
  function changeRange(mode: "fit" | "full") {
    setRangeMode(mode);
    try {
      window.localStorage.setItem(RANGE_KEY, mode);
    } catch {
      // Preferencia solo de esta sesión.
    }
  }

  const days = useMemo(
    () =>
      buildWeekModel({
        days: weekDays,
        appointments,
        blocks,
        availability,
        now,
        slotMinutes,
        showFree: singleProfessional,
      }),
    [appointments, availability, blocks, now, singleProfessional, slotMinutes, weekDays]
  );

  // Día de la vista "Día": ?dia=N, hoy si cae en la semana, o el primer día con
  // atención (no un lunes vacío).
  const diaParam = searchParams.get("dia");
  function initialDayIdx(): number {
    const dia = Number(diaParam);
    if (diaParam !== null && Number.isInteger(dia) && dia >= 0 && dia <= 5) return dia;
    const todayIdx = weekDays.indexOf(todayISO);
    if (todayIdx >= 0) return todayIdx;
    const firstWithAttention = days.findIndex((d) => d.hasAttention);
    return firstWithAttention >= 0 ? firstWithAttention : 0;
  }
  const [dayIdx, setDayIdx] = useState(initialDayIdx);
  useEffect(() => {
    setDayIdx(initialDayIdx());
    // Solo al cambiar de semana o de ?dia=; el día elegido dentro de la semana se conserva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays[0], diaParam]);

  // ?nuevo=1 abre el formulario con el contexto recibido.
  useEffect(() => {
    if (!canCreateAppointment || searchParams.get("nuevo") !== "1") return;
    setPrefill({
      patientId: searchParams.get("paciente") ?? undefined,
      professionalId: searchParams.get("profesional") ?? selectedProfessionalId ?? undefined,
      date: searchParams.get("fecha") ?? undefined,
      replacesAppointmentId: searchParams.get("reemplaza") ?? undefined,
    });
    setNewApptOpen(true);
    const rest = new URLSearchParams(searchParams.toString());
    PREFILL_PARAMS.forEach((k) => rest.delete(k));
    const qs = rest.toString();
    window.history.replaceState(null, "", qs ? `/calendar?${qs}` : "/calendar");
  }, [canCreateAppointment, searchParams, selectedProfessionalId]);

  function openNew(p: NewAppointmentPrefill) {
    setPrefill(p);
    setNewApptOpen(true);
  }

  async function confirm(id: string) {
    setConfirmingId(id);
    const result = await confirmAppointment(id);
    setConfirmingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Turno confirmado.");
    router.refresh();
  }

  function reschedule(a: WeeklyAppointment) {
    openNew({
      patientId: a.patient_id,
      professionalId: a.professional_id ?? undefined,
      date: dateISOInTZ(a.start_at),
      replacesAppointmentId: a.id,
    });
  }

  function goToDay(idx: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "day");
    params.set("dia", String(idx));
    router.push(`/calendar?${params.toString()}`, { scroll: false });
  }

  const totals = days.reduce(
    (t, d) => ({
      confirmed: t.confirmed + d.confirmedCount,
      pending: t.pending + d.pendingCount,
      free: t.free + d.freeMinutes,
    }),
    { confirmed: 0, pending: 0, free: 0 }
  );
  const weekStats = [
    `${totals.confirmed} ${totals.confirmed === 1 ? "turno" : "turnos"}`,
    totals.pending ? `${totals.pending} por confirmar` : null,
    singleProfessional && totals.free ? `${formatHours(totals.free)} libres` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const common = {
    todayISO,
    slotMinutes,
    showProfessional: !singleProfessional,
    selectedProfessionalId,
    onOpen: setSelectedId,
    onNew: openNew,
  };

  return (
    <>
      {view === "day" ? (
        <DayView
          {...common}
          days={days}
          selectedIdx={dayIdx}
          onSelectDay={setDayIdx}
          nowMin={nowMin}
          showFree={singleProfessional}
          canAttend={canAttend}
          canCreate={canCreateAppointment}
          onConfirm={confirm}
          onReschedule={reschedule}
          confirmingId={confirmingId}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-slate-600">Semana: {weekStats}</p>
          {view === "week" ? (
            <WeekView
              {...common}
              days={days}
              range={weekRange(days, rangeMode)}
              rangeMode={rangeMode}
              onRangeMode={changeRange}
              nowMin={nowMin}
              canCreate={canCreateAppointment}
              onGoToDay={goToDay}
            />
          ) : (
            <SummaryView {...common} days={days} canCreate={canCreateAppointment} onGoToDay={goToDay} />
          )}
        </div>
      )}

      <AppointmentSheet
        appointmentId={selectedId}
        open={selectedId !== null}
        onOpenChange={(o) => { if (!o) setSelectedId(null); }}
      />

      <ManualAppointmentSheet
        open={newApptOpen}
        onOpenChange={setNewApptOpen}
        patients={patients}
        professionals={professionals}
        treatmentTypes={treatmentTypes}
        initialPatientId={prefill.patientId}
        initialProfessionalId={prefill.professionalId}
        replacesAppointmentId={prefill.replacesAppointmentId}
        initialDate={prefill.date}
        initialStartTime={prefill.startTime}
        initialEndTime={prefill.endTime}
        defaultDurationMinutes={defaultDurationMinutes}
      />
    </>
  );
}
