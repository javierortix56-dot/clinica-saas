"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Patient } from "@clinica/shared";
import { PatientSheet } from "./PatientSheet";

export function EditPatientButton({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Editar datos del paciente"
        className="flex shrink-0 items-center gap-[7px] rounded-[10px] border border-border bg-white px-[11px] py-[9px] text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 sm:px-[15px]"
      >
        <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
        <span className="hidden sm:inline">Editar datos</span>
      </button>
      <PatientSheet patient={patient} open={open} onOpenChange={setOpen} />
    </>
  );
}
