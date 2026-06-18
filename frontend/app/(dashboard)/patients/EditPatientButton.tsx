"use client";

import { useState } from "react";
import type { Patient } from "@clinica/shared";
import { Button } from "@/components/ui/button";
import { PatientSheet } from "./PatientSheet";

export function EditPatientButton({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Editar datos
      </Button>
      <PatientSheet patient={patient} open={open} onOpenChange={setOpen} />
    </>
  );
}
