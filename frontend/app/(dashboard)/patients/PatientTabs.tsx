"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type {
  PatientAppointment,
  ClinicalNote,
  ClinicalAttachment,
  PatientTreatment,
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
import { createClinicalNote, summarizePatientHistory } from "./actions";

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

function NoteForm({
  patientId,
  treatments,
  onClose,
}: {
  patientId: string;
  treatments: PatientTreatment[];
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

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      <input type="hidden" name="patient_id" value={patientId} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Tipo</label>
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
            <label className="text-xs font-medium text-slate-600">
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

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Nota</label>
        <textarea
          name="body"
          required
          rows={4}
          placeholder="Escribí la nota clínica aquí…"
          className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">
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
}: {
  patientId: string;
  appointments: PatientAppointment[];
  notes: ClinicalNote[];
  treatments: PatientTreatment[];
  role: string | null;
}) {
  const [tab, setTab] = useState<"turnos" | "historia">("turnos");
  const [showForm, setShowForm] = useState(false);
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Notas clínicas del paciente ordenadas por fecha.
            </p>
            {!showForm && canCreateNote && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                + Nueva nota
              </Button>
            )}
          </div>

          {canCreateNote && notes.length > 0 && (
            <AiSummaryPanel patientId={patientId} />
          )}

          {showForm && (
            <NoteForm
              patientId={patientId}
              treatments={treatments}
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
