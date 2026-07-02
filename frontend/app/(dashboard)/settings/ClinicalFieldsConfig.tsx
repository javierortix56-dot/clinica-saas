"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { updateNoteFieldConfig } from "../patients/actions";
import {
  FIELD_DEFS,
  EXAM_FISICO_SISTEMAS,
  isFieldEnabled,
  isSistemaEnabled,
  isSpecialtyFieldEnabled,
  buildConfigFromPreset,
  type NoteFieldConfig,
  type ClinicSpecialty,
  type SpecialtyFieldDef,
  type FieldKey,
} from "../patients/clinical-fields";

/**
 * Configuración de los campos de la historia clínica del profesional logueado.
 *
 * Antes vivía dentro de la pestaña "Historia clínica" del paciente (panel ⚙
 * Campos); se movió acá, a Ajustes, porque es una preferencia del profesional
 * —no algo que se decida paciente por paciente—. La config es POR profesional
 * (professionals.note_field_config), así que cada doctor ajusta la suya.
 */
export function ClinicalFieldsConfig({
  config,
  specialties,
  specialtyFieldDefs,
}: {
  config: NoteFieldConfig;
  specialties: ClinicSpecialty[];
  specialtyFieldDefs: SpecialtyFieldDef[];
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
      toast.success("Campos de la historia clínica guardados.");
      router.refresh();
    });
  }

  // Campos especializados a mostrar como checkboxes: los del preset activo +
  // cualquiera ya activado. Evita listar los ~85 campos del catálogo completo.
  const visibleEspFields = useMemo(() => {
    const activePresetFields = especialidad
      ? specialties.find((p) => p.slug === especialidad)?.specialtyFields ?? []
      : [];
    const keys = new Set<string>(activePresetFields);
    for (const [k, on] of Object.entries(especializados)) if (on) keys.add(k);
    return specialtyFieldDefs.filter((f) => keys.has(f.key));
  }, [especialidad, especializados, specialties, specialtyFieldDefs]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-bold tracking-[-.01em]">
          Campos de la historia clínica
        </h2>
        <p className="mt-1 text-[13.5px] font-medium text-muted-foreground">
          Elegí tu especialidad para cargar un paquete de campos y luego ajustá a
          gusto. Define qué campos ves al cargar una nota. Aplica solo a tus notas.
        </p>
      </div>

      <div className="space-y-4 rounded-card border border-border bg-white p-5 shadow-card-soft">
        {/* Selector de especialidad (paquete) */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Especialidad</label>
          <select
            value={especialidad}
            onChange={(e) => applyPreset(e.target.value)}
            className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 sm:max-w-sm"
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
                  <p className="col-span-2 mb-1 text-xs font-medium text-slate-500">
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

        <div>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar campos"}
          </Button>
        </div>
      </div>
    </div>
  );
}
