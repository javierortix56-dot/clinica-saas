"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import type { ClinicSettings } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { updateClinicSettings } from "./actions";

export function ClinicSettingsForm({ settings }: { settings: ClinicSettings }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateClinicSettings(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Configuración guardada.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Nombre de la clínica</label>
          <input
            name="name"
            required
            defaultValue={settings.name}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Zona horaria</label>
          <input
            name="timezone"
            required
            defaultValue={settings.timezone}
            placeholder="America/Argentina/Buenos_Aires"
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            Inicio horario preferencial
          </label>
          <input
            type="time"
            name="prime_time_start"
            required
            defaultValue={settings.prime_time_start}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
          />
          <p className="text-xs text-slate-400">
            El motor de scheduling prioriza turnos en este rango horario.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            Fin horario preferencial
          </label>
          <input
            type="time"
            name="prime_time_end"
            required
            defaultValue={settings.prime_time_end}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Moneda</label>
          <input
            name="currency"
            required
            defaultValue={settings.currency}
            placeholder="ARS"
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            Honorario de valuación <span className="text-slate-400">(opcional)</span>
          </label>
          <input
            type="number"
            name="valuation_fee"
            step="0.01"
            min="0"
            defaultValue={settings.valuation_fee ?? ""}
            placeholder="0.00"
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
          />
          <p className="text-xs text-slate-400">
            Costo de la consulta de evaluación inicial.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar configuración"}
        </Button>
      </div>
    </form>
  );
}
