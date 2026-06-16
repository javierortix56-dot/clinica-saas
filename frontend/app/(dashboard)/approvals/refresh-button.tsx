"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

// Polling manual: re-ejecuta el Server Component para traer turnos nuevos.
// (Sin Realtime por ahora — decisión del MVP.)
export function RefreshButton() {
  const router = useRouter();
  return (
    <Button variant="outline" size="sm" onClick={() => router.refresh()}>
      Actualizar
    </Button>
  );
}
