"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  PatientAppointment,
  ClinicalNote,
  ClinicalAttachment,
  PatientTreatment,
  PatientClinicalProfile,
  NoteStructuredData,
} from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createClinicalNote,
  summarizePatientHistory,
  updatePatientClinicalProfile,
  updateNoteFieldConfig,
} from "./actions";
import {
  FIELD_DEFS,
  VITAL_DEFS,
  isFieldEnabled,
  type FieldKey,
  type NoteFieldConfig,
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

const APPT_STATUS_LABELS: Record<string, string> = {
  proposed: "Propuesto", confirmed: "Confirmado", in_progress: "En curso",
  completed: "Completado", cancelled: "Cancelado", no_show: "Ausente",
};

function ApptStatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    confirmed: "outline", completed: "secondary", proposed: "outline",
    in_progress: "default", cancelled: "outline", no_show: "destructive",
  };
  return (
    <Badge variant={variants[status] ?? "outline"} className={status === "cancelled" ? "text-slate-400" : ""}>
      {APPT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  consulta: "Consulta", evolución: "Evolución",
  diagnóstico: "Diagnóstico", observación: "Observación",
};

const NOTE_TYPE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  consulta: "outline", evolución: "secondary",
  diagnóstico: "default", observación: "outline",
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
      className={`border-b-2 px-4 pb-2 text-sm font-medium transition-colors ${
        active
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-500 hover:text-slate-700"
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

function NoteForm({
  patientId,
  treatments,
  config,
  onClose,
}: {
  patientId: string;
  treatments: PatientTreatment[];
  config: NoteFieldConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createClinicalNote(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success("Nota guardada.");
      }
      router.refresh();
      onClose();
    });
  }

  const show = (k: FieldKey) => isFieldEnabled(config, k);

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="patient_id" value={patientId} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className={fieldLabel}>Tipo</label>
          <select
            name="note_type"
            required
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

      {show("motivo") && (
        <div className="space-y-1">
          <label className={fieldLabel}>Motivo de consulta</label>
          <input
            type="text"
            name="motivo"
            placeholder="Ej: dolor en molar inferior derecho"
            className={fieldInput}
          />
        </div>
      )}

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
                  placeholder={v.placeholder}
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className={fieldLabel}>Nota</label>
        <textarea
          name="body"
          required
          rows={4}
          placeholder="Escribí la nota clínica aquí…"
          className={fieldInput}
        />
      </div>

      {show("diagnostico") && (
        <div className="space-y-1">
          <label className={fieldLabel}>Diagnóstico</label>
          <textarea name="diagnostico" rows={2} className={fieldInput} />
        </div>
      )}

      {show("indicaciones") && (
        <div className="space-y-1">
          <label className={fieldLabel}>Indicaciones / Plan</label>
          <textarea
            name="indicaciones"
            rows={2}
            placeholder="Tratamiento, medicación, próximos pasos…"
            className={fieldInput}
          />
        </div>
      )}

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
        <p className="text-xs text-slate-400">
          Radiografías, fotos clínicas o estudios. Máx. 10 MB por archivo.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar nota"}
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
  onClose,
}: {
  config: NoteFieldConfig;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Estado local de los toggles; arranca desde la config (default ON).
  const [local, setLocal] = useState<Record<FieldKey, boolean>>(() => {
    const init = {} as Record<FieldKey, boolean>;
    for (const f of FIELD_DEFS) init[f.key] = isFieldEnabled(config, f.key);
    return init;
  });

  function toggle(key: FieldKey) {
    setLocal((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateNoteFieldConfig(local);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Campos actualizados.");
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-medium text-slate-700">
          Configurar campos clínicos
        </p>
        <p className="text-xs text-slate-400">
          Activá solo los campos que usás en tu especialidad. Aplica a tus notas.
        </p>
      </div>
      <div className="space-y-2">
        {FIELD_DEFS.map((f) => (
          <label
            key={f.key}
            className="flex cursor-pointer items-start gap-2 rounded border border-slate-100 p-2 hover:bg-slate-50"
          >
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
        ))}
      </div>
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

// ─── Perfil clínico: alergias + antecedentes (nivel paciente) ─────────────────

function ClinicalProfileCard({
  patientId,
  profile,
  canEdit,
}: {
  patientId: string;
  profile: PatientClinicalProfile | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasData = !!(profile?.allergies || profile?.medical_history);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePatientClinicalProfile(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Perfil clínico actualizado.");
      router.refresh();
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-4"
      >
        <input type="hidden" name="patient_id" value={patientId} />
        <p className="text-sm font-medium text-rose-900">
          Alergias y antecedentes
        </p>
        <div className="space-y-1">
          <label className={fieldLabel}>Alergias</label>
          <textarea
            name="allergies"
            rows={2}
            defaultValue={profile?.allergies ?? ""}
            placeholder="Ej: penicilina, AINEs…"
            className={fieldInput}
          />
        </div>
        <div className="space-y-1">
          <label className={fieldLabel}>Antecedentes</label>
          <textarea
            name="medical_history"
            rows={3}
            defaultValue={profile?.medical_history ?? ""}
            placeholder="Patologías previas, cirugías, medicación habitual…"
            className={fieldInput}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-sm font-medium text-rose-900">
            ⚠ Alergias y antecedentes
          </p>
          {hasData ? (
            <dl className="space-y-1 text-sm">
              {profile?.allergies && (
                <div>
                  <dt className="inline font-medium text-slate-600">Alergias: </dt>
                  <dd className="inline whitespace-pre-wrap text-slate-700">
                    {profile.allergies}
                  </dd>
                </div>
              )}
              {profile?.medical_history && (
                <div>
                  <dt className="inline font-medium text-slate-600">
                    Antecedentes:{" "}
                  </dt>
                  <dd className="inline whitespace-pre-wrap text-slate-700">
                    {profile.medical_history}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-slate-400">Sin datos cargados.</p>
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

function StructuredDataView({ data }: { data: NoteStructuredData }) {
  const vitals = data.vitals ?? {};
  const vitalEntries = VITAL_DEFS.filter((v) => vitals[v.key]);
  const hasAny =
    data.motivo ||
    data.diagnostico ||
    data.indicaciones ||
    vitalEntries.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-2 border-t border-slate-100 pt-2 text-sm">
      {data.motivo && (
        <p>
          <span className="font-medium text-slate-600">Motivo: </span>
          <span className="text-slate-700">{data.motivo}</span>
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
      {data.diagnostico && (
        <p>
          <span className="font-medium text-slate-600">Diagnóstico: </span>
          <span className="whitespace-pre-wrap text-slate-700">
            {data.diagnostico}
          </span>
        </p>
      )}
      {data.indicaciones && (
        <p>
          <span className="font-medium text-slate-600">Indicaciones: </span>
          <span className="whitespace-pre-wrap text-slate-700">
            {data.indicaciones}
          </span>
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
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-indigo-900">
          🤖 Resumen clínico con IA
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSummarize}
          disabled={loading}
        >
          {loading ? "Generando…" : summary ? "Regenerar" : "Generar resumen"}
        </Button>
      </div>
      {summary && (
        <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
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
}: {
  patientId: string;
  appointments: PatientAppointment[];
  notes: ClinicalNote[];
  treatments: PatientTreatment[];
  role: string | null;
  clinicalProfile: PatientClinicalProfile | null;
  noteConfig: NoteFieldConfig;
}) {
  const [tab, setTab] = useState<"turnos" | "historia">("turnos");
  const [showForm, setShowForm] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
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
  const showAllergies = isFieldEnabled(noteConfig, "alergias");

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
            <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              Este paciente no tiene turnos registrados.
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha / hora</TableHead>
                    <TableHead>Profesional</TableHead>
                    <TableHead>Tratamiento / Fase</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((appt) => (
                    <TableRow key={appt.id}>
                      <TableCell className="text-sm">
                        {dateTimeFormatter.format(new Date(appt.start_at))}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {appt.professional_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {appt.treatment_label ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ApptStatusBadge status={appt.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Tab: Historia clínica */}
      {tab === "historia" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Notas clínicas del paciente ordenadas por fecha.
            </p>
            {canCreateNote && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowConfig((v) => !v)}
                >
                  ⚙ Campos
                </Button>
                {!showForm && (
                  <Button size="sm" onClick={() => setShowForm(true)}>
                    + Nueva nota
                  </Button>
                )}
              </div>
            )}
          </div>

          {canCreateNote && showConfig && (
            <NoteFieldConfigPanel
              config={noteConfig}
              onClose={() => setShowConfig(false)}
            />
          )}

          {canCreateNote && showAllergies && (
            <ClinicalProfileCard
              patientId={patientId}
              profile={clinicalProfile}
              canEdit={canCreateNote}
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
              onClose={() => setShowForm(false)}
            />
          )}

          {notes.length > 0 && (
            <input
              type="search"
              placeholder="Buscar en notas…"
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
          )}

          {notes.length === 0 && !showForm ? (
            <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
              No hay notas clínicas para este paciente.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredNotes.length === 0 && noteSearch ? (
                <p className="text-sm text-slate-400">Sin resultados para "{noteSearch}".</p>
              ) : (
                filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Badge variant={NOTE_TYPE_VARIANTS[note.note_type] ?? "outline"}>
                        {NOTE_TYPE_LABELS[note.note_type] ?? note.note_type}
                      </Badge>
                      {note.treatment_name && (
                        <span className="text-xs text-slate-400">
                          · {note.treatment_name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {dateFormatter.format(new Date(note.created_at))}
                      {note.author_name && ` · ${note.author_name}`}
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.body}</p>
                  <StructuredDataView data={note.structured_data} />
                  <AttachmentGallery
                    attachments={note.attachments}
                    onOpenImage={openImage}
                  />
                </div>
              ))
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
