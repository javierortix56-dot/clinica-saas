"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

import { createClient } from "@/lib/supabase/server";

// Crea o actualiza un staff member + su fila en professionals (si es doctor)
// + sus franjas de disponibilidad semanal.
// clinic_id nunca viene del form: se resuelve desde el JWT del usuario logueado
// a través de la sesión de Supabase (RLS lo garantiza).
export async function upsertStaff(
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createClient();

  const id = (formData.get("id") as string | null) || null;
  const full_name = (formData.get("full_name") as string)?.trim();
  const role = formData.get("role") as "admin" | "doctor" | "reception";
  const email = (formData.get("email") as string | null)?.trim() || null;
  const is_active = formData.get("is_active") === "true";

  if (!full_name || !role) {
    return { error: "Nombre y rol son obligatorios." };
  }

  // ── Staff member ──────────────────────────────────────────────────────────
  if (id) {
    // Edición
    const { error } = await supabase
      .from("staff_members")
      .update({ full_name, role, email, is_active })
      .eq("id", id);
    if (error) return { error: `Error al guardar: ${error.message}` };
  } else {
    // Creación — auth_user_id es NOT NULL en la BD; se usa un UUID placeholder
    // que el admin puede vincular a una cuenta real posteriormente.
    const { error } = await supabase.from("staff_members").insert({
      full_name,
      role,
      email,
      is_active: true,
      auth_user_id: randomUUID(),
    });
    if (error) return { error: `Error al crear miembro: ${error.message}` };
  }

  // ── Professionals + disponibilidad (solo para doctores) ───────────────────
  if (role === "doctor" && id) {
    const license_number =
      (formData.get("license_number") as string | null)?.trim() || null;

    // Aseguramos que existe la fila en professionals (necesitamos clinic_id)
    const { data: sm } = await supabase
      .from("staff_members")
      .select("id, clinic_id")
      .eq("id", id)
      .single();

    if (sm) {
      // Upsert en professionals con clinic_id + license_number
      const { data: prof, error: profErr } = await supabase
        .from("professionals")
        .upsert(
          { staff_member_id: id, clinic_id: sm.clinic_id, license_number },
          { onConflict: "staff_member_id" }
        )
        .select("id")
        .single();

      if (profErr) return { error: `Error en profesional: ${profErr.message}` };

      if (prof) {
        // Rebuilding availability: delete existing + insert new
        const selectedDays = (formData.getAll("days") as string[]).map(Number);

        await supabase
          .from("professional_availability")
          .delete()
          .eq("professional_id", prof.id);

        if (selectedDays.length > 0) {
          const rows = selectedDays.map((weekday) => ({
            professional_id: prof.id,
            weekday,
            start_time: (formData.get(`start_${weekday}`) as string) || "09:00",
            end_time: (formData.get(`end_${weekday}`) as string) || "18:00",
          }));

          const { error: avErr } = await supabase
            .from("professional_availability")
            .insert(rows);

          if (avErr)
            return { error: `Error en disponibilidad: ${avErr.message}` };
        }
      }
    }
  }

  revalidatePath("/staff");
  return {};
}

// Soft-delete: marca el miembro como inactivo sin borrar la fila.
export async function deactivateStaff(
  memberId: string
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from("staff_members")
    .update({ is_active: false })
    .eq("id", memberId);

  if (error) return { error: `No se pudo desactivar: ${error.message}` };

  revalidatePath("/staff");
  return {};
}

// Reactiva un miembro previamente desactivado.
export async function reactivateStaff(
  memberId: string
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from("staff_members")
    .update({ is_active: true })
    .eq("id", memberId);

  if (error) return { error: `No se pudo reactivar: ${error.message}` };

  revalidatePath("/staff");
  return {};
}
