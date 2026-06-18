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
