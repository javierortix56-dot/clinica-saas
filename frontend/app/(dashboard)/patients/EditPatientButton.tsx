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
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-[7px] rounded-[10px] border border-border bg-white px-[15px] py-[9px] text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
        Editar datos
      </button>
      <PatientSheet patient={patient} open={open} onOpenChange={setOpen} />
    </>
  );
}
