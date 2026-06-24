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

const ATTACHMENTS_BUCKET = "clinical-attachments";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB por archivo.
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

// Deja el nombre de archivo apto para una ruta de Storage (sin espacios ni
// caracteres raros), preservando la extensión.
function sanitizeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-120); // acota largo, conserva la extensión final
}

// Crea una nota clínica para un paciente, con adjuntos opcionales (imágenes/PDF).
// author_id se resuelve siempre server-side desde el JWT — nunca desde el cliente.
// RLS refuerza que solo admin/doctor pueden escribir en clinical_notes y subir
// al bucket privado (las policies del bucket exigen el prefijo clinic_id).
export async function createClinicalNote(
  formData: FormData
): Promise<{ error?: string; warning?: string }> {
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

  // ── Campos estructurados (motivo / signos vitales / diagnóstico / indicaciones) ─
  // El formulario solo envía los campos que el profesional tiene activos; acá
  // tomamos lo que venga y descartamos vacíos para no guardar ruido.
  const structured: Record<string, unknown> = {};
  const motivo = (formData.get("motivo") as string | null)?.trim();
  const diagnostico = (formData.get("diagnostico") as string | null)?.trim();
  const indicaciones = (formData.get("indicaciones") as string | null)?.trim();
  if (motivo) structured.motivo = motivo;
  if (diagnostico) structured.diagnostico = diagnostico;
  if (indicaciones) structured.indicaciones = indicaciones;

  const VITAL_KEYS = ["ta", "fc", "fr", "temp", "peso", "talla", "sato2"];
  const vitals: Record<string, string> = {};
  for (const k of VITAL_KEYS) {
    const v = (formData.get(`vital_${k}`) as string | null)?.trim();
    if (v) vitals[k] = v;
  }
  if (Object.keys(vitals).length > 0) structured.vitals = vitals;

  // Validamos los adjuntos ANTES de insertar la nota: si alguno es inválido,
  // no dejamos una nota a medias.
  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);

  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      return {
        error: `Tipo de archivo no permitido (${file.name}). Solo imágenes (JPG, PNG, WEBP, GIF) o PDF.`,
      };
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: `"${file.name}" supera el máximo de 10 MB.` };
    }
  }

  // clinic_id resuelto server-side desde el JWT — nunca del cliente.
  // Es NOT NULL y la policy RLS exige clinic_id = auth_clinic_id(): sin él,
  // el insert viola la row-level security policy de clinical_notes.
  const clinicId = await getClinicId();
  if (!clinicId) {
    return { error: "No se pudo determinar la clínica de la sesión." };
  }

  const { data: note, error } = await supabase
    .from("clinical_notes")
    .insert({
      clinic_id: clinicId,
      patient_id,
      author_id: prof.id,
      note_type,
      body,
      treatment_id: treatment_id || null,
      structured_data: structured,
    })
    .select("id")
    .single();

  if (error || !note) {
    return { error: `No se pudo guardar la nota: ${error?.message ?? "desconocido"}` };
  }

  // Subida de adjuntos al bucket privado + registro de metadatos.
  const failed: string[] = [];
  for (const file of files) {
    const path = `${clinicId}/${note.id}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (upErr) {
      failed.push(file.name);
      continue;
    }

    const { error: metaErr } = await supabase
      .from("clinical_note_attachments")
      .insert({
        clinic_id: clinicId,
        clinical_note_id: note.id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: prof.id,
      });

    if (metaErr) {
      // El binario quedó subido pero sin metadato: lo borramos para no dejar
      // huérfanos, y lo reportamos como fallido.
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
      failed.push(file.name);
    }
  }

  revalidatePath(`/patients/${patient_id}`);
  if (failed.length > 0) {
    return {
      warning: `La nota se guardó, pero no se pudieron adjuntar: ${failed.join(", ")}.`,
    };
  }
  return {};
}

// ─── Perfil clínico del paciente (alergias + antecedentes) ──────────────────────

// Guarda alergias/antecedentes a nivel paciente. RLS exige admin/doctor; el
// clinic_id sale del JWT (nunca del cliente). Upsert por patient_id.
export async function updatePatientClinicalProfile(
  formData: FormData
): Promise<{ error?: string }> {
  const supabase = createClient();
  const patient_id = formData.get("patient_id") as string;
  if (!patient_id) return { error: "Falta el paciente." };

  const allergies = (formData.get("allergies") as string | null)?.trim() || null;
  const medical_history =
    (formData.get("medical_history") as string | null)?.trim() || null;

  // professional_id del autor (para updated_by) y clinic_id del JWT.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };
  const { data: prof } = await supabase
    .from("professionals")
    .select("id, staff_members!inner(auth_user_id)")
    .eq("staff_members.auth_user_id", user.id)
    .single();

  const clinicId = await getClinicId();
  if (!clinicId) return { error: "No se pudo determinar la clínica." };

  const { error } = await supabase
    .from("patient_clinical_profile")
    .upsert(
      {
        patient_id,
        clinic_id: clinicId,
        allergies,
        medical_history,
        updated_by: (prof as { id?: string } | null)?.id ?? null,
      },
      { onConflict: "patient_id" }
    );

  if (error) return { error: `No se pudo guardar: ${error.message}` };
  revalidatePath(`/patients/${patient_id}`);
  return {};
}

// ─── Configuración de campos clínicos del profesional ───────────────────────────

// Guarda qué campos clínicos ve el profesional logueado en su formulario de nota.
// Es por profesional (resuelto del JWT) — cada especialidad arma su propio set.
export async function updateNoteFieldConfig(
  config: Record<string, boolean>
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const { data: prof } = await supabase
    .from("professionals")
    .select("id, staff_members!inner(auth_user_id)")
    .eq("staff_members.auth_user_id", user.id)
    .single();
  if (!prof) return { error: "Solo profesionales pueden configurar campos." };

  const { error } = await supabase
    .from("professionals")
    .update({ note_field_config: config })
    .eq("id", (prof as { id: string }).id);

  if (error) return { error: `No se pudo guardar la configuración: ${error.message}` };
  return {};
}

// ─── Resumen de historia clínica con IA ─────────────────────────────────────────

// Genera un resumen clínico del paciente con Gemini. Lee las notas vía RLS (la
// sesión del médico ya tiene acceso admin/doctor); la API key vive solo en el
// entorno server (nunca llega al cliente). El backend/bot NO interviene: su rol
// clinic_bot tiene prohibido el acceso a notas clínicas (borde duro §6).
export async function summarizePatientHistory(
  patientId: string
): Promise<{ summary?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "Falta configurar GEMINI_API_KEY en el entorno." };
  }

  const supabase = createClient();

  // Perfil clínico (alergias/antecedentes) + notas, en paralelo.
  const [{ data: profile }, { data: notes, error }] = await Promise.all([
    supabase
      .from("patient_clinical_profile")
      .select("allergies, medical_history")
      .eq("patient_id", patientId)
      .maybeSingle(),
    supabase
      .from("clinical_notes")
      .select(
        `note_type, body, created_at, structured_data,
         treatments ( treatment_types ( name ) )`
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (error) return { error: `No se pudo leer la historia clínica: ${error.message}` };
  if (!notes || notes.length === 0) {
    return { error: "No hay notas clínicas para resumir." };
  }

  const dateFmt = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const VITAL_LABELS: Record<string, string> = {
    ta: "TA", fc: "FC", fr: "FR", temp: "Temp", peso: "Peso", talla: "Talla", sato2: "SatO2",
  };

  const historial = (notes as unknown as ClinicalNoteForSummary[])
    .map((n) => {
      const fecha = dateFmt.format(new Date(n.created_at));
      const trat = n.treatments?.treatment_types?.name;
      const tratStr = trat ? ` [${trat}]` : "";
      const sd = n.structured_data ?? {};
      const extra: string[] = [];
      if (sd.motivo) extra.push(`Motivo: ${sd.motivo}`);
      if (sd.vitals && Object.keys(sd.vitals).length > 0) {
        const v = Object.entries(sd.vitals)
          .map(([k, val]) => `${VITAL_LABELS[k] ?? k} ${val}`)
          .join(", ");
        extra.push(`Vitales: ${v}`);
      }
      if (sd.diagnostico) extra.push(`Dx: ${sd.diagnostico}`);
      if (sd.indicaciones) extra.push(`Plan: ${sd.indicaciones}`);
      const extraStr = extra.length > 0 ? ` (${extra.join(" · ")})` : "";
      return `- ${fecha} · ${n.note_type}${tratStr}: ${n.body}${extraStr}`;
    })
    .join("\n");

  const prof = profile as
    | { allergies: string | null; medical_history: string | null }
    | null;
  const perfilStr =
    prof && (prof.allergies || prof.medical_history)
      ? [
          "Perfil del paciente:",
          prof.allergies ? `- Alergias: ${prof.allergies}` : "",
          prof.medical_history ? `- Antecedentes: ${prof.medical_history}` : "",
          "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";

  const prompt = [
    "Sos un asistente clínico. A partir del historial de notas clínicas de un",
    "paciente (ordenadas de más antigua a más reciente), redactá un resumen breve",
    "para que el profesional se ponga al día antes de la consulta.",
    "",
    "Reglas:",
    "- Máximo 6 viñetas, en español.",
    "- Destacá diagnósticos, evolución, tratamientos en curso y pendientes.",
    "- Si detectás alertas (alergias, condiciones de riesgo), ponelas PRIMERO.",
    "- No inventes datos que no estén en las notas.",
    "",
    perfilStr,
    "Historial:",
    historial,
  ].join("\n");

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!resp.ok) {
      return { error: `El servicio de IA respondió ${resp.status}.` };
    }

    const data = (await resp.json()) as GeminiResponse;
    const summary = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!summary) return { error: "La IA no devolvió un resumen." };
    return { summary };
  } catch (err) {
    return { error: `No se pudo contactar al servicio de IA: ${String(err)}` };
  }
}

interface ClinicalNoteForSummary {
  note_type: string;
  body: string;
  created_at: string;
  structured_data: {
    motivo?: string;
    vitals?: Record<string, string>;
    diagnostico?: string;
    indicaciones?: string;
  } | null;
  treatments: { treatment_types: { name: string } | null } | null;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
  }[];
}
