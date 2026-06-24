"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { SPECIALTY_FIELD_DEFS } from "./clinical-fields";

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

const VITAL_KEYS = ["ta", "fc", "fr", "temp", "peso", "talla", "sato2"];

const EXAM_FISICO_KEYS = [
  "general", "piel", "cabeza_cuello", "cardiovascular", "respiratorio",
  "abdomen", "genitourinario", "neurologico", "musculoesqueletico",
  "oftalmologico", "orl",
];

// Arma el objeto structured_data desde el form, descartando campos vacíos.
function parseStructuredData(formData: FormData): Record<string, unknown> {
  const structured: Record<string, unknown> = {};

  const motivo = (formData.get("motivo") as string | null)?.trim();
  const enfermedadActual = (formData.get("enfermedad_actual") as string | null)?.trim();
  const diagnostico = (formData.get("diagnostico") as string | null)?.trim();
  const indicaciones = (formData.get("indicaciones") as string | null)?.trim();
  const fechaControl = (formData.get("fecha_control") as string | null)?.trim();

  if (motivo) structured.motivo = motivo;
  if (enfermedadActual) structured.enfermedad_actual = enfermedadActual;
  if (diagnostico) structured.diagnostico = diagnostico;
  if (indicaciones) structured.indicaciones = indicaciones;
  if (fechaControl) structured.fecha_control = fechaControl;

  const vitals: Record<string, string> = {};
  for (const k of VITAL_KEYS) {
    const v = (formData.get(`vital_${k}`) as string | null)?.trim();
    if (v) vitals[k] = v;
  }
  if (Object.keys(vitals).length > 0) structured.vitals = vitals;

  const examFisico: Record<string, string> = {};
  for (const k of EXAM_FISICO_KEYS) {
    const v = (formData.get(`examen_fisico_${k}`) as string | null)?.trim();
    if (v) examFisico[k] = v;
  }
  if (Object.keys(examFisico).length > 0) structured.examen_fisico = examFisico;

  // Campos especializados: el form los envía con prefijo `esp_<key>`. Se recorren
  // genéricamente para soportar tanto el catálogo base como los campos propios de
  // la clínica (clinic_specialty_fields), cuyas claves no están en el catálogo TS.
  const especializados: Record<string, string> = {};
  for (const [name, value] of Array.from(formData.entries())) {
    if (!name.startsWith("esp_") || typeof value !== "string") continue;
    const v = value.trim();
    if (v) especializados[name.slice(4)] = v;
  }
  if (Object.keys(especializados).length > 0) structured.especializados = especializados;

  return structured;
}

// Valida tipo/tamaño de los adjuntos. Devuelve mensaje de error o null si OK.
function validateAttachmentFiles(files: File[]): string | null {
  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      return `Tipo de archivo no permitido (${file.name}). Solo imágenes (JPG, PNG, WEBP, GIF) o PDF.`;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return `"${file.name}" supera el máximo de 10 MB.`;
    }
  }
  return null;
}

