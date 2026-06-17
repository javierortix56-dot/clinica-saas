"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." as const };

  const role = user.app_metadata?.user_role as string | undefined;
  if (role !== "admin") return { error: "Solo administradores pueden realizar esta acción." as const };

  return { supabase };
}

export async function updateClinicSettings(
  formData: FormData
): Promise<{ error?: string }> {
  const result = await requireAdmin();
  if ("error" in result) return { error: result.error };
  const { supabase } = result;

  const name = (formData.get("name") as string)?.trim();
  const timezone = (formData.get("timezone") as string)?.trim();
  const prime_time_start = formData.get("prime_time_start") as string;
  const prime_time_end = formData.get("prime_time_end") as string;
  const currency = (formData.get("currency") as string)?.trim();
  const valuation_fee_raw = (formData.get("valuation_fee") as string)?.trim();
  const valuation_fee = valuation_fee_raw ? valuation_fee_raw : null;

  if (!name || !timezone || !prime_time_start || !prime_time_end || !currency) {
    return { error: "Todos los campos obligatorios deben estar completos." };
  }

  // clinic_id resuelto por RLS (tenant_self) — no viene del form
  const { error } = await supabase
    .from("clinics")
    .update({ name, timezone, prime_time_start, prime_time_end, currency, valuation_fee });

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/settings");
  return {};
}

export async function upsertTreatmentType(
  formData: FormData
): Promise<{ error?: string }> {
  const result = await requireAdmin();
  if ("error" in result) return { error: result.error };
  const { supabase } = result;

  const id = (formData.get("id") as string | null) || null;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name) return { error: "El nombre del tipo de tratamiento es obligatorio." };

  let typeId: string;

  if (id) {
    const { error } = await supabase
      .from("treatment_types")
      .update({ name, description })
      .eq("id", id);
    if (error) return { error: `Error al actualizar: ${error.message}` };
    typeId = id;
  } else {
    const { data, error } = await supabase
      .from("treatment_types")
      .insert({ name, description })
      .select("id")
      .single();
    if (error) return { error: `Error al crear: ${error.message}` };
    typeId = (data as { id: string }).id;
  }

  // Rebuild phases: delete all + insert new (same pattern as professional_availability)
  await supabase
    .from("treatment_phase_templates")
    .delete()
    .eq("treatment_type_id", typeId);

  const phaseCount = parseInt((formData.get("phase_count") as string) ?? "0", 10);

  if (phaseCount > 0) {
    const phases = [];
    for (let i = 0; i < phaseCount; i++) {
      const phaseName = (formData.get(`phase_name_${i}`) as string)?.trim();
      const phaseKind = formData.get(`phase_kind_${i}`) as string;
      const durationRaw = formData.get(`phase_duration_${i}`) as string;
      const cooldownRaw = formData.get(`phase_cooldown_${i}`) as string;
      const is3d = formData.get(`phase_3d_${i}`) === "true";

      if (!phaseName) continue;

      const finalName =
        is3d && !/(3d|escaneo)/i.test(phaseName)
          ? `${phaseName} (Escaneo 3D)`
          : phaseName;

      phases.push({
        treatment_type_id: typeId,
        sequence_order: i + 1,
        name: finalName,
        phase_kind: phaseKind || "clinical",
        duration_minutes: durationRaw ? parseInt(durationRaw, 10) : null,
        cooldown_days: cooldownRaw ? parseInt(cooldownRaw, 10) : 0,
      });
    }

    if (phases.length > 0) {
      const { error } = await supabase
        .from("treatment_phase_templates")
        .insert(phases);
      if (error) return { error: `Error al guardar fases: ${error.message}` };
    }
  }

  revalidatePath("/settings");
  return {};
}
