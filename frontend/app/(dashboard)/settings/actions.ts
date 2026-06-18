"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Decodifica el JWT de sesión y devuelve user_role y clinic_id.
// Ambos son claims top-level inyectados por el Custom Access Token Hook (migración 0007).
// NO leer desde user.app_metadata — ese campo viene de raw_app_meta_data en la BD
// y no incluye los claims custom del hook.
async function requireAdmin(): Promise<
  { error: string } | { supabase: ReturnType<typeof createClient>; clinicId: string }
> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Sesión expirada." };

  let role: string | null = null;
  let clinicId: string | null = null;
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
    ) as { user_role?: string; clinic_id?: string };
    role = payload.user_role ?? null;
    clinicId = payload.clinic_id ?? null;
  } catch {}

  if (role !== "admin") return { error: "Solo administradores pueden realizar esta acción." };
  if (!clinicId) return { error: "No se pudo determinar la clínica del usuario." };

  return { supabase, clinicId };
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

  // clinic_id resuelto por RLS (tenant_self — id = auth_clinic_id()) — no viene del form.
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
  const { supabase, clinicId } = result;

  const id = (formData.get("id") as string | null) || null;
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const is_active = id ? formData.get("is_active") === "on" : true;

  if (!name) return { error: "El nombre del tipo de tratamiento es obligatorio." };

  let typeId: string;

  if (id) {
    const { error } = await supabase
      .from("treatment_types")
      .update({ name, description, is_active })
      .eq("id", id);
    if (error) return { error: `Error al actualizar: ${error.message}` };
    typeId = id;
  } else {
    // clinic_id es NOT NULL sin default — debe venir del JWT, nunca del form.
    const { data, error } = await supabase
      .from("treatment_types")
      .insert({ name, description, clinic_id: clinicId })
      .select("id")
      .single();
    if (error) return { error: `Error al crear: ${error.message}` };
    typeId = (data as { id: string }).id;
  }

  // Rebuild phases: delete all + insert new (mismo patrón que professional_availability).
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
        clinic_id: clinicId,  // NOT NULL — resuelto del JWT, nunca del form
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
