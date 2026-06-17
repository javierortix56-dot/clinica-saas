"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "@clinica/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { confirmAppointment } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

function formatDateTime(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

// ─── Fila con botón de confirmación ─────────────────────────────────────────

function ConfirmRow({ appt }: { appt: Appointment }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await confirmAppointment(appt.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableRow key={appt.id}>
      <TableCell className="font-medium">
        {appt.patient?.full_name ?? "—"}
        {appt.patient?.phone && (
          <span className="block text-xs text-muted-foreground">
            {appt.patient.phone}
          </span>
        )}
      </TableCell>
      <TableCell>{appt.professional?.full_name ?? "—"}</TableCell>
      <TableCell>{appt.treatment_type ?? "—"}</TableCell>
      <TableCell>{formatDateTime(appt.start_at)}</TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" onClick={handleClick} disabled={isPending}>
            {isPending ? "Confirmando…" : "Confirmar"}
          </Button>
          {error && (
            <span className="text-xs text-destructive" role="alert">
              {error}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Tabla con Realtime ───────────────────────────────────────────────────────

// Recibe los turnos iniciales del Server Component. Suscribe al canal Realtime
// de la tabla `appointments` para detectar inserts/updates en `proposed` y
// llama router.refresh() para que Next.js re-fetche los datos del servidor.
// Esto evita polling y mantiene la bandeja al día sin intervención del usuario.
export function ApprovalsTable({
  initialAppointments,
}: {
  initialAppointments: Appointment[];
}) {
  const router = useRouter();
  // Indicador de "nuevo turno recibido por Realtime" — desaparece al refrescar.
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
          // Re-fetcha los datos del servidor silenciosamente, con un pequeño
          // indicador visual para que el usuario sepa que llegó algo nuevo.
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

  // Cuando la lista se actualiza (router.refresh() trigger → nuevo render
  // del server), limpiamos el indicador.
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
              <TableHead>Profesional</TableHead>
              <TableHead>Tratamiento</TableHead>
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
