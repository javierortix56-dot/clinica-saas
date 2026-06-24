"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FIELD_DEFS,
  EXAM_FISICO_SISTEMAS,
  SPECIALTY_FIELD_DEFS,
  type ClinicSpecialty,
  type CustomSpecialtyField,
  type SpecialtyFieldDef,
} from "../patients/clinical-fields";
import {
  upsertSpecialty,
  deleteSpecialty,
  upsertSpecialtyField,
  deleteSpecialtyField,
} from "./actions";

type Draft = {
  id?: string;
  label: string;
  baseOff: Set<string>; // campos base DESACTIVADOS
  examSystems: Set<string>; // sistemas examen físico ACTIVADOS
  specialtyFields: Set<string>; // campos especializados ACTIVADOS
};

function emptyDraft(): Draft {
  return {
    label: "",
    baseOff: new Set(),
    examSystems: new Set(),
    specialtyFields: new Set(),
  };
}

function draftFrom(s: ClinicSpecialty): Draft {
  return {
    id: s.id,
    label: s.label,
    baseOff: new Set(s.baseOff),
    examSystems: new Set(s.examSystems),
    specialtyFields: new Set(s.specialtyFields),
  };
}

export function SpecialtiesManager({
  specialties,
  customFields,
}: {
  specialties: ClinicSpecialty[];
  customFields: CustomSpecialtyField[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");

  // Campo nuevo / edición de campo propio.
  const [fieldDraft, setFieldDraft] = useState<{
    id?: string;
    label: string;
    placeholder: string;
  } | null>(null);

  // Catálogo completo de campos especializados: base estático + propios de la clínica.
  const allSpecialtyFields: SpecialtyFieldDef[] = useMemo(
    () => [
      ...SPECIALTY_FIELD_DEFS,
      ...customFields.map((c) => ({
        key: c.key,
        label: c.label,
        placeholder: c.placeholder,
      })),
    ],
    [customFields]
  );

  const filteredFields = fieldSearch.trim()
    ? allSpecialtyFields.filter((f) =>
        f.label.toLowerCase().includes(fieldSearch.toLowerCase())
      )
    : allSpecialtyFields;

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  function saveDraft() {
    if (!draft) return;
    if (!draft.label.trim()) {
      toast.error("Poné un nombre a la especialidad.");
      return;
    }
    startTransition(async () => {
      const result = await upsertSpecialty({
        id: draft.id,
        label: draft.label.trim(),
        baseOff: Array.from(draft.baseOff),
        examSystems: Array.from(draft.examSystems),
        specialtyFields: Array.from(draft.specialtyFields),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(draft.id ? "Especialidad actualizada." : "Especialidad creada.");
      setDraft(null);
      setFieldSearch("");
      router.refresh();
    });
  }

  function removeSpecialty(s: ClinicSpecialty) {
    if (!confirm(`¿Eliminar la especialidad "${s.label}"?`)) return;
    startTransition(async () => {
      const result = await deleteSpecialty(s.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Especialidad eliminada.");
      router.refresh();
    });
  }

  function saveField() {
    if (!fieldDraft) return;
    if (!fieldDraft.label.trim()) {
      toast.error("Poné un nombre al campo.");
      return;
    }
    startTransition(async () => {
      const result = await upsertSpecialtyField({
        id: fieldDraft.id,
        label: fieldDraft.label.trim(),
        placeholder: fieldDraft.placeholder.trim() || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(fieldDraft.id ? "Campo actualizado." : "Campo creado.");
      setFieldDraft(null);
      router.refresh();
    });
  }

  function removeField(f: CustomSpecialtyField) {
    if (!confirm(`¿Eliminar el campo "${f.label}"?`)) return;
    startTransition(async () => {
      const result = await deleteSpecialtyField(f.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Campo eliminado.");
      router.refresh();
    });
  }

  const checkboxRow =
    "flex cursor-pointer items-center gap-2 rounded border border-slate-100 p-2 text-sm hover:bg-slate-50";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Especialidades y campos clínicos
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Definí las especialidades disponibles y qué campos clínicos incluye cada
            una. Los profesionales eligen su especialidad al configurar sus notas.
            Solo el administrador puede editarlas.
          </p>
        </div>
        {!draft && (
          <Button size="sm" onClick={() => setDraft(emptyDraft())} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" /> Nueva especialidad
          </Button>
        )}
      </div>

      {/* Editor de especialidad */}
      {draft && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">
              Nombre de la especialidad
            </label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="Ej. Odontólogo general"
              className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {/* Campos base */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Campos base (marcá los que se muestran)
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {FIELD_DEFS.map((f) => (
                <label key={f.key} className={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={!draft.baseOff.has(f.key)}
                    onChange={() =>
                      setDraft({ ...draft, baseOff: toggle(draft.baseOff, f.key) })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-slate-700">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sistemas del examen físico */}
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Examen físico — sistemas a mostrar
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {EXAM_FISICO_SISTEMAS.map((s) => (
                <label key={s.key} className={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={draft.examSystems.has(s.key)}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        examSystems: toggle(draft.examSystems, s.key),
                      })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-slate-700">{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Campos especializados */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Campos de especialidad a activar ({draft.specialtyFields.size})
              </p>
              <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Buscar campo…"
                  className="w-40 bg-transparent text-xs outline-none"
                />
              </div>
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded border border-slate-100 bg-white p-2 sm:grid-cols-2">
              {filteredFields.map((f) => (
                <label key={f.key} className={checkboxRow}>
                  <input
                    type="checkbox"
                    checked={draft.specialtyFields.has(f.key)}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        specialtyFields: toggle(draft.specialtyFields, f.key),
                      })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-slate-700">{f.label}</span>
                </label>
              ))}
              {filteredFields.length === 0 && (
                <p className="col-span-full p-2 text-xs text-slate-400">
                  Sin campos para esa búsqueda.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={saveDraft} disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar especialidad"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(null);
                setFieldSearch("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Lista de especialidades */}
      {specialties.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Todavía no hay especialidades. Creá la primera con “Nueva especialidad”.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {specialties.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {s.label}
                  </span>
                  {s.isBuiltin && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Base
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {s.specialtyFields.length} campos de especialidad ·{" "}
                  {s.examSystems.length} sistemas
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(draftFrom(s));
                    setFieldSearch("");
                  }}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => removeSpecialty(s)}
                  className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campos clínicos propios */}
      <div className="mt-2 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Campos clínicos propios
            </h3>
            <p className="text-xs text-muted-foreground">
              Campos a medida que se suman al catálogo y podés activar en cualquier
              especialidad.
            </p>
          </div>
          {!fieldDraft && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFieldDraft({ label: "", placeholder: "" })}
            >
              <Plus className="mr-1 h-4 w-4" /> Nuevo campo
            </Button>
          )}
        </div>

        {fieldDraft && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Nombre del campo
                </label>
                <input
                  type="text"
                  value={fieldDraft.label}
                  onChange={(e) =>
                    setFieldDraft({ ...fieldDraft, label: e.target.value })
                  }
                  placeholder="Ej. Índice de placa"
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Ayuda / placeholder <span className="text-slate-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={fieldDraft.placeholder}
                  onChange={(e) =>
                    setFieldDraft({ ...fieldDraft, placeholder: e.target.value })
                  }
                  placeholder="Ej. % de superficie con placa…"
                  className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveField} disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar campo"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFieldDraft(null)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {customFields.length > 0 && (
          <div className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {customFields.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{f.label}</div>
                  {f.placeholder && (
                    <div className="mt-0.5 truncate text-xs text-slate-400">
                      {f.placeholder}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setFieldDraft({
                        id: f.id,
                        label: f.label,
                        placeholder: f.placeholder,
                      })
                    }
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => removeField(f)}
                    className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
