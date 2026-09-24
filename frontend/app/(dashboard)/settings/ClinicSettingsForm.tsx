"use client";

import { useId, useTransition } from "react";
import { toast } from "sonner";

import type { ClinicSettings } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { updateClinicSettings } from "./actions";

const INPUT =
  "w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400";

function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: string;
  children: (ids: { id: string; hintId?: string }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children({ id, hintId })}
      {hint && (
        <p id={hintId} className="text-xs text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}

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
    <form
      onSubmit={handleSubmit}
      onInvalidCapture={(e) => {
        const details = (e.target as HTMLElement).closest("details");
        if (details) details.open = true;
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre del consultorio">
          {({ id }) => (
            <input id={id} name="name" required defaultValue={settings.name} className={INPUT} />
          )}
        </Field>

        <Field label="Teléfono de contacto">
          {({ id }) => (
            <input
              id={id}
              name="contact_phone"
              type="tel"
              defaultValue={settings.contact_phone ?? ""}
              placeholder="+54 11 ..."
              className={INPUT}
            />
          )}
        </Field>

        <Field label="Dirección principal">
          {({ id }) => (
            <input
              id={id}
              name="address"
              defaultValue={settings.address ?? ""}
              placeholder="Calle, número, localidad"
              className={INPUT}
            />
          )}
        </Field>

        <Field label="Duración predeterminada del turno">
          {({ id }) => (
            <select
              id={id}
              name="default_appointment_minutes"
              defaultValue={settings.default_appointment_minutes}
              className={INPUT}
            >
              {[20, 30, 45, 60, 90].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutos
                </option>
              ))}
            </select>
          )}
        </Field>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <input
            type="checkbox"
            name="auto_confirm_requests"
            defaultChecked={settings.auto_confirm_requests}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-700">
              Confirmar automáticamente solicitudes válidas
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Las reservas creadas por WhatsApp se confirman si el horario sigue disponible.
            </span>
          </span>
        </label>
      </div>

      {/* Parámetros que rara vez se tocan: quedan plegados, pero se envían igual. */}
      <details className="group rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 marker:text-slate-400">
          Opciones avanzadas de agenda y facturación
        </summary>
        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
          <Field label="Zona horaria">
            {({ id }) => (
              <input
                id={id}
                name="timezone"
                required
                defaultValue={settings.timezone}
                placeholder="America/Argentina/Buenos_Aires"
                className={INPUT}
              />
            )}
          </Field>

          <Field label="Moneda">
            {({ id }) => (
              <input
                id={id}
                name="currency"
                required
                defaultValue={settings.currency}
                placeholder="ARS"
                className={INPUT}
              />
            )}
          </Field>

          <Field
            label="Inicio del horario preferencial"
            hint="El asistente de turnos prioriza este rango horario."
          >
            {({ id, hintId }) => (
              <input
                id={id}
                aria-describedby={hintId}
                type="time"
                name="prime_time_start"
                required
                defaultValue={settings.prime_time_start}
                className={INPUT}
              />
            )}
          </Field>

          <Field label="Fin del horario preferencial">
            {({ id }) => (
              <input
                id={id}
                type="time"
                name="prime_time_end"
                required
                defaultValue={settings.prime_time_end}
                className={INPUT}
              />
            )}
          </Field>

          <Field
            label={
              <>
                Honorario de evaluación <span className="text-slate-400">(opcional)</span>
              </>
            }
            hint="Costo de la consulta de evaluación inicial."
          >
            {({ id, hintId }) => (
              <input
                id={id}
                aria-describedby={hintId}
                type="number"
                name="valuation_fee"
                step="0.01"
                min="0"
                defaultValue={settings.valuation_fee ?? ""}
                placeholder="0.00"
                className={INPUT}
              />
            )}
          </Field>
        </div>
      </details>

      <div className="pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar datos generales"}
        </Button>
      </div>
    </form>
  );
}
