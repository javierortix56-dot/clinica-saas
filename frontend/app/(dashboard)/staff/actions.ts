"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

import { createClient } from "@/lib/supabase/server";

// Lee clinic_id del JWT (igual que en calendar/actions.ts y settings/actions.ts).
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

  let staffId: string;

  if (id) {
    const { error } = await supabase
      .from("staff_members")
      .update({ full_name, role, email, is_active })
      .eq("id", id);
    if (error) return { error: `Error al guardar: ${error.message}` };
    staffId = id;
  } else {
    // Creación — clinic_id viene del JWT, nunca del form.
    const clinicId = await getClinicId();
    if (!clinicId) return { error: "Sesión expirada." };

    const { data, error } = await supabase
      .from("staff_members")
      .insert({
        full_name,
        role,
        email,
        is_active: true,
        clinic_id: clinicId,
        auth_user_id: randomUUID(),
      })
      .select("id")
      .single();
    if (error) return { error: `Error al crear miembro: ${error.message}` };
    staffId = (data as { id: string }).id;
  }

  // ── Professionals + disponibilidad (para doctores — tanto en creación como edición) ─
  if (role === "doctor") {
    const license_number =
      (formData.get("license_number") as string | null)?.trim() || null;

    const { data: sm } = await supabase
      .from("staff_members")
      .select("id, clinic_id")
      .eq("id", staffId)
      .single();

    if (sm) {
      const { data: prof, error: profErr } = await supabase
        .from("professionals")
        .upsert(
          { staff_member_id: staffId, clinic_id: sm.clinic_id, license_number },
          { onConflict: "staff_member_id" }
        )
        .select("id")
        .single();

      if (profErr) return { error: `Error en profesional: ${profErr.message}` };

      // Disponibilidad: rebuild completo (delete + insert) a partir de las franjas.
      // Cada franja es un bloque {weekday, start, end}; un mismo día puede tener
      // varias franjas (día partido) — el motor de scheduling las respeta todas.
      if (prof) {
        const blockCount = parseInt(
          (formData.get("block_count") as string) ?? "0",
          10
        );

        const rows: {
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        }[] = [];

        for (let i = 0; i < blockCount; i++) {
          const weekday = Number(formData.get(`block_weekday_${i}`));
          const start = formData.get(`block_start_${i}`) as string;
          const end = formData.get(`block_end_${i}`) as string;
          // Saltar franjas inválidas (la BD también valida end > start).
          if (!weekday || !start || !end || end <= start) continue;
          rows.push({
            professional_id: prof.id,
            weekday,
            start_time: start,
            end_time: end,
          });
        }

        await supabase
          .from("professional_availability")
          .delete()
          .eq("professional_id", prof.id);

        if (rows.length > 0) {
          const { error: avErr } = await supabase
            .from("professional_availability")
            .insert(rows);
          if (avErr) return { error: `Error en disponibilidad: ${avErr.message}` };
        }
      }
    }
  }

  revalidatePath("/staff");
  return {};
}

export async function deactivateStaff(
  memberId: string
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from("staff_members")
    .update({ is_active: false })
    .eq("id", memberId);

  if (error) return { error: `No se pudo desactivar: ${error.message}` };

  // También /calendar: el desplegable de asignar turno depende del estado activo.
  revalidatePath("/staff");
  revalidatePath("/calendar");
  return {};
}

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
  revalidatePath("/calendar");
  return {};
}

// Borra (soft-delete) un miembro: marca deleted_at. A diferencia de desactivar,
// el miembro desaparece por completo del listado de personal y del desplegable
// de turnos. Es soft-delete porque staff_members está referenciado por
// professionals → appointments; un DELETE físico rompería el historial de turnos.
export async function deleteStaff(
  memberId: string
): Promise<{ error?: string }> {
  const supabase = createClient();

  const { error } = await supabase
    .from("staff_members")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) return { error: `No se pudo borrar: ${error.message}` };

  revalidatePath("/staff");
  revalidatePath("/calendar");
  return {};
}

export async function getGoogleCalendarConnectUrl(
  professionalId: string
): Promise<{ url?: string; error?: string }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Sesión expirada." };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return { error: "API no configurada." };

  try {
    const res = await fetch(
      `${apiUrl}/google-calendar/connect/${professionalId}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) return { error: "No se pudo obtener la URL de conexión." };
    const { url } = (await res.json()) as { url: string };
    return { url };
  } catch {
    return { error: "Error de red al conectar Google Calendar." };
  }
}

export async function disconnectGoogleCalendar(
  professionalId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Sesión expirada." };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return { error: "API no configurada." };

  try {
    const res = await fetch(
      `${apiUrl}/google-calendar/disconnect/${professionalId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }
    );
    if (!res.ok) return { error: "No se pudo desconectar Google Calendar." };
  } catch {
    return { error: "Error de red al desconectar Google Calendar." };
  }

  revalidatePath("/staff");
  return {};
}
