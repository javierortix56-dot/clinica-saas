"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Decodifica clinic_id del JWT (igual que requireAdmin en settings/actions.ts).
async function getClinicId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
    ) as { clinic_id?: string };
    return payload.clinic_id ?? null;
  } catch {
    return null;
  }
}

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

// Crea un turno manual (staff). El turno se inserta directamente como confirmed
// (no pasa por la cola de aprobaciones).
export async function createManualAppointment(
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createClient();
  const clinicId = await getClinicId();
  if (!clinicId) return { error: "Sesión expirada." };

  const patient_id = formData.get("patient_id") as string;
  const professional_id = formData.get("professional_id") as string;
  const date = formData.get("date") as string;        // YYYY-MM-DD
  const start_time = formData.get("start_time") as string; // HH:MM
  const end_time = formData.get("end_time") as string;     // HH:MM

  if (!patient_id || !professional_id || !date || !start_time || !end_time) {
    return { error: "Todos los campos son obligatorios." };
  }

  const start_at = `${date}T${start_time}:00`;
  const end_at = `${date}T${end_time}:00`;

  if (end_at <= start_at) return { error: "El horario de fin debe ser posterior al de inicio." };

  const { error } = await supabase.from("appointments").insert({
    clinic_id: clinicId,
    patient_id,
    professional_id,
    start_at,
    end_at,
    status: "confirmed",
    origin: "staff",
  });

  if (error) return { error: `No se pudo crear el turno: ${error.message}` };

  revalidatePath("/calendar");
  return {};
}
