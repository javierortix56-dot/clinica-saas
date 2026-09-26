"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Copy, Mail, MessageCircle } from "lucide-react";

import type { ClinicalNote } from "@/lib/supabase/server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { clinicDateFormatter, formatISODate, isISODate } from "@/lib/dates";
import { whatsappLink } from "@/lib/whatsapp";

export interface PatientContact {
  full_name: string;
  phone: string | null;
  email: string | null;
}

const consultDate = clinicDateFormatter({ day: "2-digit", month: "2-digit", year: "numeric" });

// Mensaje para el paciente: solo indicaciones y control. La nota libre, el
// examen y el diagnóstico son registro clínico interno y no se incluyen; el
// profesional puede agregar lo que quiera antes de enviar.
function buildMessage(note: ClinicalNote, patient: PatientContact): string {
  const sd = note.structured_data;
  const firstName = patient.full_name.trim().split(/\s+/)[0] ?? "";
  const lines = [
    `Hola ${firstName}. Estas son las indicaciones de la consulta del ${consultDate.format(note.created_at)}${note.author_name ? ` con ${note.author_name}` : ""}:`,
    "",
    sd.indicaciones?.trim() || "(escribir aquí las indicaciones)",
  ];
  if (sd.fecha_control && isISODate(sd.fecha_control)) {
    lines.push(
      "",
      `Próximo control: ${formatISODate(sd.fecha_control, { weekday: "long", day: "numeric", month: "long" })}.`
    );
  }
  lines.push("", "Ante cualquier duda, quedamos a disposición.");
  return lines.join("\n");
}

export function SendToPatientSheet({
  note,
  patient,
  open,
  onOpenChange,
}: {
  note: ClinicalNote | null;
  patient: PatientContact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const uid = useId();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open && note) setMessage(buildMessage(note, patient));
  }, [note, open, patient]);

  const waHref = whatsappLink(patient.phone, message);
  const mailHref = patient.email
    ? `mailto:${patient.email}?subject=${encodeURIComponent("Indicaciones de la consulta")}&body=${encodeURIComponent(message)}`
    : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado.");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el texto y copialo a mano.");
    }
  }

  const channel =
    "flex items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-[13px] font-bold transition";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 p-6">
          <SheetTitle>Enviar al paciente</SheetTitle>
          <p className="text-sm text-slate-500">{patient.full_name}</p>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-msg`} className="text-sm font-medium text-slate-700">
              Mensaje
            </label>
            <textarea
              id={`${uid}-msg`}
              rows={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-400">
              Incluye las indicaciones y la fecha de control. Revisalo antes de enviarlo.
            </p>
          </div>

          <div className="grid gap-2">
            {waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className={`${channel} bg-[#25D366] text-white hover:brightness-95`}
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                Enviar por WhatsApp
              </a>
            ) : (
              <p className="rounded-[10px] border border-dashed border-slate-200 px-3 py-2.5 text-center text-xs text-slate-400">
                Sin teléfono cargado: agregalo en “Editar paciente” para enviar por WhatsApp.
              </p>
            )}
            {mailHref ? (
              <a href={mailHref} className={`${channel} border border-border bg-white text-slate-700 hover:bg-slate-50`}>
                <Mail className="h-4 w-4" strokeWidth={2} />
                Enviar por email
              </a>
            ) : (
              <p className="rounded-[10px] border border-dashed border-slate-200 px-3 py-2.5 text-center text-xs text-slate-400">
                Sin email cargado.
              </p>
            )}
            <button
              type="button"
              onClick={copy}
              className={`${channel} border border-border bg-white text-slate-700 hover:bg-slate-50`}
            >
              <Copy className="h-4 w-4" strokeWidth={2} />
              Copiar mensaje
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
