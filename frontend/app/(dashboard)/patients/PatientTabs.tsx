"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  Settings,
  Plus,
  Pencil,
  Search,
  Upload,
  Camera,
  CalendarPlus,
} from "lucide-react";

import type {
  PatientAppointment,
  ClinicalNote,
  ClinicalAttachment,
  PatientTreatment,
  PatientClinicalProfile,
  NoteStructuredData,
} from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  createClinicalNote,
  updateClinicalNote,
  summarizePatientHistory,
  updatePatientClinicalProfile,
  updateNoteFieldConfig,
  transcribeNoteDictation,
  suggestDiagnosis,
  type DictationResult,
} from "./actions";
import {
  FIELD_DEFS,
  VITAL_DEFS,
  EXAM_FISICO_SISTEMAS,
  SPECIALTY_FIELD_DEFS,
  SPECIALTY_PRESETS,
  isFieldEnabled,
  isSistemaEnabled,
  isSpecialtyFieldEnabled,
  buildConfigFromPreset,
  presetToSpecialty,
  type FieldKey,
  type NoteFieldConfig,
  type SpecialtyFieldDef,
  type ClinicSpecialty,
  type CustomSpecialtyField,
} from "./clinical-fields";

// ─── Formatters ───────────────────────────────────────────────────────────────

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
});

// ─── Badge helpers ────────────────────────────────────────────────────────────

const APPT_STATUS_CHIP: Record<
  string,
  { label: string; bg: string; fg: string; border: string; dot: string }
