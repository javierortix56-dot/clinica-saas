"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { SPECIALTY_PRESETS } from "../patients/clinical-fields";

// Las configuraciones de la clínica son exclusivas del dueño (is_owner).
// Decodifica el JWT de sesión y exige el claim is_owner (inyectado por el Custom
// Access Token Hook, migración 0016). NO leer de user.app_metadata — ese campo no
// incluye los claims custom del hook.
async function requireOwner(): Promise<
  { error: string } | { supabase: ReturnType<typeof createClient>; clinicId: string }
> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Sesión expirada." };

  let isOwner = false;
  let clinicId: string | null = null;
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
    ) as { is_owner?: boolean; clinic_id?: string };
    isOwner = payload.is_owner === true;
    clinicId = payload.clinic_id ?? null;
  } catch {}

  if (!isOwner) return { error: "Solo el dueño de la clínica puede realizar esta acción." };
  if (!clinicId) return { error: "No se pudo determinar la clínica del usuario." };

  return { supabase, clinicId };
}

export async function updateClinicSettings(
  formData: FormData
): Promise<{ error?: string }> {
  const result = await requireOwner();
  if ("error" in result) return { error: result.error };
  const { supabase, clinicId } = result;

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

  // WHERE explícito por id (del JWT). PostgREST rechaza UPDATE sin filtro aunque
  // RLS ya restrinja a la propia clínica ("UPDATE requires a WHERE clause").
  const { error } = await supabase
    .from("clinics")
    .update({ name, timezone, prime_time_start, prime_time_end, currency, valuation_fee })
    .eq("id", clinicId);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/settings");
  return {};
}

export async function upsertTreatmentType(
  formData: FormData
): Promise<{ error?: string }> {
  const result = await requireOwner();
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

export async function deleteTreatmentType(
  id: string
): Promise<{ error?: string }> {
  const result = await requireOwner();
  if ("error" in result) return { error: result.error };
  const { supabase } = result;

  // Block deletion if there are treatments (active treatment plans) using this type.
  const { count } = await supabase
    .from("treatments")
    .select("id", { count: "exact", head: true })
    .eq("treatment_type_id", id);

  if (count && count > 0) {
    return { error: "No se puede eliminar: hay tratamientos activos que usan este tipo." };
  }

  // Delete phases first (FK dependency).
  await supabase.from("treatment_phase_templates").delete().eq("treatment_type_id", id);

  const { error } = await supabase.from("treatment_types").delete().eq("id", id);
  if (error) return { error: `Error al eliminar: ${error.message}` };

  revalidatePath("/settings");
  return {};
}

// ─── Especialidades y campos clínicos (admin) ───────────────────────────────────

// Convierte un texto a un identificador seguro [a-z0-9_], acotado.
function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "campo";
}

// Siembra las especialidades base (los 25 presets) para la clínica si todavía no
// tiene ninguna. Idempotente: no duplica si ya hay filas (aunque estén borradas).
// Solo admin (RLS lo refuerza). Se llama al abrir Ajustes.
export async function ensureSpecialtiesSeeded(): Promise<{ error?: string; seeded?: number }> {
  const result = await requireOwner();
  if ("error" in result) return { error: result.error };
  const { supabase, clinicId } = result;

  const { count } = await supabase
    .from("clinic_specialties")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", clinicId);

  if (count && count > 0) return { seeded: 0 };

  const rows = SPECIALTY_PRESETS.map((p, i) => ({
    clinic_id: clinicId,
    slug: p.id,
    label: p.label,
    base_off: p.baseOff ?? [],
    exam_systems: p.examSystems,
    specialty_fields: p.specialtyFields,
    is_builtin: true,
    sort_order: i,
  }));

  const { error } = await supabase.from("clinic_specialties").insert(rows);
  if (error) return { error: `No se pudieron sembrar las especialidades: ${error.message}` };

  revalidatePath("/settings");
  return { seeded: rows.length };
}

export async function upsertSpecialty(input: {
  id?: string;
  label: string;
  baseOff: string[];
  examSystems: string[];
  specialtyFields: string[];
}): Promise<{ error?: string }> {
  const result = await requireOwner();
  if ("error" in result) return { error: result.error };
  const { supabase, clinicId } = result;

  const label = input.label?.trim();
  if (!label) return { error: "La especialidad necesita un nombre." };

  const payload = {
    label,
    base_off: input.baseOff ?? [],
    exam_systems: input.examSystems ?? [],
    specialty_fields: input.specialtyFields ?? [],
  };

  if (input.id) {
    const { error } = await supabase
      .from("clinic_specialties")
      .update(payload)
      .eq("id", input.id)
      .eq("clinic_id", clinicId);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
  } else {
    // Slug estable y único: base del nombre + sufijo corto para evitar choques.
    const slug = `${slugify(label)}_${crypto.randomUUID().slice(0, 4)}`;
    const { error } = await supabase.from("clinic_specialties").insert({
      clinic_id: clinicId,
      slug,
      is_builtin: false,
      sort_order: 999,
      ...payload,
    });
    if (error) return { error: `No se pudo crear: ${error.message}` };
  }

  revalidatePath("/settings");
  return {};
}

export async function deleteSpecialty(id: string): Promise<{ error?: string }> {
  const result = await requireOwner();
  if ("error" in result) return { error: result.error };
  const { supabase, clinicId } = result;

  const { error } = await supabase
    .from("clinic_specialties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", clinicId);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };

  revalidatePath("/settings");
  return {};
}

export async function upsertSpecialtyField(input: {
  id?: string;
  label: string;
  placeholder?: string;
}): Promise<{ error?: string }> {
  const result = await requireOwner();
  if ("error" in result) return { error: result.error };
  const { supabase, clinicId } = result;

  const label = input.label?.trim();
  if (!label) return { error: "El campo necesita un nombre." };
  const placeholder = input.placeholder?.trim() || null;

  if (input.id) {
    const { error } = await supabase
      .from("clinic_specialty_fields")
      .update({ label, placeholder })
      .eq("id", input.id)
      .eq("clinic_id", clinicId);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
  } else {
    const key = `${slugify(label)}_${crypto.randomUUID().slice(0, 4)}`;
    const { error } = await supabase.from("clinic_specialty_fields").insert({
      clinic_id: clinicId,
      key,
      label,
      placeholder,
    });
    if (error) return { error: `No se pudo crear el campo: ${error.message}` };
  }

  revalidatePath("/settings");
  return {};
}

export async function deleteSpecialtyField(id: string): Promise<{ error?: string }> {
  const result = await requireOwner();
  if ("error" in result) return { error: result.error };
  const { supabase, clinicId } = result;

  const { error } = await supabase
    .from("clinic_specialty_fields")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("clinic_id", clinicId);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };

  revalidatePath("/settings");
  return {};
}
