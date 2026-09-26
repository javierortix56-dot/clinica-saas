"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Calendar, Clock, Check, X, CheckCircle2, CalendarClock, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import type { ProposedAppointment } from "@/lib/supabase/server";
import { clinicDateFormatter, dateISOInTZ } from "@/lib/dates";
import { confirmAppointment, rejectAppointment } from "./actions";
import { avatarColorOf, initialsOf } from "@/lib/utils";

const dateFormatter = clinicDateFormatter({ dateStyle: "medium" });
const timeFormatter = clinicDateFormatter({ timeStyle: "short" });

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

function alternativeHref(appt: ProposedAppointment): string {
  const params = new URLSearchParams({
    nuevo: "1",
    paciente: appt.patient_id,
    fecha: dateISOInTZ(appt.start_at),
    reemplaza: appt.id,
  });
  if (appt.professional?.id) params.set("profesional", appt.professional.id);
  return `/calendar?${params.toString()}`;
}

// ─── Card ────────────────────────────────────────────────────────────────────

function ApprovalCard({
  appt,
  expired,
}: {
  appt: ProposedAppointment;
  expired: boolean;
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
      toast.success(expired ? "Solicitud descartada." : "Solicitud rechazada.");
      router.refresh();
    });
  }

  const busy = isConfirming || isRejecting;
  const name = appt.patient?.full_name ?? "—";
  const start = new Date(appt.start_at);
  const via = viaLabel(appt.origin);

  return (
    <div
      className={`rounded-card border bg-white p-4 shadow-card-soft ${expired ? "border-amber-200" : "border-border"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{ background: avatarColorOf(name) }}
        >
          {initialsOf(name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/patients/${appt.patient_id}`}
              className="text-[14.5px] font-bold leading-snug text-foreground hover:text-primary hover:underline"
            >
              {name}
            </Link>
            <span className="font-mono text-[11.5px] text-slate-400">
              {appt.patient_national_id ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-slate-50 px-2 py-[2px] text-[11px] font-semibold text-muted-foreground">
              <Clock className="h-[10px] w-[10px]" strokeWidth={2} />
              {via}
            </span>
            {expired && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-[2px] text-[11px] font-bold text-amber-800">
                Vencida
              </span>
            )}
          </div>

          <div className="mt-[5px] flex flex-wrap items-center gap-x-[6px] gap-y-[2px] text-[12px] text-muted-foreground">
            <span className="flex items-center gap-[5px]">
              <Calendar className="h-3 w-3 shrink-0 text-slate-400" strokeWidth={1.9} />
              <span className={`whitespace-nowrap font-medium ${expired ? "text-amber-700 line-through decoration-amber-400" : ""}`}>
                {dateFormatter.format(start)} · {timeFormatter.format(start)}
              </span>
            </span>
            <span className="select-none text-slate-300">·</span>
            <span>{appt.phase_name ?? appt.treatment_type ?? "Consulta"}</span>
            <span className="select-none text-slate-300">·</span>
            <span>{appt.professional?.full_name ?? "—"}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2 sm:mt-2">
        {expired ? (
          <>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-[6px] rounded-[10px] border border-border bg-white px-3 py-[9px] text-[13px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
            >
              <X className="h-[13px] w-[13px]" strokeWidth={2.2} />
              {isRejecting ? "…" : "Descartar"}
            </button>
            <Link
              href={alternativeHref(appt)}
              className="flex flex-1 items-center justify-center gap-[6px] rounded-[10px] bg-primary px-3 py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07] sm:flex-none sm:px-4"
            >
              <CalendarClock className="h-[13px] w-[13px]" strokeWidth={2.2} />
              Proponer otro horario
            </Link>
          </>
        ) : (
          <>
            <Link
              href={alternativeHref(appt)}
              className="flex flex-1 items-center justify-center rounded-[10px] border border-border bg-white px-3 py-[9px] text-[13px] font-bold text-slate-600 transition hover:bg-slate-50 sm:flex-none"
            >
              Otro horario
            </Link>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-[6px] rounded-[10px] border border-border bg-white px-3 py-[9px] text-[13px] font-bold text-[#be123c] transition hover:border-[#fecdd3] hover:bg-[#fff1f2] disabled:opacity-50 sm:flex-none sm:px-[14px]"
            >
              <X className="h-[13px] w-[13px]" strokeWidth={2.2} />
              {isRejecting ? "…" : "Rechazar"}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-[6px] rounded-[10px] bg-[#059669] px-3 py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(5,150,105,.25)] transition hover:brightness-[1.06] disabled:opacity-50 sm:flex-none sm:px-4"
            >
              <Check className="h-[13px] w-[13px]" strokeWidth={2.4} />
              {isConfirming ? "…" : "Aprobar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Lista con Realtime ───────────────────────────────────────────────────────

type Tab = "current" | "expired";

export function ApprovalsTable({
  initialAppointments,
  now,
}: {
  initialAppointments: ProposedAppointment[];
  now: number;
}) {
  const router = useRouter();
  const filterId = useId();
  const [hasNew, setHasNew] = useState(false);
  const [filterProfId, setFilterProfId] = useState<string>("all");
  const [isBulkRejecting, startBulkReject] = useTransition();

  const current = initialAppointments.filter((a) => new Date(a.start_at).getTime() >= now);
  const expired = initialAppointments.filter((a) => new Date(a.start_at).getTime() < now);
  const [tab, setTab] = useState<Tab>(current.length === 0 && expired.length > 0 ? "expired" : "current");

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    setHasNew(false);
  }, [initialAppointments]);

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

  const list = tab === "current" ? current : expired;
  const filtered =
    filterProfId === "all" ? list : list.filter((a) => a.professional?.id === filterProfId);

  function handleRejectAllExpired() {
    const targets = expired.filter(
      (a) => filterProfId === "all" || a.professional?.id === filterProfId
    );
    if (targets.length === 0) return;
    if (!window.confirm(`¿Descartar ${targets.length} solicitudes vencidas? No se puede deshacer.`)) return;
    startBulkReject(async () => {
      let failed = 0;
      for (const a of targets) {
        const result = await rejectAppointment(a.id);
        if (result.error) failed++;
      }
      if (failed > 0) {
        toast.error(`No se pudieron descartar ${failed} de ${targets.length} solicitudes.`);
      } else {
        toast.success(`${targets.length} solicitudes vencidas descartadas.`);
      }
      router.refresh();
    });
  }

  const tabBtn = (value: Tab, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-bold transition ${
        tab === value ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-[10.5px] ${
          tab === value ? "bg-white/25" : value === "expired" && count > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100"
        }`}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Estado de las solicitudes"
          className="flex w-fit overflow-hidden rounded-[10px] border border-border bg-white p-1 shadow-card-soft"
        >
          {tabBtn("current", "Vigentes", current.length)}
          {tabBtn("expired", "Vencidas", expired.length)}
        </div>

        {professionals.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor={filterId} className="text-[13px] font-medium text-muted-foreground">
              Profesional:
            </label>
            <select
              id={filterId}
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

        {tab === "expired" && expired.length > 0 && (
          <button
            type="button"
            onClick={handleRejectAllExpired}
            disabled={isBulkRejecting}
            className="ml-auto flex items-center gap-1.5 rounded-[10px] border border-border bg-white px-3 py-[7px] text-[12.5px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {isBulkRejecting ? "Descartando…" : "Descartar todas"}
          </button>
        )}
      </div>

      {hasNew && (
        <p className="text-xs font-medium text-slate-500">Actualizando bandeja…</p>
      )}

      {tab === "expired" && expired.length > 0 && (
        <p className="text-[12.5px] font-medium text-muted-foreground">
          El horario pedido ya pasó. Proponé otro horario al paciente o descartá la solicitud.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-6 text-center text-[14px] font-medium text-muted-foreground shadow-card-soft">
          {tab === "current"
            ? filterProfId === "all"
              ? "No hay solicitudes vigentes. Revisá las vencidas."
              : "Sin solicitudes vigentes para este profesional."
            : "Sin solicitudes vencidas."}
        </div>
      ) : (
        filtered.map((appt) => (
          <ApprovalCard key={appt.id} appt={appt} expired={tab === "expired"} />
        ))
      )}
    </div>
  );
}