> = {
  proposed: { label: "Propuesto", bg: "#fffbeb", fg: "#b45309", border: "#fde68a", dot: "#f59e0b" },
  confirmed: { label: "Confirmado", bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0", dot: "#10b981" },
  in_progress: { label: "En curso", bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", dot: "#3b82f6" },
  completed: { label: "Completado", bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe", dot: "#3b82f6" },
  cancelled: { label: "Cancelado", bg: "#fff1f2", fg: "#be123c", border: "#fecdd3", dot: "#f43f5e" },
  no_show: { label: "Ausente", bg: "#fff1f2", fg: "#be123c", border: "#fecdd3", dot: "#f43f5e" },
};

function ApptStatusBadge({ status }: { status: string }) {
  const c = APPT_STATUS_CHIP[status] ?? {
    label: status, bg: "#f1f5f9", fg: "#64748b", border: "#e2e8f0", dot: "#94a3b8",
  };
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[4px] text-[11.5px] font-semibold"
      style={{ background: c.bg, color: c.fg, borderColor: c.border }}
    >
      <span className="h-[5px] w-[5px] rounded-full" style={{ background: c.dot }} />
      {c.label}
    </span>
  );
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  consulta: "Consulta", evolución: "Evolución",
  diagnóstico: "Diagnóstico", observación: "Observación",
};

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 pb-[10px] text-[14px] font-semibold transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Nueva nota — formulario inline ──────────────────────────────────────────

const NOTE_TYPES = [
  { value: "consulta", label: "Consulta" },
  { value: "evolución", label: "Evolución" },
  { value: "diagnóstico", label: "Diagnóstico" },
  { value: "observación", label: "Observación" },
];

const fieldLabel = "text-xs font-medium text-slate-600";
const fieldInput =
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

// Convierte un Blob de audio a base64 (sin el prefijo data:).
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Botón de dictado: graba audio del micrófono, lo manda a la IA y entrega una
// nota estructurada para precargar el formulario (el profesional revisa antes
// de guardar). Soporta navegadores con MediaRecorder + getUserMedia.
function DictationButton({
  fields,
  onResult,
}: {
  fields: string[];
  onResult: (d: DictationResult) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined";

  if (!supported) return null;

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const prefs = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = prefs.find((t) => MediaRecorder.isTypeSupported(t)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("processing");
        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const audioBase64 = await blobToBase64(blob);
          // Gemini espera el mime base, sin el parámetro ;codecs=…
          const baseMime = (recorder.mimeType || "audio/webm").split(";")[0];
          const result = await transcribeNoteDictation({
            audioBase64,
            mimeType: baseMime,
            fields,
          });
          if (result.error) {
            toast.error(result.error);
          } else if (result.data) {
            onResult(result.data);
            toast.success("Dictado transcripto. Revisá y completá la nota.");
          }
        } catch {
          toast.error("No se pudo procesar el audio.");
        } finally {
          setState("idle");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
    } catch {
      toast.error("No se pudo acceder al micrófono. Revisá los permisos.");
      setState("idle");
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  if (state === "processing") {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        Transcribiendo…
      </Button>
    );
  }
  if (state === "recording") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={stop}
        className="border-red-300 text-red-600 hover:bg-red-50"
      >
        ⏹ Detener (grabando…)
      </Button>
    );
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={start}>
      🎤 Dictar
    </Button>
  );
}

// Subir un archivo de audio ya grabado (p. ej. una nota de voz reenviada por
// WhatsApp) y transcribirlo con la misma IA que el dictado en vivo. Acepta los
// formatos comunes de notas de voz (ogg/opus, m4a, mp3…).
function AudioUploadButton({
  fields,
  onResult,
}: {
  fields: string[];
  onResult: (d: DictationResult) => void;
}) {
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setProcessing(true);
    try {
      const audioBase64 = await blobToBase64(file);
      // Las notas de voz de WhatsApp suelen llegar como ogg/opus; si el browser
      // no reporta el tipo, asumimos audio/ogg. Sin el parámetro ;codecs=…
      const baseMime = (file.type || "audio/ogg").split(";")[0];
      const result = await transcribeNoteDictation({
        audioBase64,
        mimeType: baseMime,
        fields,
      });
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        onResult(result.data);
        toast.success("Audio transcripto. Revisá y completá la nota.");
      }
    } catch {
      toast.error("No se pudo procesar el audio.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={processing}
        onClick={() => inputRef.current?.click()}
      >
        {processing ? (
          "Transcribiendo…"
        ) : (
          <span className="flex items-center gap-[6px]">
            <Upload className="h-[14px] w-[14px]" strokeWidth={1.9} />
            Subir audio
          </span>
        )}
      </Button>
    </>
  );
}

function NoteForm({
  patientId,
  treatments,
  config,
  clinicalProfile,
  specialtyFieldDefs,
  mode,
  note,
  onClose,
  canScheduleAppointment,
}: {
  patientId: string;
  treatments: PatientTreatment[];
  config: NoteFieldConfig;
  clinicalProfile: PatientClinicalProfile | null;
  specialtyFieldDefs: SpecialtyFieldDef[];
  mode: "create" | "edit";
  note?: ClinicalNote;
  onClose: () => void;
  canScheduleAppointment?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [cameraName, setCameraName] = useState<string | null>(null);

  const sd = note?.structured_data ?? {};
  const [noteType, setNoteType] = useState(note?.note_type ?? "consulta");
  const [treatmentId, setTreatmentId] = useState(note?.treatment_id ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [motivo, setMotivo] = useState(sd.motivo ?? "");
  const [enfermedadActual, setEnfermedadActual] = useState(sd.enfermedad_actual ?? "");
  const [diagnostico, setDiagnostico] = useState(sd.diagnostico ?? "");
  const [dxSuggestions, setDxSuggestions] = useState<string[]>([]);
  const [dxLoading, setDxLoading] = useState(false);
  const [indicaciones, setIndicaciones] = useState(sd.indicaciones ?? "");
  const [fechaControl, setFechaControl] = useState(sd.fecha_control ?? "");
  const [vitals, setVitals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const v = sd.vitals ?? {};
    for (const d of VITAL_DEFS) init[d.key] = v[d.key] ?? "";
    return init;
  });
  const [examFisico, setExamFisico] = useState<Record<string, string>>(() => {
    const ef = sd.examen_fisico ?? {};
    const init: Record<string, string> = {};
    for (const s of EXAM_FISICO_SISTEMAS) init[s.key] = ef[s.key] ?? "";
    return init;
  });
  const [especializados, setEspecializados] = useState<Record<string, string>>(() => {
    const esp = sd.especializados ?? {};
    const init: Record<string, string> = {};
    for (const f of specialtyFieldDefs) init[f.key] = esp[f.key] ?? "";
    return init;
  });

  const show = (k: FieldKey) => isFieldEnabled(config, k);

  // Campos especializados activos para esta especialidad (catálogo + propios).
  const activeSpecialtyFields = specialtyFieldDefs.filter((f) =>
    isSpecialtyFieldEnabled(config, f.key)
  );

  // Dictado: campos note-scope habilitados (excluye diagnostico, va por IA
  // separada) + los campos de especialidad activos (como `esp:<key>`). La IA
  // solo completa los que detecte en el audio.
  const dictationFields = [
    ...FIELD_DEFS.filter(
      (f) => f.scope === "note" && f.key !== "diagnostico" && show(f.key)
    ).map((f) => f.key as string),
    ...activeSpecialtyFields.map((f) => `esp:${f.key}`),
  ];

  function applyDictation(d: DictationResult) {
    setBody((prev) => (prev.trim() ? `${prev.trim()}\n${d.body}` : d.body));
    if (d.motivo) setMotivo((prev) => (prev.trim() ? prev : d.motivo!));
    if (d.enfermedad_actual)
      setEnfermedadActual((prev) => (prev.trim() ? prev : d.enfermedad_actual!));
    if (d.indicaciones)
      setIndicaciones((prev) => (prev.trim() ? prev : d.indicaciones!));
    if (d.fecha_control)
      setFechaControl((prev) => (prev.trim() ? prev : d.fecha_control!));
    if (d.vitals) {
      setVitals((prev) => {
        const next = { ...prev };
        for (const [k, val] of Object.entries(d.vitals!)) {
          if (val && !next[k]?.trim()) next[k] = val;
        }
        return next;
      });
    }
    if (d.examen_fisico) {
      setExamFisico((prev) => {
        const next = { ...prev };
        for (const [k, val] of Object.entries(d.examen_fisico!)) {
          if (val && !next[k]?.trim()) next[k] = val;
        }
        return next;
      });
    }
    if (d.especializados) {
      setEspecializados((prev) => {
        const next = { ...prev };
        for (const [k, val] of Object.entries(d.especializados!)) {
          if (val && k in next && !next[k]?.trim()) next[k] = val;
        }
        return next;
      });
    }
  }

  async function handleSuggestDx() {
    setDxLoading(true);
    setDxSuggestions([]);
    const result = await suggestDiagnosis({
      motivo: motivo || undefined,
      enfermedad_actual: enfermedadActual || undefined,
      vitals: Object.fromEntries(Object.entries(vitals).filter(([, v]) => v.trim())),
      examen_fisico: Object.fromEntries(Object.entries(examFisico).filter(([, v]) => v.trim())),
      antecedentes: clinicalProfile?.medical_history ?? undefined,
      body: body || undefined,
    });
    setDxLoading(false);
    if (result.error) {
      toast.error(result.error);
    } else if (result.suggestions) {
      setDxSuggestions(result.suggestions);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result =
        mode === "edit"
          ? await updateClinicalNote(formData)
          : await createClinicalNote(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success(mode === "edit" ? "Nota actualizada." : "Nota guardada.");
      router.refresh();
      onClose();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="patient_id" value={patientId} />
      {mode === "edit" && note && <input type="hidden" name="id" value={note.id} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          {mode === "edit" ? "Editar nota" : "Nueva nota"}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <DictationButton fields={dictationFields} onResult={applyDictation} />
          <AudioUploadButton fields={dictationFields} onResult={applyDictation} />
        </div>
      </div>

      {/* Tipo + Tratamiento */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={fieldLabel}>Tipo</label>
          <select
            name="note_type"
            required
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {NOTE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        {treatments.length > 0 && (
          <div className="space-y-1">
            <label className={fieldLabel}>
              Tratamiento <span className="text-slate-400">(opcional)</span>
            </label>
            <select
              name="treatment_id"
              value={treatmentId}
              onChange={(e) => setTreatmentId(e.target.value)}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">— Sin tratamiento —</option>
              {treatments.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 1. Motivo de consulta */}
      {show("motivo") && (
        <div className="space-y-1">
          <label className={fieldLabel}>Motivo de consulta</label>
          <input
            type="text"
            name="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="En palabras del paciente: ej. 'me duele la panza desde ayer'"
            className={fieldInput}
          />
        </div>
      )}

      {/* 2. Enfermedad actual */}
      {show("enfermedad_actual") && (
        <div className="space-y-1">
          <label className={fieldLabel}>Enfermedad actual</label>
          <textarea
            name="enfermedad_actual"
            rows={3}
            value={enfermedadActual}
            onChange={(e) => setEnfermedadActual(e.target.value)}
            placeholder="Síntomas, tiempo de evolución, estudios previos relevantes…"
            className={fieldInput}
          />
        </div>
      )}

      {/* 3. Signos vitales */}
      {show("vitals") && (
        <div className="space-y-1">
          <label className={fieldLabel}>
            Signos vitales <span className="text-slate-400">(opcional)</span>
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {VITAL_DEFS.map((v) => (
              <div key={v.key} className="space-y-1">
                <label className="text-[11px] text-slate-500">{v.label}</label>
                <input
                  type="text"
                  name={`vital_${v.key}`}
                  value={vitals[v.key] ?? ""}
                  onChange={(e) =>
                    setVitals((prev) => ({ ...prev, [v.key]: e.target.value }))
                  }
                  placeholder={v.placeholder}
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Examen físico por sistema */}
      {show("examen_fisico") && (
        <div className="space-y-2">
          <label className={fieldLabel}>Examen físico</label>
          <div className="space-y-2">
            {EXAM_FISICO_SISTEMAS.filter((s) => isSistemaEnabled(config, s.key)).map((s) => (
              <div key={s.key} className="space-y-0.5">
                <label className="text-[11px] font-medium text-slate-500">{s.label}</label>
                <textarea
                  name={`examen_fisico_${s.key}`}
                  rows={1}
                  value={examFisico[s.key] ?? ""}
                  onChange={(e) =>
                    setExamFisico((prev) => ({ ...prev, [s.key]: e.target.value }))
                  }
                  placeholder={s.placeholder}
                  className={fieldInput}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Campos de especialidad (texto libre) */}
      {activeSpecialtyFields.length > 0 && (
        <div className="space-y-2 rounded border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Campos de especialidad
          </p>
          {activeSpecialtyFields.map((f) => (
            <div key={f.key} className="space-y-0.5">
              <label className="text-[11px] font-medium text-slate-500">{f.label}</label>
              <textarea
                name={`esp_${f.key}`}
                rows={1}
                value={especializados[f.key] ?? ""}
                onChange={(e) =>
                  setEspecializados((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                placeholder={f.placeholder}
                className={fieldInput}
              />
            </div>
          ))}
        </div>
      )}

      {/* 6. Nota libre */}
      <div className="space-y-1">
        <label className={fieldLabel}>Nota</label>
        <textarea
          name="body"
          required
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Texto libre de la consulta… o usá 🎤 Dictar"
          className={fieldInput}
        />
      </div>

      {/* 6. Impresión diagnóstica (IA sugiere, médico confirma) */}
      {show("diagnostico") && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label className={fieldLabel}>Impresión diagnóstica</label>
            <button
              type="button"
              onClick={handleSuggestDx}
              disabled={dxLoading}
              className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {dxLoading ? "Analizando…" : "🤖 Sugerir"}
            </button>
          </div>
          {dxSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dxSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDiagnostico(s);
                    setDxSuggestions([]);
                  }}
                  className="rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800 hover:bg-indigo-100"
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDxSuggestions([])}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
          )}
          <textarea
            name="diagnostico"
            rows={2}
            value={diagnostico}
            onChange={(e) => setDiagnostico(e.target.value)}
            placeholder="El médico confirma y puede editar la impresión diagnóstica."
            className={fieldInput}
          />
          <p className="text-xs text-slate-400">
            ⚠ La sugerencia IA es orientativa. El médico es responsable del diagnóstico confirmado.
          </p>
        </div>
      )}

      {/* 7. Indicaciones */}
      {show("indicaciones") && (
        <div className="space-y-1">
          <label className={fieldLabel}>Indicaciones / Tratamiento</label>
          <textarea
            name="indicaciones"
            rows={2}
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
            placeholder="Medicación, recetas, estudios solicitados, próximos pasos…"
            className={fieldInput}
          />
        </div>
      )}

      {/* 8. Fecha de control */}
      {show("fecha_control") && (
        <div className="space-y-1">
          <label className={fieldLabel}>Fecha de control</label>
          <input
            type="date"
            name="fecha_control"
            value={fechaControl}
            onChange={(e) => setFechaControl(e.target.value)}
            className={fieldInput}
          />
          {fechaControl && canScheduleAppointment && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/calendar?nuevo=1&paciente=${patientId}&fecha=${fechaControl}`
                )
              }
              className="mt-1 inline-flex items-center gap-[6px] rounded-[9px] border border-primary/25 bg-primary/[.07] px-[12px] py-[7px] text-[12.5px] font-bold text-primary transition hover:bg-primary/[.12]"
            >
              <CalendarPlus className="h-[15px] w-[15px]" strokeWidth={2} />
              Generar turno para esta fecha
            </button>
          )}
        </div>
      )}

      {/* Adjuntos */}
      <div className="space-y-1">
        <label className={fieldLabel}>
          Adjuntos <span className="text-slate-400">(imágenes o PDF — opcional)</span>
        </label>
        <input
          type="file"
          name="attachments"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium hover:file:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
        />

        {/* Captura desde la cámara (móvil). Comparte el name "attachments", así
            se envía junto con el resto en el mismo submit. */}
        <input
          ref={cameraRef}
          type="file"
          name="attachments"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setCameraName(e.target.files?.[0]?.name ?? null)}
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-[6px] rounded-[9px] border border-slate-200 bg-white px-[12px] py-[7px] text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Camera className="h-[15px] w-[15px]" strokeWidth={1.9} />
            Tomar foto
          </button>
          {cameraName && (
            <span className="truncate text-[12px] font-medium text-emerald-600">
              ✓ {cameraName}
            </span>
          )}
        </div>

        <p className="text-xs text-slate-400">
          {mode === "edit"
            ? "Se agregan a los adjuntos existentes. Máx. 10 MB por archivo."
            : "Radiografías, fotos clínicas o estudios. Máx. 10 MB por archivo."}
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Guardar nota"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

// ─── Panel de configuración de campos (por profesional) ───────────────────────

function NoteFieldConfigPanel({
  config,
  specialties,
  specialtyFieldDefs,
  onClose,
}: {
  config: NoteFieldConfig;
  specialties: ClinicSpecialty[];
  specialtyFieldDefs: SpecialtyFieldDef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [local, setLocal] = useState<Record<FieldKey, boolean>>(() => {
    const init = {} as Record<FieldKey, boolean>;
    for (const f of FIELD_DEFS) init[f.key] = isFieldEnabled(config, f.key);
    return init;
  });

  const [sistemas, setSistemas] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of EXAM_FISICO_SISTEMAS) init[s.key] = isSistemaEnabled(config, s.key);
    return init;
  });

  const [especializados, setEspecializados] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of specialtyFieldDefs) init[f.key] = isSpecialtyFieldEnabled(config, f.key);
    return init;
  });

  const [especialidad, setEspecialidad] = useState<string>(config.especialidad ?? "");

  function toggle(key: FieldKey) {
    setLocal((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  function toggleSistema(key: string) {
    setSistemas((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  function toggleEsp(key: string) {
    setEspecializados((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Aplica un preset: setea todos los toggles. El profesional puede ajustar luego.
  function applyPreset(slug: string) {
    setEspecialidad(slug);
    const preset = specialties.find((p) => p.slug === slug);
    if (!preset) return;
    const cfg = buildConfigFromPreset(preset, specialtyFieldDefs);
    const nextLocal = {} as Record<FieldKey, boolean>;
    for (const f of FIELD_DEFS) nextLocal[f.key] = cfg[f.key] !== false;
    setLocal(nextLocal);
    setSistemas({ ...(cfg.examen_fisico_sistemas ?? {}) });
    setEspecializados({ ...(cfg.especializados ?? {}) });
  }

  function handleSave() {
    startTransition(async () => {
      const fullConfig = {
        ...local,
        examen_fisico_sistemas: sistemas,
        especializados,
        especialidad,
      };
      const result = await updateNoteFieldConfig(fullConfig);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Configuración guardada.");
      router.refresh();
      onClose();
    });
  }

  // Campos especializados a mostrar como checkboxes: los del preset activo +
  // cualquiera ya activado. Evita listar los ~85 campos del catálogo completo.
  const activePresetFields = especialidad
    ? specialties.find((p) => p.slug === especialidad)?.specialtyFields ?? []
    : [];
  const visibleEspKeys = new Set<string>(activePresetFields);
  for (const [k, on] of Object.entries(especializados)) if (on) visibleEspKeys.add(k);
  const visibleEspFields = specialtyFieldDefs.filter((f) => visibleEspKeys.has(f.key));

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-medium text-slate-700">Configurar campos clínicos</p>
        <p className="text-xs text-slate-400">
          Elegí tu especialidad para cargar un paquete de campos, luego ajustá a gusto.
          Aplica a tus notas.
        </p>
      </div>

      {/* Selector de especialidad (paquete) */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Especialidad</label>
        <select
          value={especialidad}
          onChange={(e) => applyPreset(e.target.value)}
          className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">— Personalizado —</option>
          {specialties.map((p) => (
            <option key={p.id} value={p.slug}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Campos base */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Campos base</p>
        {FIELD_DEFS.map((f) => (
          <div key={f.key}>
            <label className="flex cursor-pointer items-start gap-2 rounded border border-slate-100 p-2 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={local[f.key]}
                onChange={() => toggle(f.key)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <span className="block text-sm text-slate-700">{f.label}</span>
                <span className="block text-xs text-slate-400">{f.hint}</span>
              </span>
            </label>
            {f.key === "examen_fisico" && local["examen_fisico"] && (
              <div className="ml-6 mt-1 grid grid-cols-2 gap-1 rounded border border-slate-100 bg-slate-50 p-2">
                <p className="col-span-2 text-xs font-medium text-slate-500 mb-1">
                  Aparatos / sistemas a mostrar:
                </p>
                {EXAM_FISICO_SISTEMAS.map((s) => (
                  <label key={s.key} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={sistemas[s.key] ?? true}
                      onChange={() => toggleSistema(s.key)}
                      className="h-3.5 w-3.5"
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Campos especializados */}
      {visibleEspFields.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Campos de especialidad
          </p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {visibleEspFields.map((f) => (
              <label
                key={f.key}
                className="flex cursor-pointer items-center gap-2 rounded border border-slate-100 p-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={especializados[f.key] ?? false}
                  onChange={() => toggleEsp(f.key)}
                  className="h-4 w-4"
                />
                <span className="text-slate-700">{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

// ─── Perfil clínico: antecedentes personales + familiares (nivel paciente) ────

function ClinicalProfileCard({
  patientId,
  profile,
  canEdit,
  showPersonales,
  showFamiliares,
}: {
  patientId: string;
  profile: PatientClinicalProfile | null;
  canEdit: boolean;
  showPersonales: boolean;
  showFamiliares: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Combina allergies (legacy) con medical_history para mostrar antecedentes personales.
  const personalesText = [profile?.allergies, profile?.medical_history]
    .filter(Boolean)
    .join("\n") || null;
  const familiaresText = profile?.antecedentes_familiares ?? null;
  const hasData = !!(personalesText || familiaresText);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePatientClinicalProfile(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Antecedentes actualizados.");
      router.refresh();
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4"
      >
        <input type="hidden" name="patient_id" value={patientId} />
        <p className="text-sm font-medium text-amber-900">Antecedentes del paciente</p>
        {showPersonales && (
          <div className="space-y-1">
            <label className={fieldLabel}>Antecedentes personales</label>
            <textarea
              name="medical_history"
              rows={3}
              defaultValue={personalesText ?? ""}
              placeholder="Patologías previas, cirugías, alergias, medicación habitual…"
              className={fieldInput}
            />
          </div>
        )}
        {showFamiliares && (
          <div className="space-y-1">
            <label className={fieldLabel}>Antecedentes familiares</label>
            <textarea
              name="antecedentes_familiares"
              rows={2}
              defaultValue={familiaresText ?? ""}
              placeholder="Enfermedades relevantes en familiares directos…"
              className={fieldInput}
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2 flex-1">
          <p className="text-sm font-medium text-amber-900">Antecedentes del paciente</p>
          {hasData ? (
            <dl className="space-y-1.5 text-sm">
              {showPersonales && personalesText && (
                <div>
                  <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Personales</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">{personalesText}</dd>
                </div>
              )}
              {showFamiliares && familiaresText && (
                <div>
                  <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Familiares</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">{familiaresText}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-slate-400">Sin antecedentes cargados.</p>
          )}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {hasData ? "Editar" : "Cargar"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Vista de datos estructurados dentro de cada nota ─────────────────────────

function StructuredDataView({
  data,
  specialtyFieldDefs,
}: {
  data: NoteStructuredData;
  specialtyFieldDefs: SpecialtyFieldDef[];
}) {
  const vitals = data.vitals ?? {};
  const vitalEntries = VITAL_DEFS.filter((v) => vitals[v.key]);
  const examEntries = Object.entries(data.examen_fisico ?? {}).filter(([, v]) => v);
  const espData = data.especializados ?? {};
  const espEntries = specialtyFieldDefs.filter((f) => espData[f.key]);
  const hasAny =
    data.motivo || data.enfermedad_actual || data.diagnostico ||
    data.indicaciones || data.fecha_control ||
    vitalEntries.length > 0 || examEntries.length > 0 || espEntries.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-2 border-t border-slate-100 pt-2 text-sm">
      {data.motivo && (
        <p>
          <span className="font-medium text-slate-600">Motivo: </span>
          <span className="text-slate-700">{data.motivo}</span>
        </p>
      )}
      {data.enfermedad_actual && (
        <p>
          <span className="font-medium text-slate-600">Enfermedad actual: </span>
          <span className="whitespace-pre-wrap text-slate-700">{data.enfermedad_actual}</span>
        </p>
      )}
      {vitalEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vitalEntries.map((v) => (
            <span
              key={v.key}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs"
            >
              <span className="font-medium text-slate-500">{v.label}</span>
              <span className="text-slate-700">{vitals[v.key]}</span>
            </span>
          ))}
        </div>
      )}
      {examEntries.length > 0 && (
        <div className="space-y-0.5">
          <p className="font-medium text-slate-600">Examen físico:</p>
          {examEntries.map(([key, val]) => {
            const def = EXAM_FISICO_SISTEMAS.find((s) => s.key === key);
            return (
              <p key={key} className="text-slate-700">
                <span className="font-medium text-slate-500">{def?.label ?? key}: </span>
                {val}
              </p>
            );
          })}
        </div>
      )}
      {espEntries.length > 0 && (
        <div className="space-y-0.5">
          {espEntries.map((f) => (
            <p key={f.key} className="text-slate-700">
              <span className="font-medium text-slate-500">{f.label}: </span>
              <span className="whitespace-pre-wrap">{espData[f.key]}</span>
            </p>
          ))}
        </div>
      )}
      {data.diagnostico && (
        <p>
          <span className="font-medium text-slate-600">Impresión dx: </span>
          <span className="whitespace-pre-wrap text-slate-700">{data.diagnostico}</span>
        </p>
      )}
      {data.indicaciones && (
        <p>
          <span className="font-medium text-slate-600">Indicaciones: </span>
          <span className="whitespace-pre-wrap text-slate-700">{data.indicaciones}</span>
        </p>
      )}
      {data.fecha_control && (
        <p>
          <span className="font-medium text-slate-600">Control: </span>
          <span className="text-slate-700">{data.fecha_control}</span>
        </p>
      )}
    </div>
  );
}

// ─── Adjuntos: galería + lightbox ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentGallery({
  attachments,
  onOpenImage,
}: {
  attachments: ClinicalAttachment[];
  onOpenImage: (url: string, alt: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {attachments.map((att) => {
        if (att.is_image && att.signed_url) {
          return (
            <button
              key={att.id}
              type="button"
              onClick={() => onOpenImage(att.signed_url!, att.file_name)}
              title={`${att.file_name} · ${formatBytes(att.size_bytes)}`}
              className="group relative h-20 w-20 overflow-hidden rounded border border-slate-200 bg-slate-50 transition hover:ring-2 hover:ring-slate-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.signed_url}
                alt={att.file_name}
                className="h-full w-full object-cover"
              />
            </button>
          );
        }
        // PDF u otro: enlace con ícono.
        return (
          <a
            key={att.id}
            href={att.signed_url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            title={`${att.file_name} · ${formatBytes(att.size_bytes)}`}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-slate-50 p-1 text-center transition hover:ring-2 hover:ring-slate-400"
          >
            <span className="text-lg">📄</span>
            <span className="line-clamp-2 text-[10px] leading-tight text-slate-500">
              {att.file_name}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function Lightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
      >
        ✕ Cerrar
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
      />
    </div>
  );
}

// ─── Resumen con IA ───────────────────────────────────────────────────────────

function AiSummaryPanel({ patientId }: { patientId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSummarize() {
    setLoading(true);
    setSummary(null);
    const result = await summarizePatientHistory(patientId);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSummary(result.summary ?? "");
  }

  return (
    <div className="rounded-[14px] border border-primary/20 bg-gradient-to-r from-primary/[.07] to-white px-[18px] py-[15px]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-primary">
            <Sparkles className="h-[18px] w-[18px] text-white" strokeWidth={1.9} />
          </div>
          <div>
            <div className="text-[14px] font-bold text-foreground">
              Resumen clínico con IA
            </div>
            <div className="mt-1 text-[12.5px] font-medium leading-[1.3] text-muted-foreground">
              Sintetizá la historia completa del paciente en segundos.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSummarize}
          disabled={loading}
          className="shrink-0 whitespace-nowrap rounded-[10px] border border-primary/20 bg-white px-[14px] py-2 text-[12.5px] font-bold text-primary transition hover:bg-primary/[.07] disabled:opacity-50"
        >
          {loading ? "Generando…" : summary ? "Regenerar" : "Generar resumen"}
        </button>
      </div>
      {summary && (
        <div className="mt-3 whitespace-pre-wrap border-t border-primary/10 pt-3 text-[13.5px] leading-relaxed text-slate-700">
          {summary}
        </div>
      )}
      {summary && (
        <p className="mt-2 text-[11px] text-slate-400">
          Generado por IA a partir de las notas. Revisalo antes de usarlo clínicamente.
        </p>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function PatientTabs({
  patientId,
  appointments,
  notes,
  treatments,
  role,
  clinicalProfile,
  noteConfig,
  specialties,
  customSpecialtyFields,
}: {
  patientId: string;
  appointments: PatientAppointment[];
  notes: ClinicalNote[];
  treatments: PatientTreatment[];
  role: string | null;
  clinicalProfile: PatientClinicalProfile | null;
  noteConfig: NoteFieldConfig;
  specialties: ClinicSpecialty[];
  customSpecialtyFields: CustomSpecialtyField[];
}) {
  // Catálogo de campos = base estático + campos propios de la clínica (DB).
  const specialtyFieldDefs: SpecialtyFieldDef[] = [
    ...SPECIALTY_FIELD_DEFS,
    ...customSpecialtyFields.map((c) => ({
      key: c.key,
      label: c.label,
      placeholder: c.placeholder,
    })),
  ];
  // Lista de especialidades = las de la clínica (DB) o los presets de fallback.
  const specialtyList: ClinicSpecialty[] = specialties.length
    ? specialties
    : SPECIALTY_PRESETS.map(presetToSpecialty);

  const [tab, setTab] = useState<"turnos" | "historia">("turnos");
  const [showForm, setShowForm] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);

  function openImage(url: string, alt: string) {
    setLightbox({ url, alt });
  }

  function switchTab(next: "turnos" | "historia") {
    setTab(next);
    if (next !== "historia") setNoteSearch("");
  }
  const canCreateNote = role === "admin" || role === "doctor";
  const canScheduleAppointment = role === "admin" || role === "reception" || role === "doctor";
  const showPersonales = isFieldEnabled(noteConfig, "antecedentes_personales");
  const showFamiliares = isFieldEnabled(noteConfig, "antecedentes_familiares");
  const showAntecedentes = canCreateNote && (showPersonales || showFamiliares);

  const filteredNotes = noteSearch.trim()
    ? notes.filter((n) => {
        const q = noteSearch.toLowerCase();
        return (
          n.body.toLowerCase().includes(q) ||
          (n.note_type ?? "").toLowerCase().includes(q) ||
          (n.treatment_name ?? "").toLowerCase().includes(q) ||
          (n.author_name ?? "").toLowerCase().includes(q)
        );
      })
    : notes;

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-slate-200">
        <TabButton active={tab === "turnos"} onClick={() => switchTab("turnos")}>
          Turnos ({appointments.length})
        </TabButton>
        <TabButton active={tab === "historia"} onClick={() => switchTab("historia")}>
          Historia clínica ({notes.length})
        </TabButton>
      </div>

      {/* Tab: Turnos */}
      {tab === "turnos" && (
        <>
          {appointments.length === 0 ? (
            <div className="rounded-card border border-border bg-white p-6 text-sm font-medium text-muted-foreground shadow-card-soft">
              Este paciente no tiene turnos registrados.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-white shadow-card-soft">
              <div className="hidden grid-cols-[1.4fr_1.2fr_1.6fr_1fr] border-b border-[#eef2f7] bg-[#fbfcfe] px-[22px] py-[13px] text-[11.5px] font-semibold uppercase tracking-[.05em] text-muted-foreground sm:grid">
                <div>Fecha / hora</div>
                <div>Profesional</div>
                <div>Tratamiento / Fase</div>
                <div>Estado</div>
              </div>
              {appointments.map((appt) => (
                <div
                  key={appt.id}
                  className="flex flex-col gap-2 border-b border-slate-100 px-4 py-[14px] last:border-0 sm:grid sm:grid-cols-[1.4fr_1.2fr_1.6fr_1fr] sm:items-center sm:gap-0 sm:px-[22px] sm:py-[15px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14px] font-bold text-foreground">
                      {dateTimeFormatter.format(new Date(appt.start_at))}
                    </div>
                    <div className="sm:hidden">
                      <ApptStatusBadge status={appt.status} />
                    </div>
                  </div>
                  <div className="text-[13.5px] font-medium text-slate-600">
                    {appt.professional_name ?? "—"}
                  </div>
                  <div className="text-[13.5px] font-medium text-slate-600">
                    {appt.treatment_label ?? "—"}
                  </div>
                  <div className="hidden sm:block">
                    <ApptStatusBadge status={appt.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: Historia clínica */}
      {tab === "historia" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-medium text-muted-foreground">
              Notas clínicas del paciente ordenadas por fecha.
            </p>
            {canCreateNote && (
              <div className="flex gap-[9px]">
                <button
                  type="button"
                  onClick={() => setShowConfig((v) => !v)}
                  className="flex items-center gap-[6px] rounded-[10px] border border-border bg-white px-[13px] py-2 text-[12.5px] font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Settings className="h-[14px] w-[14px]" strokeWidth={1.9} />
                  Campos
                </button>
                {!showForm && (
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-[6px] rounded-[10px] bg-primary px-[13px] py-2 text-[12.5px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07]"
                  >
                    <Plus className="h-[14px] w-[14px]" strokeWidth={2.4} />
                    Nueva nota
                  </button>
                )}
              </div>
            )}
          </div>

          {canCreateNote && showConfig && (
            <NoteFieldConfigPanel
              config={noteConfig}
              specialties={specialtyList}
              specialtyFieldDefs={specialtyFieldDefs}
              onClose={() => setShowConfig(false)}
            />
          )}

          {showAntecedentes && (
            <ClinicalProfileCard
              patientId={patientId}
              profile={clinicalProfile}
              canEdit={canCreateNote}
              showPersonales={showPersonales}
              showFamiliares={showFamiliares}
            />
          )}

          {canCreateNote && notes.length > 0 && (
            <AiSummaryPanel patientId={patientId} />
          )}

          {showForm && (
            <NoteForm
              patientId={patientId}
              treatments={treatments}
              config={noteConfig}
              clinicalProfile={clinicalProfile}
              specialtyFieldDefs={specialtyFieldDefs}
              mode="create"
              onClose={() => setShowForm(false)}
              canScheduleAppointment={canScheduleAppointment}
            />
          )}

          {notes.length > 0 && (
            <div className="flex items-center gap-[10px] rounded-[11px] border border-border bg-white px-[14px] py-[11px]">
              <Search className="h-4 w-4 text-slate-400" strokeWidth={1.9} />
              <input
                type="search"
                placeholder="Buscar en notas…"
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                className="flex-1 bg-transparent text-[13.5px] font-medium text-foreground outline-none placeholder:text-slate-400"
              />
            </div>
          )}

          {notes.length === 0 && !showForm ? (
            <div className="rounded-card border border-border bg-white p-6 text-sm font-medium text-muted-foreground shadow-card-soft">
              No hay notas clínicas para este paciente.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.length === 0 && noteSearch ? (
                <p className="text-sm text-slate-400">Sin resultados para "{noteSearch}".</p>
              ) : (
                filteredNotes.map((note) =>
                  editingNoteId === note.id ? (
                    <NoteForm
                      key={note.id}
                      patientId={patientId}
                      treatments={treatments}
                      config={noteConfig}
                      clinicalProfile={clinicalProfile}
                      specialtyFieldDefs={specialtyFieldDefs}
                      mode="edit"
                      note={note}
                      onClose={() => setEditingNoteId(null)}
                      canScheduleAppointment={canScheduleAppointment}
                    />
                  ) : (
                    <div
                      key={note.id}
                      className="space-y-3 rounded-card border border-border bg-white p-5 shadow-card-soft"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-border bg-slate-100 px-[11px] py-1 text-[12px] font-semibold text-slate-600">
                            {NOTE_TYPE_LABELS[note.note_type] ?? note.note_type}
                          </span>
                          {note.treatment_name && (
                            <span className="text-[12px] font-medium text-slate-400">
                              · {note.treatment_name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[12.5px] font-medium text-slate-400">
                            {dateFormatter.format(new Date(note.created_at))}
                            {note.author_name && ` · ${note.author_name}`}
                          </span>
                          {note.editable && (
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(note.id)}
                              className="flex items-center gap-[5px] text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-primary"
                              title="Editable hasta 24h después de creada"
                            >
                              <Pencil className="h-[13px] w-[13px]" strokeWidth={1.9} />
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">
                        {note.body}
                      </p>
                      <StructuredDataView
                        data={note.structured_data}
                        specialtyFieldDefs={specialtyFieldDefs}
                      />
                      <AttachmentGallery
                        attachments={note.attachments}
                        onOpenImage={openImage}
                      />
                    </div>
                  )
                )
              )}
            </div>
          )}
        </div>
      )}

      {lightbox && (
        <Lightbox
          url={lightbox.url}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
