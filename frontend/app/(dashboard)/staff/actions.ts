"use server";

import { revalidatePath } from "next/cache";
import { randomUUID, randomBytes } from "crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Lee clinic_id + user_role + is_owner del JWT (resueltos server-side, nunca del form).
async function getSessionClaims(): Promise<{
  clinicId: string | null;
  role: string | null;
  isOwner: boolean;
}> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { clinicId: null, role: null, isOwner: false };
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
    ) as { clinic_id?: string; user_role?: string; is_owner?: boolean };
    return {
      clinicId: payload.clinic_id ?? null,
      role: payload.user_role ?? null,
      isOwner: payload.is_owner === true,
    };
  } catch {
    return { clinicId: null, role: null, isOwner: false };
  }
}

// Toda la gestión de equipo es exclusiva del dueño (is_owner).
async function requireOwner(): Promise<{ clinicId: string } | { error: string }> {
  const { clinicId, isOwner } = await getSessionClaims();
  if (!isOwner) {
    return { error: "Solo el dueño de la clínica puede gestionar el equipo." };
  }
  if (!clinicId) return { error: "Sesión expirada." };
  return { clinicId };
}

// True si `memberId` es dueño y es el ÚNICO dueño activo de su clínica.
// Sirve para evitar dejar la clínica sin ningún dueño (lockout).
async function isLastOwner(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<boolean> {
  const { data: m } = await supabase
    .from("staff_members")
    .select("is_owner, clinic_id")
    .eq("id", memberId)
    .single();
  const member = m as { is_owner?: boolean; clinic_id?: string } | null;
  if (!member?.is_owner || !member.clinic_id) return false;
  const { count } = await supabase
    .from("staff_members")
    .select("id", { count: "exact", head: true })
    .eq("clinic_id", member.clinic_id)
    .eq("is_owner", true)
    .is("deleted_at", null);
  return (count ?? 0) <= 1;
}

// Contraseña temporal fuerte (url-safe, ~12 caracteres).
function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

// Crea el usuario de auth para un staff con login (o recupera/actualiza el que ya
// exista para ese email). Service role server-side — la key nunca llega al cliente.
// Devuelve el id de auth, la contraseña efectiva, y si se creó un usuario nuevo
// (para poder hacer rollback si falla la inserción del staff).
async function provisionAuthUser(
  email: string,
  password: string | null
): Promise<
  | { authUserId: string; password: string; createdNew: boolean }
  | { error: string }
> {
  const admin = createAdminClient();
  const hasPwd = !!password && password.length >= 6;
  const pwd = hasPwd ? (password as string) : generatePassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
  });

  if (!error && data?.user) {
    return { authUserId: data.user.id, password: pwd, createdNew: true };
  }

  // El email ya tiene cuenta: la buscamos y, si nos dieron contraseña, la reseteamos.
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    if (hasPwd) {
      await admin.auth.admin.updateUserById(existing.id, {
        password: pwd,
        email_confirm: true,
      });
      return { authUserId: existing.id, password: pwd, createdNew: false };
    }
    // Sin contraseña nueva: linkeamos al usuario existente sin tocar su clave.
    return { authUserId: existing.id, password: "", createdNew: false };
  }

  return { error: error?.message ?? "No se pudo crear el usuario de acceso." };
}

export interface UpsertStaffResult {
  error?: string;
  // Si se creó/actualizó un acceso, las credenciales para mostrar una sola vez.
  credentials?: { email: string; password: string };
}

