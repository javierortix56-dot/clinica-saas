"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Cancela un turno del paciente vía el endpoint NestJS POST
// /portal/appointments/:id/cancel. Pasar por el backend respeta la regla de que
// los writes de turnos van por el endpoint (nunca directo a Supabase) y, además,
// elimina el evento espejo del Google Calendar del profesional. El backend
// valida la titularidad del turno con el claim patient_id del JWT.
export async function cancelPortalAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: "Sesión expirada." };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return { error: "API no configurada." };

  try {
    const res = await fetch(
      `${apiUrl}/portal/appointments/${appointmentId}/cancel`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      }
    );

    if (res.status === 404) {
      return { error: "Turno no encontrado." };
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;
      const msg = Array.isArray(body?.message)
        ? body?.message.join(" ")
        : body?.message;
      return { error: msg || `No se pudo cancelar el turno (HTTP ${res.status}).` };
    }
  } catch {
    return { error: "No se pudo conectar con el servidor." };
  }

  revalidatePath("/portal/turnos");
  return {};
}
