"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Cancela un turno confirmado. Solo escribe si el turno existe y no está
// ya cancelado (la condición extra evita sobrescribir estados terminales).
export async function cancelAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .not("status", "eq", "cancelled");

  if (error) {
    return { error: `No se pudo cancelar el turno: ${error.message}` };
  }

  revalidatePath("/calendar");
  return {};
}

// Actualiza el estado de un turno. Transiciones válidas desde la UI:
//   confirmed   → in_progress | no_show
//   in_progress → completed
export async function updateAppointmentStatus(
  appointmentId: string,
  status: "in_progress" | "completed" | "no_show"
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId);
  if (error) return { error: `No se pudo actualizar el estado: ${error.message}` };
  revalidatePath("/calendar");
  return {};
}

// Crea un turno manual (staff). El alta pasa SIEMPRE por el backend NestJS
// (/appointments/manual) — nunca directo a Supabase — para respetar la regla de
// que los writes de turnos van por el endpoint, y para que el backend sincronice
// el turno con el Google Calendar del profesional (doble vía).
export async function createManualAppointment(
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Sesión expirada." };

  const patient_id = formData.get("patient_id") as string;
  const professional_id = formData.get("professional_id") as string;
  const date = formData.get("date") as string;        // YYYY-MM-DD
  const start_time = formData.get("start_time") as string; // HH:MM
  const end_time = formData.get("end_time") as string;     // HH:MM

  if (!patient_id || !professional_id || !date || !start_time || !end_time) {
    return { error: "Todos los campos son obligatorios." };
  }

  // start_at/end_at en ISO 8601 con offset de Buenos Aires (UTC-3 fijo; Argentina
  // no observa horario de verano). Sin offset, el instante quedaría ambiguo y el
  // turno se correría respecto a la hora real de la clínica.
  const startAt = `${date}T${start_time}:00-03:00`;
  const endAt = `${date}T${end_time}:00-03:00`;

  if (endAt <= startAt) {
    return { error: "El horario de fin debe ser posterior al de inicio." };
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return { error: "API no configurada." };

  try {
    const res = await fetch(`${apiUrl}/appointments/manual`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        patientId: patient_id,
        professionalId: professional_id,
        startAt,
        endAt,
      }),
    });

    if (!res.ok) {
      // El backend devuelve { message } con el motivo (solape, etc.).
      const body = (await res.json().catch(() => null)) as
        | { message?: string | string[] }
        | null;
      const msg = Array.isArray(body?.message)
        ? body?.message.join(" ")
        : body?.message;
      return { error: msg || "No se pudo crear el turno." };
    }
  } catch {
    return { error: "Error de red al crear el turno." };
  }

  revalidatePath("/calendar");
  return {};
}
