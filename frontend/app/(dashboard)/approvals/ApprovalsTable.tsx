"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Clock, Check, X, CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { ProposedAppointment } from "@/lib/supabase/server";
import { confirmAppointment, rejectAppointment } from "./actions";
import { initialsOf } from "@/lib/utils";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
});
const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

const AVATAR_COLORS = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#16a34a",
];

function viaLabel(origin: string | null | undefined): string {
  switch (origin) {
    case "portal":
      return "Portal web";
    case "whatsapp":
      return "WhatsApp";
    case "phone":
      return "Teléfono";
    case "assistant":
      return "Asistente";
    case "manual":
      return "Carga manual";
    default:
      return "Solicitud";
  }
}

// ─── Card ────────────────────────────────────────────────────────────────────

function ApprovalCard({
  appt,
  colorIndex,
}: {
  appt: ProposedAppointment;
  colorIndex: number;
}) {
  const router = useRouter();
  const [isConfirming, startConfirm] = useTransition();
  const [isRejecting, startReject] = useTransition();

  function handleConfirm() {
    startConfirm(async () => {
      const result = await confirmAppointment(appt.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Turno aprobado.");
      router.refresh();
    });
  }

  function handleReject() {
    startReject(async () => {
      const result = await rejectAppointment(appt.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Solicitud rechazada.");
      router.refresh();
    });
  }

  const busy = isConfirming || isRejecting;
  const name = appt.patient?.full_name ?? "—";
  const start = new Date(appt.start_at);
  const via = viaLabel(appt.origin);

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card-soft">
      {/* Fila superior: avatar + datos */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: AVATAR_COLORS[colorIndex % AVATAR_COLORS.length] }}
        >
          {initialsOf(name)}
        </span>

        <div className="min-w-0 flex-1">
          {/* Nombre + DNI + chip de vía */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[14.5px] font-bold text-foreground leading-snug">
              {name}
            </span>
            <span className="font-mono text-[11.5px] text-slate-400">
              {appt.patient_national_id ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-slate-50 px-2 py-[2px] text-[11px] font-semibold text-muted-foreground">
              <Clock className="h-[10px] w-[10px]" strokeWidth={2} />
              {via}
            </span>
          </div>

          {/* Fecha + prestación + profesional */}
          <div className="mt-[5px] flex flex-wrap items-center gap-x-[6px] gap-y-[2px] text-[12px] text-muted-foreground">
            <span className="flex items-center gap-[5px]">
              <Calendar className="h-3 w-3 shrink-0 text-slate-400" strokeWidth={1.9} />
              <span className="whitespace-nowrap font-medium">
                {dateFormatter.format(start)} · {timeFormatter.format(start)}
              </span>
            </span>
            <span className="text-slate-300 select-none">·</span>
            <span>{appt.phase_name ?? appt.treatment_type ?? "Consulta"}</span>
            <span className="text-slate-300 select-none">·</span>
            <span>{appt.professional?.full_name ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Botones — siempre debajo, full width en mobile, auto en desktop */}
      <div className="mt-3 flex gap-2 sm:mt-2">
        <button
          onClick={handleReject}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-[6px] rounded-[10px] border border-border bg-white px-3 py-[9px] text-[13px] font-bold text-[#be123c] transition hover:border-[#fecdd3] hover:bg-[#fff1f2] disabled:opacity-50 sm:flex-none sm:px-[14px]"
        >
          <X className="h-[13px] w-[13px]" strokeWidth={2.2} />
          {isRejecting ? "…" : "Rechazar"}
        </button>
        <button
          onClick={handleConfirm}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-[6px] rounded-[10px] bg-[#059669] px-3 py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(5,150,105,.25)] transition hover:brightness-[1.06] disabled:opacity-50 sm:flex-none sm:px-4"
        >
          <Check className="h-[13px] w-[13px]" strokeWidth={2.4} />
          {isConfirming ? "…" : "Aprobar"}
        </button>
      </div>
    </div>
  );
}

// ─── Lista con Realtime ───────────────────────────────────────────────────────

export function ApprovalsTable({
  initialAppointments,
}: {
  initialAppointments: ProposedAppointment[];
}) {
  const router = useRouter();
  const [hasNew, setHasNew] = useState(false);
  const [filterProfId, setFilterProfId] = useState<string>("all");
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

  const professionals = Array.from(
    new Map(
      initialAppointments
        .filter((a) => a.professional?.id)
        .map((a) => [a.professional!.id, a.professional!.full_name])
    ).entries()
  );

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("approvals-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: "status=eq.proposed",
        },
        () => {
          setHasNew(true);
          router.refresh();
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    setHasNew(false);
  }, [initialAppointments]);

  const filtered =
    filterProfId === "all"
      ? initialAppointments
      : initialAppointments.filter((a) => a.professional?.id === filterProfId);

  if (initialAppointments.length === 0) {
    return (
      <div className="rounded-card border border-border bg-white px-6 py-14 text-center shadow-card-soft">
        <div className="mx-auto mb-4 flex h-[54px] w-[54px] items-center justify-center rounded-2xl bg-emerald-50">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" strokeWidth={2} />
        </div>
        <div className="text-[17px] font-bold text-foreground">Todo al día</div>
        <div className="mt-2 text-[14px] font-medium text-slate-400">
          No hay solicitudes pendientes de aprobación.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {hasNew && (
        <p className="text-xs font-medium text-slate-500">
          Actualizando bandeja…
        </p>
      )}

      {professionals.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-[13px] font-medium text-muted-foreground">
            Profesional:
          </label>
          <select
            value={filterProfId}
            onChange={(e) => setFilterProfId(e.target.value)}
            className="rounded-[10px] border border-border bg-white px-3 py-[7px] text-[13px] font-medium outline-none focus:border-primary"
          >
            <option value="all">Todos</option>
            {professionals.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-6 text-center text-[14px] font-medium text-muted-foreground shadow-card-soft">
          Sin solicitudes para este profesional.
        </div>
      ) : (
        filtered.map((appt, i) => (
          <ApprovalCard key={appt.id} appt={appt} colorIndex={i} />
        ))
      )}
    </div>
  );
}
