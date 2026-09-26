"use client";

import { useId, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Patient } from "@clinica/shared";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { upsertPatient } from "./actions";

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden>*</span>}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
      {hint && <p id={`${id}-hint`} className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export interface CreatedPatient {
  id: string;
  full_name: string;
  national_id: string;
}

// Separa lo que se venía buscando en DNI (solo dígitos) o nombre, para no
// volver a escribirlo en el alta.
export function prefillFromSearch(search: string): { full_name?: string; national_id?: string } {
  const text = search.trim();
  if (!text) return {};
  const digits = text.replace(/[.\s-]/g, "");
  return /^\d{6,}$/.test(digits) ? { national_id: digits } : { full_name: text };
}

export function PatientSheet({
  patient,
  open,
  onOpenChange,
  initialValues,
  onCreated,
}: {
  patient?: Patient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Alta: valores precargados (p. ej. lo que se buscó antes de crear).
  initialValues?: { full_name?: string; national_id?: string };
  // Alta desde otro flujo (p. ej. un turno): en vez de ir a la ficha, devuelve
  // el paciente creado para seguir donde se estaba.
  onCreated?: (created: CreatedPatient) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(formRef.current!);
    startTransition(async () => {
      const result = await upsertPatient(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(patient ? "Paciente actualizado." : "Paciente creado.");
      onOpenChange(false);
      if (!patient && result.id && onCreated) {
        onCreated({
          id: result.id,
          full_name: String(formData.get("full_name") ?? "").trim(),
          national_id: String(formData.get("national_id") ?? "").trim(),
        });
        router.refresh();
      } else if (!patient && result.id) {
        // Alta nueva → directo a su ficha, desde donde se agenda el primer turno.
        router.push(`/patients/${result.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 p-6">
          <SheetTitle>{patient ? "Editar paciente" : "Nuevo paciente"}</SheetTitle>
        </SheetHeader>
        {/* key: al reabrir con otra búsqueda, los defaultValue se vuelven a leer. */}
        <form
          key={`${initialValues?.full_name ?? ""}|${initialValues?.national_id ?? ""}`}
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-5 p-6"
        >
          {patient && <input type="hidden" name="id" value={patient.id} />}
          <Field
            label="Nombre completo"
            name="full_name"
            defaultValue={patient?.full_name ?? initialValues?.full_name}
            required
            placeholder="María González"
          />
          <Field
            label="DNI"
            name="national_id"
            defaultValue={patient?.national_id ?? initialValues?.national_id}
            required
            placeholder="12345678"
          />
          <Field
            label="Teléfono"
            name="phone"
            type="tel"
            defaultValue={patient?.phone}
            placeholder="+54 11 1234-5678"
          />
          <Field
            label="Fecha de nacimiento"
            name="birth_date"
            type="date"
            defaultValue={patient?.birth_date}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={patient?.email}
            placeholder="paciente@email.com"
            hint="Necesario para que el paciente acceda al Portal del Paciente."
          />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Guardando…" : patient ? "Guardar cambios" : "Crear paciente"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
