"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Clock, Check, X, CheckCircle2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { ProposedAppointment } from "@/lib/supabase/server";
import { confirmAppointment, rejectAppointment } from "./actions";

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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Mapea el origen interno a una etiqueta de vía legible para el chip.
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

// ─── Card de solicitud con acciones ─────────────────────────────────────────

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

  return (
    <div className="flex items-center gap-[18px] rounded-card border border-border bg-white px-5 py-4 shadow-card-soft">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white"
        style={{ background: AVATAR_COLORS[colorIndex % AVATAR_COLORS.length] }}
      >
        {initialsOf(name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[10px]">
          <span className="text-[15px] font-bold text-foreground">{name}</span>
          <span className="font-mono text-[12px] text-slate-400">
            {appt.patient_national_id ?? "—"}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-[7px] text-[13px] font-medium text-muted-foreground">
          <Calendar className="h-[14px] w-[14px] text-slate-400" strokeWidth={1.9} />
          {dateFormatter.format(start)} · {timeFormatter.format(start)}
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          {appt.phase_name ?? appt.treatment_type ?? "Consulta"}
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          {appt.professional?.full_name ?? "—"}
        </div>
      </div>

      <span className="inline-flex items-center gap-[6px] rounded-full border border-border bg-slate-50 px-[11px] py-[5px] text-[12px] font-semibold text-muted-foreground">
        <Clock className="h-3 w-3" strokeWidth={2} />
        {viaLabel(appt.origin)}
      </span>

      <div className="flex gap-[9px]">
        <button
          onClick={handleReject}
          disabled={busy}
          className="flex items-center gap-[6px] rounded-[10px] border border-border bg-white px-[14px] py-[9px] text-[13px] font-bold text-[#be123c] transition hover:border-[#fecdd3] hover:bg-[#fff1f2] disabled:opacity-50"
        >
          <X className="h-[14px] w-[14px]" strokeWidth={2.2} />
          {isRejecting ? "…" : "Rechazar"}
        </button>
        <button
          onClick={handleConfirm}
          disabled={busy}
          className="flex items-center gap-[6px] rounded-[10px] bg-[#059669] px-4 py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(5,150,105,.25)] transition hover:brightness-[1.06] disabled:opacity-50"
        >
          <Check className="h-[14px] w-[14px]" strokeWidth={2.4} />
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
