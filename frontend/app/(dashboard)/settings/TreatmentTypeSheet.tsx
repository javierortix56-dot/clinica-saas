"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";

import type { TreatmentTypeWithPhases, TreatmentPhase } from "@/lib/supabase/server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { upsertTreatmentType } from "./actions";

interface PhaseInput {
  id?: string;
  name: string;
  phase_kind: "clinical" | "lab_wait";
  duration_minutes: number | null;
  cooldown_days: number;
  is3d: boolean;
}

function phaseToInput(p: TreatmentPhase): PhaseInput {
  return {
    id: p.id,
    name: p.name,
    phase_kind: p.phase_kind,
    duration_minutes: p.duration_minutes,
    cooldown_days: p.cooldown_days,
    is3d: /3d|escaneo/i.test(p.name),
  };
}

function emptyPhase(): PhaseInput {
  return {
    name: "",
    phase_kind: "clinical",
    duration_minutes: null,
    cooldown_days: 0,
    is3d: false,
  };
}

export function TreatmentTypeSheet({
  mode,
  type,
  open,
  onOpenChange,
}: {
  mode: "create" | "edit";
  type?: TreatmentTypeWithPhases;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [phases, setPhases] = useState<PhaseInput[]>(() =>
    mode === "edit" && type ? type.phases.map(phaseToInput) : []
  );

  // Reset phases when sheet opens for a different type
  const [lastTypeId, setLastTypeId] = useState(type?.id);
  if (type?.id !== lastTypeId) {
    setLastTypeId(type?.id);
    setPhases(mode === "edit" && type ? type.phases.map(phaseToInput) : []);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("phase_count", String(phases.length));
    phases.forEach((p, i) => {
      formData.set(`phase_name_${i}`, p.name);
      formData.set(`phase_kind_${i}`, p.phase_kind);
      formData.set(`phase_duration_${i}`, p.duration_minutes != null ? String(p.duration_minutes) : "");
      formData.set(`phase_cooldown_${i}`, String(p.cooldown_days));
      formData.set(`phase_3d_${i}`, String(p.is3d));
    });

    startTransition(async () => {
      const result = await upsertTreatmentType(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === "create" ? "Tipo creado." : "Tipo actualizado.");
      onOpenChange(false);
    });
  }

  function updatePhase(index: number, patch: Partial<PhaseInput>) {
    setPhases((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function movePhase(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= phases.length) return;
    setPhases((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
  }

  function removePhase(index: number) {
    setPhases((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-slate-200 p-6">
          <SheetTitle>
            {mode === "create" ? "Nuevo tipo de tratamiento" : "Editar tipo de tratamiento"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 p-6">
          {mode === "edit" && type && (
            <input type="hidden" name="id" value={type.id} />
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Nombre</label>
            <input
              name="name"
              required
              defaultValue={type?.name ?? ""}
              placeholder="Ej: Ortodoncia"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Descripción <span className="text-slate-400">(opcional)</span>
            </label>
            <textarea
              name="description"
              rows={2}
              defaultValue={type?.description ?? ""}
              placeholder="Descripción breve del tratamiento…"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {/* Fases */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Fases ({phases.length})
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPhases((prev) => [...prev, emptyPhase()])}
              >
                + Agregar fase
              </Button>
            </div>

            {phases.map((phase, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">Fase {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => movePhase(i, -1)}
                      disabled={i === 0}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => movePhase(i, 1)}
                      disabled={i === phases.length - 1}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removePhase(i)}
                      className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs text-slate-500">Nombre de la fase</label>
                    <input
                      value={phase.name}
                      onChange={(e) => updatePhase(i, { name: e.target.value })}
                      placeholder="Ej: Colocación de brackets"
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Tipo</label>
                    <select
                      value={phase.phase_kind}
                      onChange={(e) =>
                        updatePhase(i, { phase_kind: e.target.value as "clinical" | "lab_wait" })
                      }
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <option value="clinical">Clínica</option>
                      <option value="lab_wait">Espera laboratorio</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">
                      Duración (min)
                      {phase.is3d && (
                        <Badge variant="secondary" className="ml-1 text-xs">+15 min automático</Badge>
                      )}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={phase.duration_minutes ?? ""}
                      onChange={(e) =>
                        updatePhase(i, {
                          duration_minutes: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      placeholder="60"
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-slate-500">Cooldown (días)</label>
                    <input
                      type="number"
                      min="0"
                      value={phase.cooldown_days}
                      onChange={(e) =>
                        updatePhase(i, { cooldown_days: parseInt(e.target.value, 10) || 0 })
                      }
                      placeholder="0"
                      className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`phase_3d_${i}`}
                      checked={phase.is3d}
                      onChange={(e) => updatePhase(i, { is3d: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <label htmlFor={`phase_3d_${i}`} className="text-xs text-slate-600">
                      Incluye escaneo digital 3D
                    </label>
                  </div>
                </div>
              </div>
            ))}

            {phases.length === 0 && (
              <p className="text-xs text-slate-400">
                Sin fases definidas. Agregá al menos una fase para configurar el tratamiento.
              </p>
            )}
          </div>

          <div className="mt-auto pt-4">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Guardando…" : mode === "create" ? "Crear tipo" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
