"use server";

import { revalidatePath } from "next/cache";

import { createClient, getPatientSession } from "@/lib/supabase/server";

export async function cancelPortalAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  const { hasSession, patientId } = await getPatientSession();
  if (!hasSession || !patientId) return { error: "Sesión expirada." };

  const supabase = createClient();

  // RLS policy `patient_view_own` ensures the patient can only access their own rows.
  // We filter by patient_id explicitly as an extra guard before updating.
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, status, start_at")
    .eq("id", appointmentId)
    .eq("patient_id", patientId)
    .single();

  if (!appt) return { error: "Turno no encontrado." };
  if (!["proposed", "confirmed"].includes(appt.status)) {
    return { error: "Solo se pueden cancelar turnos propuestos o confirmados." };
  }
  if (new Date(appt.start_at) < new Date()) {
    return { error: "No se puede cancelar un turno que ya ocurrió." };
  }

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .eq("patient_id", patientId);

  if (error) return { error: `No se pudo cancelar: ${error.message}` };

  revalidatePath("/portal/turnos");
  return {};
}