// Sube adjuntos al bucket privado + registra metadatos. Devuelve los nombres
// que fallaron (binario subido sin metadato se borra para no dejar huérfanos).
async function uploadAttachments(
  supabase: ReturnType<typeof createClient>,
  files: File[],
  clinicId: string,
  noteId: string,
  profId: string
): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    const path = `${clinicId}/${noteId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
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
        clinical_note_id: noteId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: profId,
      });

    if (metaErr) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
      failed.push(file.name);
    }
  }
  return failed;
}

// Ventana de edición de notas: 24 horas desde la creación.
const NOTE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  const structured = parseStructuredData(formData);

  // Validamos los adjuntos ANTES de insertar la nota: si alguno es inválido,
  // no dejamos una nota a medias.
  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const fileError = validateAttachmentFiles(files);
  if (fileError) return { error: fileError };

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
  const failed = await uploadAttachments(supabase, files, clinicId, note.id, prof.id);

  revalidatePath(`/patients/${patient_id}`);
  if (failed.length > 0) {
    return {
      warning: `La nota se guardó, pero no se pudieron adjuntar: ${failed.join(", ")}.`,
    };
  }
  return {};
}

// Edita una nota dentro de la ventana de 24h. Solo el autor (resuelto del JWT)
// puede editarla; la ventana se valida server-side (el botón en el cliente es
// solo UX). Permite agregar adjuntos nuevos; no elimina los existentes.
export async function updateClinicalNote(
  formData: FormData
): Promise<{ error?: string; warning?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Volvé a iniciar sesión." };

  const { data: prof } = await supabase
    .from("professionals")
    .select("id, staff_members!inner(auth_user_id)")
    .eq("staff_members.auth_user_id", user.id)
    .single();
  if (!prof) return { error: "Solo profesionales pueden editar notas clínicas." };

  const id = formData.get("id") as string;
  if (!id) return { error: "Falta la nota a editar." };

  // Cargar la nota para validar autoría y ventana temporal (server-side).
  const { data: existing } = await supabase
    .from("clinical_notes")
    .select("author_id, created_at, patient_id, clinic_id")
    .eq("id", id)
    .single();
  const cur = existing as {
    author_id?: string;
    created_at?: string;
    patient_id?: string;
    clinic_id?: string;
  } | null;
  if (!cur) return { error: "La nota no existe o no tenés acceso." };
  if (cur.author_id !== (prof as { id: string }).id) {
    return { error: "Solo el autor de la nota puede editarla." };
  }
  const ageMs = Date.now() - new Date(cur.created_at!).getTime();
  if (ageMs > NOTE_EDIT_WINDOW_MS) {
    return { error: "La nota ya no se puede editar: pasaron más de 24 horas." };
  }

  const note_type = formData.get("note_type") as string;
  const body = (formData.get("body") as string)?.trim();
  const treatment_id = (formData.get("treatment_id") as string) || null;
  if (!note_type || !body) {
    return { error: "Tipo y contenido son obligatorios." };
  }

  const structured = parseStructuredData(formData);

  const files = formData
    .getAll("attachments")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const fileError = validateAttachmentFiles(files);
  if (fileError) return { error: fileError };

  const { error } = await supabase
    .from("clinical_notes")
    .update({
      note_type,
      body,
      treatment_id: treatment_id || null,
      structured_data: structured,
    })
    .eq("id", id);
  if (error) return { error: `No se pudo guardar la edición: ${error.message}` };

  // Adjuntos nuevos (opcional). El clinic_id sale de la nota, no del cliente.
  let failed: string[] = [];
  if (files.length > 0 && cur.clinic_id) {
    failed = await uploadAttachments(
      supabase,
      files,
      cur.clinic_id,
      id,
      (prof as { id: string }).id
    );
  }

  revalidatePath(`/patients/${cur.patient_id}`);
  if (failed.length > 0) {
    return {
      warning: `La nota se actualizó, pero no se pudieron adjuntar: ${failed.join(", ")}.`,
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

  const medical_history =
    (formData.get("medical_history") as string | null)?.trim() || null;
  const antecedentes_familiares =
    (formData.get("antecedentes_familiares") as string | null)?.trim() || null;

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
        medical_history,
        antecedentes_familiares,
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
  config: Record<string, boolean | string | Record<string, boolean>>
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

// ─── Dictado por voz → nota estructurada con IA ─────────────────────────────────

export interface DictationResult {
  body: string;
  motivo?: string;
  enfermedad_actual?: string;
  vitals?: Record<string, string>;
  examen_fisico?: Record<string, string>;
  indicaciones?: string;
  fecha_control?: string;
  especializados?: Record<string, string>;
}

// Recibe el audio dictado por el profesional (base64) y lo convierte en una nota
// clínica estructurada con Gemini (transcribe + organiza en campos). La API key
// vive solo en el server. Verifica que el usuario sea profesional para evitar
// uso indebido. Devuelve sugerencias para precargar el formulario — el profesional
// SIEMPRE revisa y confirma antes de guardar (la IA no escribe en la historia).
export async function transcribeNoteDictation(input: {
  audioBase64: string;
  mimeType: string;
  fields?: string[]; // campos activos del profesional (para enfocar la salida)
}): Promise<{ data?: DictationResult; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "Falta configurar GEMINI_API_KEY en el entorno." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Volvé a iniciar sesión." };

  const { data: prof } = await supabase
    .from("professionals")
    .select("id, staff_members!inner(auth_user_id)")
    .eq("staff_members.auth_user_id", user.id)
    .single();
  if (!prof) return { error: "Solo profesionales pueden dictar notas." };

  if (!input.audioBase64) return { error: "No se recibió audio." };

  const enabled = new Set(input.fields ?? []);
  const wants = (k: string) => enabled.size === 0 || enabled.has(k);

  // Fecha de hoy (zona de la clínica) para resolver expresiones relativas
  // del dictado ("en 15 días", "el lunes que viene") al campo fecha_control.
  const TZ = "America/Argentina/Buenos_Aires";
  const now = new Date();
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
  const todayHuman = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(now);

  // Campos de especialidad habilitados para este profesional. El cliente los
  // manda como `esp:<key>`; el modelo solo debe completar los que se mencionen.
  const espWanted = SPECIALTY_FIELD_DEFS.filter((f) => enabled.has(`esp:${f.key}`));
  const espLines = espWanted
    .map(
      (f) =>
        `    - ${f.key}: ${f.label}${f.placeholder ? ` (ej. ${f.placeholder})` : ""}.`
    )
    .join("\n");

  // La impresión diagnóstica NUNCA se dicta: va por sugerencia IA separada
  // que el médico confirma obligatoriamente. No se incluye en este prompt.
  const camposPedidos = [
    "- body: texto de la nota clínica en prosa clara, en español (OBLIGATORIO).",
    wants("motivo")
      ? "- motivo: motivo de consulta en palabras del paciente, si se menciona."
      : "",
    wants("enfermedad_actual")
      ? "- enfermedad_actual: síntomas, tiempo de evolución y estudios previos mencionados."
      : "",
    wants("vitals")
      ? '- vitals: { ta, fc, fr, temp, peso, talla, sato2 } con unidad, solo los mencionados.'
      : "",
    wants("examen_fisico")
      ? '- examen_fisico: objeto con hallazgos por sistema { general, piel, cabeza_cuello, cardiovascular, respiratorio, abdomen, genitourinario, neurologico, musculoesqueletico, oftalmologico, orl }, solo los mencionados.'
      : "",
    wants("indicaciones")
      ? "- indicaciones: indicaciones, plan o tratamiento indicado, si se menciona."
      : "",
    wants("fecha_control")
      ? `- fecha_control: fecha del próximo control en formato YYYY-MM-DD. Hoy es ${todayHuman} (${todayISO}); resolvé expresiones relativas ("en 15 días", "la semana que viene") respecto de esa fecha. Omití la clave si no se menciona ninguna fecha de control.`
      : "",
    espWanted.length > 0
      ? `- especializados: objeto con los campos de especialidad mencionados (incluí SOLO los que aparezcan en el dictado):\n${espLines}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = [
    "Sos un asistente de transcripción clínica. El audio es el dictado de un",
    "profesional de salud durante o después de una consulta médica.",
    "Transcribí y organizá en un objeto JSON con estas claves (todas opcionales salvo body):",
    camposPedidos,
    "",
    "Reglas:",
    "- No inventes datos: si algo no se menciona, omití la clave.",
    "- Completá un campo SOLO si el dictado contiene información que le corresponde.",
    "- Corregí muletillas y errores obvios de dictado, sin alterar el contenido clínico.",
    "- Respondé ÚNICAMENTE el JSON, sin texto adicional ni markdown.",
  ].join("\n");

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: input.mimeType, data: input.audioBase64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      // 400 suele ser formato de audio no soportado.
      if (resp.status === 400) {
        return {
          error: "No se pudo procesar el audio (formato no soportado). Probá de nuevo.",
        };
      }
      return { error: `El servicio de IA respondió ${resp.status}. ${detail.slice(0, 120)}` };
    }

    const data = (await resp.json()) as GeminiResponse;
    const raw = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!raw) return { error: "La IA no devolvió texto del dictado." };

    let parsed: DictationResult;
    try {
      parsed = JSON.parse(raw) as DictationResult;
    } catch {
      // Si vino con texto alrededor, intentamos recortar el primer objeto JSON.
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return { error: "No se pudo interpretar la transcripción." };
      parsed = JSON.parse(m[0]) as DictationResult;
    }

    if (!parsed.body || !parsed.body.trim()) {
      return { error: "No se entendió el dictado. Probá hablar más claro." };
    }
    return { data: parsed };
  } catch (err) {
    return { error: `No se pudo contactar al servicio de IA: ${String(err)}` };
  }
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
      if (sd.enfermedad_actual) extra.push(`Enf. actual: ${sd.enfermedad_actual}`);
      if (sd.examen_fisico && Object.keys(sd.examen_fisico).length > 0) {
        const ef = Object.entries(sd.examen_fisico).map(([k, v]) => `${k}: ${v}`).join(", ");
        extra.push(`EF: ${ef}`);
      }
      if (sd.especializados && Object.keys(sd.especializados).length > 0) {
        const esp = Object.entries(sd.especializados).map(([k, v]) => `${k}: ${v}`).join(", ");
        extra.push(esp);
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

// ─── Sugerencia de diagnóstico con IA ─────────────────────────────────────────

// Recibe el contenido parcial de la consulta y devuelve 3-5 posibles impresiones
// diagnósticas. NO toma ni devuelve diagnóstico confirmado: eso lo hace el médico.
// La impresión diagnóstica jamás se dicta (ver transcribeNoteDictation); este
// endpoint es el único canal de IA para ese campo.
export async function suggestDiagnosis(content: {
  motivo?: string;
  enfermedad_actual?: string;
  vitals?: Record<string, string>;
  examen_fisico?: Record<string, string>;
  antecedentes?: string;
  body?: string;
}): Promise<{ suggestions?: string[]; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "Falta configurar GEMINI_API_KEY en el entorno." };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };
  const { data: prof } = await supabase
    .from("professionals")
    .select("id, staff_members!inner(auth_user_id)")
    .eq("staff_members.auth_user_id", user.id)
    .single();
  if (!prof) return { error: "Solo profesionales pueden usar el asistente diagnóstico." };

  const partes: string[] = [];
  if (content.antecedentes) partes.push(`Antecedentes: ${content.antecedentes}`);
  if (content.motivo) partes.push(`Motivo: ${content.motivo}`);
  if (content.enfermedad_actual) partes.push(`Enfermedad actual: ${content.enfermedad_actual}`);
  if (content.vitals && Object.keys(content.vitals).length > 0) {
    const LABELS: Record<string, string> = { ta:"TA",fc:"FC",fr:"FR",temp:"Temp",peso:"Peso",talla:"Talla",sato2:"SatO2" };
    partes.push(`Signos vitales: ${Object.entries(content.vitals).map(([k,v]) => `${LABELS[k]??k} ${v}`).join(", ")}`);
  }
  if (content.examen_fisico && Object.keys(content.examen_fisico).length > 0) {
    const ef = Object.entries(content.examen_fisico).map(([k,v]) => `${k}: ${v}`).join("; ");
    partes.push(`Examen físico: ${ef}`);
  }
  if (content.body) partes.push(`Nota: ${content.body}`);

  if (partes.length === 0) return { error: "No hay contenido clínico para analizar." };

  const prompt = [
    "Sos un asistente clínico. A partir de los datos de la consulta, sugerí",
    "entre 3 y 5 posibles impresiones diagnósticas ordenadas de mayor a menor probabilidad.",
    "Devolvé un JSON con la clave 'suggestions' (array de strings en español).",
    "Cada ítem: diagnóstico en 1 línea, conciso. No incluyas explicaciones largas.",
    "No inventes datos. Si el cuadro es inespecífico, indicá diagnósticos diferenciales.",
    "Respondé ÚNICAMENTE el JSON.",
    "",
    "Datos de la consulta:",
    ...partes,
  ].join("\n");

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!resp.ok) return { error: `El servicio de IA respondió ${resp.status}.` };

    const data = (await resp.json()) as GeminiResponse;
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("").trim();
    if (!raw) return { error: "La IA no devolvió sugerencias." };

    let parsed: { suggestions?: string[] };
    try {
      parsed = JSON.parse(raw) as { suggestions?: string[] };
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return { error: "No se pudieron interpretar las sugerencias." };
      parsed = JSON.parse(m[0]) as { suggestions?: string[] };
    }
    if (!parsed.suggestions?.length) return { error: "La IA no generó sugerencias." };
    return { suggestions: parsed.suggestions };
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
    enfermedad_actual?: string;
    vitals?: Record<string, string>;
    examen_fisico?: Record<string, string>;
    especializados?: Record<string, string>;
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
