"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { ProposedAppointment } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { confirmAppointment, rejectAppointment } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

function formatDateTime(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

// ─── Fila con botón de confirmación ─────────────────────────────────────────

function ConfirmRow({ appt }: { appt: ProposedAppointment }) {
  const router = useRouter();
  const [isConfirming, startConfirm] = useTransition();
  const [isRejecting, startReject] = useTransition();

  function handleConfirm() {
    startConfirm(async () => {
      const result = await confirmAppointment(appt.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Turno confirmado.");
      router.refresh();
    });
  }

  function handleReject() {
    startReject(async () => {
      const result = await rejectAppointment(appt.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Turno rechazado.");
      router.refresh();
    });
  }

  const busy = isConfirming || isRejecting;

  return (
    <TableRow>
      <TableCell className="font-medium">
        {appt.patient?.full_name ?? "—"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {appt.patient_national_id ?? "—"}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {appt.patient?.phone ?? "—"}
      </TableCell>
      <TableCell>{appt.professional?.full_name ?? "—"}</TableCell>
      <TableCell>
        {appt.phase_name ?? appt.treatment_type ?? "—"}
      </TableCell>
      <TableCell>{formatDateTime(appt.start_at)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleReject}
            disabled={busy}
            className="text-red-600 hover:border-red-200 hover:text-red-700"
          >
            {isRejecting ? "Rechazando…" : "Rechazar"}
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={busy}>
            {isConfirming ? "Confirmando…" : "Confirmar"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Tabla con Realtime ───────────────────────────────────────────────────────

export function ApprovalsTable({
  initialAppointments,
}: {
  initialAppointments: ProposedAppointment[];
}) {
  const router = useRouter();
  const [hasNew, setHasNew] = useState(false);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);

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
    return () => { supabase.removeChannel(channel); };
  }, [router]);

  useEffect(() => {
    setHasNew(false);
  }, [initialAppointments]);

  if (initialAppointments.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        No hay turnos pendientes de aprobación.
        {hasNew && (
          <span className="ml-2 text-xs text-slate-500">Actualizando…</span>
        )}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {hasNew && (
        <p className="text-xs text-slate-500">Actualizando bandeja…</p>
      )}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>DNI</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Profesional</TableHead>
              <TableHead>Fase / Tratamiento</TableHead>
              <TableHead>Fecha/hora</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialAppointments.map((appt) => (
              <ConfirmRow key={appt.id} appt={appt} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
