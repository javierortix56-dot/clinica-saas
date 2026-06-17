"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

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
