"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { API_URL } from "@/lib/api-url";

// Nest devuelve { message: string | string[] } en los errores HTTP.
async function backendMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message) && typeof body.message[0] === "string") {
      return body.message[0];
    }
  } catch {
    // Cuerpo vacío o no-JSON.
  }
  return null;
}

async function postAppointmentAction(
  appointmentId: string,
  action: "confirm" | "cancel",
  failureLabel: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { error: "Tu sesión expiró. Volvé a iniciar sesión." };
  }

  try {
    const res = await fetch(`${API_URL}/appointments/${appointmentId}/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    if (res.status === 404) {
      return { error: "El turno no existe o ya no está disponible." };
    }

    if (!res.ok) {
      const message = res.status === 409 ? await backendMessage(res) : null;
      return { error: message ?? `No se pudo ${failureLabel} el turno (HTTP ${res.status}).` };
    }

    // Refresca la bandeja y el contador del menú.
    revalidatePath("/approvals");
    revalidatePath("/calendar");
    return {};
  } catch {
    return { error: "No se pudo conectar con el servidor." };
  }
}

// Confirma un turno propuesto vía el endpoint NestJS POST /appointments/:id/confirm.
// Los writes de turnos pasan SIEMPRE por el backend (nunca directo a Supabase).
export async function confirmAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  return postAppointmentAction(appointmentId, "confirm", "confirmar");
}

// Rechaza (cancela) un turno propuesto vía el endpoint NestJS POST /appointments/:id/cancel.
// Pasar por el backend garantiza que se elimine el evento de Google Calendar si existía.
export async function rejectAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  return postAppointmentAction(appointmentId, "cancel", "rechazar");
}
