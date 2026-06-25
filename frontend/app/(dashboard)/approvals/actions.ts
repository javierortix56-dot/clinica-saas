"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// Confirma un turno propuesto vía el endpoint NestJS POST /appointments/:id/confirm.
// Los writes de turnos pasan SIEMPRE por el backend (nunca directo a Supabase).
export async function confirmAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: "Tu sesión expiró. Volvé a iniciar sesión." };
  }

  try {
    const res = await fetch(
      `${API_URL}/appointments/${appointmentId}/confirm`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      }
    );

    if (res.status === 404) {
      return { error: "El turno no existe o ya no está disponible." };
    }

    if (!res.ok) {
      return { error: `No se pudo confirmar el turno (HTTP ${res.status}).` };
    }

    // Refresca la lista para que el turno confirmado desaparezca de la bandeja.
    revalidatePath("/approvals");
    return {};
  } catch {
    return { error: "No se pudo conectar con el servidor." };
  }
}

// Rechaza (cancela) un turno propuesto vía el endpoint NestJS POST /appointments/:id/cancel.
// Pasar por el backend garantiza que se elimine el evento de Google Calendar si existía.
export async function rejectAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: "Tu sesión expiró. Volvé a iniciar sesión." };
  }

  try {
    const res = await fetch(
      `${API_URL}/appointments/${appointmentId}/cancel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      }
    );

    if (res.status === 404) {
      return { error: "El turno no existe o ya no está disponible." };
    }

    if (!res.ok) {
      return { error: `No se pudo rechazar el turno (HTTP ${res.status}).` };
    }

    revalidatePath("/approvals");
    return {};
  } catch {
    return { error: "No se pudo conectar con el servidor." };
  }
}
