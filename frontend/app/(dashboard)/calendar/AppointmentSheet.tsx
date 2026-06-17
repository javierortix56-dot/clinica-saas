"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Lock, PlayCircle, Phone, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { addDays, formatDuration, formatTime } from "./grid-utils";
import { cancelAppointment } from "./actions";

const TZ = "America/Argentina/Buenos_Aires";

// ─── Tipos de filas crudas ─────────────────────────────────────────────────────

type ApptStatus =
  | "proposed"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

interface ApptRow {
  id: string;
  start_at: string;
  end_at: string;
  status: ApptStatus;
  treatment_id: string | null;
  phase_template_id: string | null;
  patient_id: string;
  patients: {
    id: string;
    full_name: string;
    phone: string | null;
    national_id: string;
  } | null;
  treatments: {
    id: string;
    treatment_type_id: string;
    treatment_types: { name: string } | null;
  } | null;
  treatment_phase_templates: {
    id: string;
    treatment_type_id: string;
    name: string;
  } | null;
}

interface PhaseRow {
  id: string;
  sequence_order: number;
  name: string;
  phase_kind: "clinical" | "lab_wait";
  duration_minutes: number | null;
  cooldown_days: number;
}

interface HistoryRow {
  id: string;
  start_at: string;
  status: ApptStatus;
  phase_template_id: string | null;
  treatment_phase_templates: { name: string } | null;
}

// ─── Cálculo de estado de fases (puro) ──────────────────────────────────────────

type PhaseState = "active" | "completed" | "blocked" | "pending";

interface PhaseView {
  id: string;
  name: string;
  phase_kind: "clinical" | "lab_wait";
  duration_minutes: number | null;
  cooldown_days: number;
  state: PhaseState;
  availableFrom: string | null;
}

const COMPLETED_STATUSES: ApptStatus[] = ["confirmed", "completed"];
const REALIZED_STATUSES: ApptStatus[] = ["confirmed", "completed", "in_progress"];

function lastRealizedForPhase(
  history: HistoryRow[],
  phaseId: string
): HistoryRow | null {
  const matches = history.filter(
    (h) =>
      h.phase_template_id === phaseId && REALIZED_STATUSES.includes(h.status)
  );
  if (matches.length === 0) return null;
  return matches.reduce((a, b) =>
    new Date(a.start_at) >= new Date(b.start_at) ? a : b
  );
}

export function computePhaseViews(
  activePhaseId: string | null,
  phases: PhaseRow[],
  history: HistoryRow[],
  now: Date
): PhaseView[] {
  return phases.map((p, i) => {
    let state: PhaseState;
    let availableFrom: string | null = null;

    if (activePhaseId && p.id === activePhaseId) {
      state = "active";
    } else if (
      history.some(
        (h) =>
          h.phase_template_id === p.id &&
          COMPLETED_STATUSES.includes(h.status)
      )
    ) {
      state = "completed";
    } else {
      const prev = phases[i - 1];
      let blocked = false;
      if (prev && prev.cooldown_days > 0) {
        const prevAppt = lastRealizedForPhase(history, prev.id);
        if (prevAppt) {
          const available = addDays(
            new Date(prevAppt.start_at),
            prev.cooldown_days
          );
          if (now < available) {
            blocked = true;
            availableFrom = available.toISOString();
          }
        }
      }
      state = blocked ? "blocked" : "pending";
    }

    return {
      id: p.id,
      name: p.name,
      phase_kind: p.phase_kind,
      duration_minutes: p.duration_minutes,
      cooldown_days: p.cooldown_days,
      state,
      availableFrom,
    };
  });
}

// ─── Formatters locales ─────────────────────────────────────────────────────────

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

const STATUS_LABELS: Record<ApptStatus, string> = {
  proposed: "propuesto",
  confirmed: "confirmado",
  in_progress: "en curso",
  completed: "completado",
  cancelled: "cancelado",
  no_show: "ausente",
};

const PHASE_KIND_LABELS: Record<PhaseRow["phase_kind"], string> = {
  clinical: "clínica",
  lab_wait: "laboratorio",
};

// ─── Sub-componentes de UI ──────────────────────────────────────────────────────

function PhaseIcon({ state }: { state: PhaseState }) {
  switch (state) {
    case "completed":
      return <Check className="h-4 w-4 text-slate-400" />;
    case "active":
      return <PlayCircle className="h-4 w-4 text-slate-900" />;
    case "blocked":
      return <Lock className="h-4 w-4 text-amber-600" />;
    default:
      return <Circle className="h-4 w-4 text-slate-300" />;
  }
}

