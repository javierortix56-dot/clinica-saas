"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { cancelPortalAppointment } from "./actions";

export function CancelButton({ appointmentId }: { appointmentId: string }) {
  const [done, setDone] = useState(false);
  const router = useRouter();

  // Feedback instantáneo: el botón se desactiva al confirmar y el progreso
  // llega por un toast (loading → éxito/error). Si el server rechaza, el botón
  // se reactiva y la lista no cambió (el refresh solo corre en éxito).
  function handleCancel() {
    if (!confirm("¿Querés cancelar este turno?")) return;
    setDone(true);
    toast.promise(
      cancelPortalAppointment(appointmentId).then((result) => {
        if (result.error) {
          setDone(false);
          throw new Error(result.error);
        }
        router.refresh();
      }),
      {
        loading: "Cancelando turno…",
        success: "Turno cancelado.",
        error: (e: Error) => e.message,
      }
    );
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={done}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      Cancelar turno
    </button>
  );
}
