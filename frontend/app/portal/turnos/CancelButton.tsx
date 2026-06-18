"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { cancelPortalAppointment } from "./actions";

export function CancelButton({ appointmentId }: { appointmentId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCancel() {
    if (!confirm("¿Querés cancelar este turno?")) return;
    startTransition(async () => {
      const result = await cancelPortalAppointment(appointmentId);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Turno cancelado.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={isPending}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {isPending ? "Cancelando…" : "Cancelar turno"}
    </button>
  );
}