const PHASE_STATE_LABELS: Record<PhaseState, string> = {
  active: "en curso",
  completed: "completada",
  blocked: "bloqueada",
  pending: "pendiente",
};

function PhaseTimeline({ phases, has3D }: { phases: PhaseView[]; has3D: boolean }) {
  if (phases.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Este turno no está asociado a un tratamiento con fases.
      </p>
    );
  }
  return (
    <ol className="space-y-0">
      {phases.map((p, i) => {
        const isLast = i === phases.length - 1;
        const durationLabel =
          p.duration_minutes != null
            ? `${p.duration_minutes} min`
            : p.cooldown_days > 0
              ? `espera ${p.cooldown_days} d`
              : "—";
        return (
          <li key={p.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-6 w-6 items-center justify-center">
                <PhaseIcon state={p.state} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-slate-200" />}
            </div>
            <div className={`flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-sm font-medium ${p.state === "active" ? "text-slate-900" : "text-slate-700"}`}>
                  {p.name}
                </p>
                <span className={`text-xs ${p.state === "blocked" ? "text-amber-600" : p.state === "active" ? "text-slate-900" : "text-slate-400"}`}>
                  {PHASE_STATE_LABELS[p.state]}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {PHASE_KIND_LABELS[p.phase_kind]} · {durationLabel}
              </p>
              {p.state === "active" && has3D && (
                <p className="mt-0.5 text-xs font-medium text-amber-600">
                  +15 min (escaneo 3D)
                </p>
              )}
              {p.state === "blocked" && p.availableFrom && (
                <p className="mt-0.5 text-xs text-amber-600">
                  Disponible desde {formatShortDate(p.availableFrom)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HistoryList({ history }: { history: HistoryRow[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-slate-400">Sin turnos previos.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {history.map((h) => (
        <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-500">{formatShortDate(h.start_at)}</span>
          <span className="flex-1 truncate text-slate-700">
            {h.treatment_phase_templates?.name ?? "—"}
          </span>
          <span className="text-xs text-slate-400">{STATUS_LABELS[h.status]}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
      {children}
    </p>
  );
}

// ─── Estado del fetch ───────────────────────────────────────────────────────────

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      appt: ApptRow;
      treatmentName: string | null;
      phases: PhaseRow[];
      history: HistoryRow[];
      noShowCount: number;
    };

// ─── Componente principal ───────────────────────────────────────────────────────

export function AppointmentSheet({
  appointmentId,
  open,
  onOpenChange,
}: {
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    if (!appointmentId || !open) return;
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      const supabase = createClient();

      const { data: apptData, error } = await supabase
        .from("appointments")
        .select(
          `
            id, start_at, end_at, status, treatment_id, phase_template_id, patient_id,
            patients ( id, full_name, phone, national_id ),
            treatments ( id, treatment_type_id, treatment_types ( name ) ),
            treatment_phase_templates ( id, treatment_type_id, name )
          `
        )
        .eq("id", appointmentId)
        .single();

      if (cancelled) return;
      if (error || !apptData) {
        setState({ status: "error" });
        return;
      }

      const appt = apptData as unknown as ApptRow;
      const treatmentTypeId =
        appt.treatments?.treatment_type_id ??
        appt.treatment_phase_templates?.treatment_type_id ??
        null;
      const treatmentName = appt.treatments?.treatment_types?.name ?? null;

      const phasesPromise = treatmentTypeId
        ? supabase
            .from("treatment_phase_templates")
            .select("id, sequence_order, name, phase_kind, duration_minutes, cooldown_days")
            .eq("treatment_type_id", treatmentTypeId)
            .order("sequence_order", { ascending: true })
        : Promise.resolve({ data: [] as PhaseRow[] });

      const historyBase = supabase
        .from("appointments")
        .select("id, start_at, status, phase_template_id, treatment_phase_templates ( name )")
        .order("start_at", { ascending: false });
      const historyPromise = appt.treatment_id
        ? historyBase.eq("treatment_id", appt.treatment_id)
        : historyBase.eq("patient_id", appt.patient_id);

      const noShowPromise = supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", appt.patient_id)
        .eq("status", "no_show");

      const [phasesRes, historyRes, noShowRes] = await Promise.all([
        phasesPromise,
        historyPromise,
        noShowPromise,
      ]);

      if (cancelled) return;
      setState({
        status: "ready",
        appt,
        treatmentName,
        phases: (phasesRes.data ?? []) as unknown as PhaseRow[],
        history: (historyRes.data ?? []) as unknown as HistoryRow[],
        noShowCount: noShowRes.count ?? 0,
      });
    })();

    return () => { cancelled = true; };
  }, [appointmentId, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        {state.status === "loading" || state.status === "idle" ? (
          <SheetLoading />
        ) : state.status === "error" ? (
          <SheetError />
        ) : (
          <SheetReady
            state={state}
            onClose={() => onOpenChange(false)}
            onCancelled={() => setState({ status: "idle" })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Vistas por estado ──────────────────────────────────────────────────────────

function SheetLoading() {
  return (
    <>
      <SheetHeader className="border-b border-slate-200 p-6">
        <SheetTitle className="sr-only">Cargando turno</SheetTitle>
        <div className="space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
        </div>
      </SheetHeader>
      <div className="space-y-3 p-6">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
      </div>
    </>
  );
}

function SheetError() {
  return (
    <>
      <SheetHeader className="border-b border-slate-200 p-6">
        <SheetTitle>Error</SheetTitle>
      </SheetHeader>
      <div className="p-6">
        <p className="text-sm text-slate-500">
          No se pudo cargar el detalle del turno.
        </p>
      </div>
    </>
  );
}

function SheetReady({
  state,
  onClose,
  onCancelled,
}: {
  state: Extract<LoadState, { status: "ready" }>;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const router = useRouter();
  const [isCancelling, startCancelling] = useTransition();
  const { appt, treatmentName, phases, history, noShowCount } = state;
  const now = new Date();

  const patientName = appt.patients?.full_name ?? "Paciente";
  const phaseViews = computePhaseViews(appt.phase_template_id, phases, history, now);
  const has3D = phases.some((p) => /3d|escaneo/i.test(p.name));

  // Próxima fase disponible: fase siguiente a la activa con cooldown de la activa
  const activeIdx = phaseViews.findIndex((p) => p.state === "active");
  const activePhase = activeIdx !== -1 ? phases[activeIdx] : null;
  const nextPhase = activeIdx !== -1 ? phases[activeIdx + 1] : null;
  const nextAvailableFrom =
    activePhase && activePhase.cooldown_days > 0
      ? addDays(new Date(appt.start_at), activePhase.cooldown_days).toISOString()
      : null;

  function handleCancel() {
    startCancelling(async () => {
      const result = await cancelAppointment(appt.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Turno cancelado.");
      router.refresh();
      onCancelled();
      onClose();
    });
  }

  return (
    <>
      <SheetHeader className="border-b border-slate-200 p-6">
        <div className="flex items-start justify-between gap-2 pr-6">
          <SheetTitle>{patientName}</SheetTitle>
          {noShowCount >= 2 && (
            <Badge variant="destructive">Restricción prime time</Badge>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {formatFullDate(appt.start_at)} · {formatTime(appt.start_at)}–
          {formatTime(appt.end_at)} · {formatDuration(appt.start_at, appt.end_at)}
        </p>
        {appt.patients?.phone && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Phone className="h-3 w-3" />
            {appt.patients.phone}
          </p>
        )}
        {appt.patients?.national_id && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <CreditCard className="h-3 w-3" />
            DNI {appt.patients.national_id}
          </p>
        )}
      </SheetHeader>

      <div className="space-y-6 p-6">
        {/* Fases del tratamiento */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Fases del tratamiento</SectionTitle>
            {treatmentName && (
              <span className="text-xs text-slate-400">{treatmentName}</span>
            )}
          </div>
          <PhaseTimeline phases={phaseViews} has3D={has3D} />
        </section>

        {/* Próxima fase disponible */}
        {nextPhase && nextAvailableFrom && (
          <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <SectionTitle>Próxima fase disponible</SectionTitle>
            <p className="text-sm font-medium text-slate-700">{nextPhase.name}</p>
            <p className="text-xs text-amber-700">
              Disponible desde {formatShortDate(nextAvailableFrom)}
            </p>
          </section>
        )}

        {/* Historial */}
        <section className="space-y-3">
          <SectionTitle>Historial</SectionTitle>
          <HistoryList history={history} />
        </section>

        {/* Cancelar turno */}
        {appt.status !== "cancelled" && appt.status !== "completed" && (
          <section className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isCancelling}
              className="w-full text-slate-500 hover:text-red-600 hover:border-red-200"
            >
              {isCancelling ? "Cancelando…" : "Cancelar turno"}
            </Button>
          </section>
        )}
      </div>
    </>
  );
}
