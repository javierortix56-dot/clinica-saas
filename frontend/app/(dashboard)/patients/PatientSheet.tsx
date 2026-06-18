"use client";

import { useRef, useState, useTransition } from "react";
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
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | null;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
    </div>
  );
}

export function PatientSheet({
  patient,
  open,
  onOpenChange,
}: {
  patient?: Patient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 p-6">
          <SheetTitle>{patient ? "Editar paciente" : "Nuevo paciente"}</SheetTitle>
        </SheetHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5 p-6">
          {patient && <input type="hidden" name="id" value={patient.id} />}
          <Field
            label="Nombre completo"
            name="full_name"
            defaultValue={patient?.full_name}
            required
            placeholder="María González"
          />
          <Field
            label="DNI"
            name="national_id"
            defaultValue={patient?.national_id}
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
            label="Email"
            name="email"
            type="email"
            defaultValue={patient?.email}
            placeholder="paciente@email.com"
          />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Guardando…" : patient ? "Guardar cambios" : "Crear paciente"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