export async function upsertStaff(
  formData: FormData
): Promise<UpsertStaffResult> {
  const supabase = createClient();

  const id = (formData.get("id") as string | null) || null;
  const full_name = (formData.get("full_name") as string)?.trim();
  const role = formData.get("role") as "admin" | "doctor" | "reception";
  const email = (formData.get("email") as string | null)?.trim() || null;
  const password = (formData.get("password") as string | null)?.trim() || null;
  const is_active = formData.get("is_active") === "true";

  if (!full_name || !role) {
    return { error: "Nombre y rol son obligatorios." };
  }

  const owner = await requireOwner();
  if ("error" in owner) return { error: owner.error };
  const { clinicId } = owner;

  // Flag de dueño (la página ya es owner-only; acá lo reforzamos).
  const makeOwner = formData.get("is_owner") === "true";

  let staffId: string;
  let credentials: { email: string; password: string } | undefined;

  if (id) {
    // ── Edición ──
    const { data: current } = await supabase
      .from("staff_members")
      .select("auth_user_id, email, is_owner")
      .eq("id", id)
      .single();

    // Seguridad anti-lockout: no permitir quitar el último dueño de la clínica.
    const wasOwner = (current as { is_owner?: boolean } | null)?.is_owner === true;
    if (wasOwner && !makeOwner) {
      const { count } = await supabase
        .from("staff_members")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("is_owner", true)
        .is("deleted_at", null);
      if ((count ?? 0) <= 1) {
        return { error: "No podés quitar el último dueño de la clínica." };
      }
    }

    const { error } = await supabase
      .from("staff_members")
      .update({ full_name, role, email, is_active, is_owner: makeOwner })
      .eq("id", id);
    if (error) return { error: `Error al guardar: ${error.message}` };
    staffId = id;

    // Setear/resetear contraseña de acceso (requiere email).
    if (password) {
      if (!email) return { error: "Para crear el acceso, cargá un email." };
      const admin = createAdminClient();
      const currentAuthId = (current as { auth_user_id?: string } | null)
        ?.auth_user_id;

      // ¿El auth_user_id actual corresponde a un usuario de auth real?
      let realAuthId: string | null = null;
      if (currentAuthId) {
        const { data: got } = await admin.auth.admin.getUserById(currentAuthId);
        if (got?.user) realAuthId = got.user.id;
      }

      if (realAuthId) {
        const { error: upErr } = await admin.auth.admin.updateUserById(
          realAuthId,
          { email, password, email_confirm: true }
        );
        if (upErr) {
          return { error: `No se pudo actualizar el acceso: ${upErr.message}` };
        }
        credentials = { email, password };
      } else {
        // Staff creado sin login real (auth_user_id placeholder): lo creamos y vinculamos.
        const prov = await provisionAuthUser(email, password);
        if ("error" in prov) {
          return { error: `No se pudo crear el acceso: ${prov.error}` };
        }
        const { error: linkErr } = await supabase
          .from("staff_members")
          .update({ auth_user_id: prov.authUserId })
          .eq("id", id);
        if (linkErr) {
          return { error: `No se pudo vincular el acceso: ${linkErr.message}` };
        }
        credentials = { email, password: prov.password };
      }
    }
  } else {
    // ── Creación ──
    if (email) {
      const prov = await provisionAuthUser(email, password);
      if ("error" in prov) {
        return { error: `No se pudo crear el acceso: ${prov.error}` };
      }
      if (prov.password) credentials = { email, password: prov.password };

      const { data, error } = await supabase
        .from("staff_members")
        .insert({
          full_name,
          role,
          email,
          is_active: true,
          is_owner: makeOwner,
          clinic_id: clinicId,
          auth_user_id: prov.authUserId,
        })
        .select("id")
        .single();
      if (error) {
        // Rollback del usuario de auth si lo acabamos de crear (evita huérfanos).
        if (prov.createdNew) {
          await createAdminClient().auth.admin.deleteUser(prov.authUserId);
        }
        return { error: `Error al crear miembro: ${error.message}` };
      }
      staffId = (data as { id: string }).id;
    } else {
      // Staff sin login (no inicia sesión): auth_user_id placeholder.
      const { data, error } = await supabase
        .from("staff_members")
        .insert({
          full_name,
          role,
          email,
          is_active: true,
          is_owner: makeOwner,
          clinic_id: clinicId,
          auth_user_id: randomUUID(),
        })
        .select("id")
        .single();
      if (error) return { error: `Error al crear miembro: ${error.message}` };
      staffId = (data as { id: string }).id;
    }
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
  return { credentials };
}

export async function deactivateStaff(
  memberId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const owner = await requireOwner();
  if ("error" in owner) return { error: owner.error };
  if (await isLastOwner(supabase, memberId)) {
    return { error: "No podés desactivar al último dueño de la clínica." };
  }

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
  const owner = await requireOwner();
  if ("error" in owner) return { error: owner.error };

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
  const owner = await requireOwner();
  if ("error" in owner) return { error: owner.error };
  if (await isLastOwner(supabase, memberId)) {
    return { error: "No podés borrar al último dueño de la clínica." };
  }

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
  const owner = await requireOwner();
  if ("error" in owner) return { error: owner.error };
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
  const owner = await requireOwner();
  if ("error" in owner) return { error: owner.error };
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
