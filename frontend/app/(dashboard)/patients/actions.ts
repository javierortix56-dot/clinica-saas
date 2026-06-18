"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// ─── Pacientes CRUD ────────────────────────────────────────────────────────────

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

export async function upsertPatient(
  formData: FormData
): Promise<{ error?: string }> {
  const id = (formData.get("id") as string | null) || null;
  const full_name = (formData.get("full_name") as string)?.trim();
  const national_id = (formData.get("national_id") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;

  if (!full_name || !national_id) {
    return { error: "Nombre y DNI son obligatorios." };
  }

  const supabase = createClient();

  if (id) {
    const { error } = await supabase
      .from("patients")
      .update({ full_name, national_id, phone, email })
      .eq("id", id);
    if (error) return { error: `No se pudo actualizar: ${error.message}` };
  } else {
    const clinicId = await getClinicId();
    if (!clinicId) return { error: "No se pudo determinar la clínica." };
    const { error } = await supabase
      .from("patients")
      .insert({ full_name, national_id, phone, email, clinic_id: clinicId });
    if (error) return { error: `No se pudo crear el paciente: ${error.message}` };
  }

  revalidatePath("/patients");
  return {};
}

// ─── Notas clínicas ────────────────────────────────────────────────────────────

// Crea una nota clínica para un paciente.
// author_id se resuelve siempre server-side desde el JWT — nunca desde el cliente.
// RLS refuerza que solo admin/doctor pueden escribir en clinical_notes.
export async function createClinicalNote(
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Volvé a iniciar sesión." };

  // Resolver professional_id desde auth_user_id vía join interno.
  const { data: prof } = await supabase
    .from("professionals")
    .select("id, staff_members!inner(auth_user_id)")
    .eq("staff_members.auth_user_id", user.id)
    .single();

  if (!prof) {
    return { error: "Solo profesionales pueden crear notas clínicas." };
  }

  const patient_id = formData.get("patient_id") as string;
  const note_type = formData.get("note_type") as string;
  const body = (formData.get("body") as string)?.trim();
  const treatment_id = (formData.get("treatment_id") as string) || null;

  if (!patient_id || !note_type || !body) {
    return { error: "Tipo y contenido son obligatorios." };
  }

  const { error } = await supabase.from("clinical_notes").insert({
    patient_id,
    author_id: prof.id,
    note_type,
    body,
    treatment_id: treatment_id || null,
  });

  if (error) return { error: `No se pudo guardar la nota: ${error.message}` };

  revalidatePath(`/patients/${patient_id}`);
  return {};
}
