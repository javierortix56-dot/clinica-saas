"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, ChevronRight } from "lucide-react";

import type { Patient } from "@clinica/shared";
import { initialsOf } from "@/lib/utils";
import { PatientSheet } from "./PatientSheet";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeZone: "America/Argentina/Buenos_Aires",
});

// Paleta de avatares cíclica por índice (handoff de diseño).
const AVATAR_COLORS = [
  "#2563eb",
  "#0d9488",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#16a34a",
];


export function PatientsClient({ patients }: { patients: Patient[] }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.national_id.includes(q)
    );
  }, [patients, search]);

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-[22px] flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-extrabold tracking-[-.02em]">
            Pacientes
          </h1>
          <p className="mt-[9px] text-[14px] font-medium text-muted-foreground">
            Todos los pacientes registrados en la clínica.
          </p>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-[7px] rounded-[10px] bg-primary px-4 py-[10px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07]"
        >
          <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
          Nuevo paciente
        </button>
      </div>

      <div className="mb-[18px] flex max-w-[420px] items-center gap-[10px] rounded-[11px] border border-border bg-white px-[14px] py-[11px]">
        <Search className="h-[17px] w-[17px] text-slate-400" strokeWidth={1.9} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o DNI…"
          className="flex-1 bg-transparent text-[14px] font-medium text-foreground outline-none placeholder:text-slate-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-10 text-center text-[14px] font-medium text-muted-foreground shadow-card">
          {search
            ? "Sin resultados para esa búsqueda."
            : "No hay pacientes registrados."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
          <div className="hidden grid-cols-[2.2fr_1.6fr_1.2fr_1.1fr] border-b border-border bg-[#fbfcfe] px-[22px] py-[13px] text-[11.5px] font-semibold uppercase tracking-[.05em] text-muted-foreground sm:grid">
            <div>Nombre</div>
            <div>Teléfono</div>
            <div>DNI / ID</div>
            <div>Fecha de alta</div>
          </div>
          {filtered.map((p, i) => (
            <button
              key={p.id}
              onClick={() => router.push(`/patients/${p.id}`)}
              className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-[10px] text-left transition-colors last:border-0 hover:bg-slate-50 sm:grid sm:grid-cols-[2.2fr_1.6fr_1.2fr_1.1fr] sm:gap-0 sm:px-[22px] sm:py-[13px]"
            >
              {/* Nombre (+ DNI bajo el nombre solo en móvil) */}
              <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
                <span
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold text-white"
                  style={{
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                  }}
                >
                  {initialsOf(p.full_name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-foreground">
                    {p.full_name}
                  </div>
                  <div className="mt-[1px] font-mono text-[12px] text-slate-400 sm:hidden">
                    {p.national_id}
                  </div>
                </div>
              </div>

              {/* Teléfono — solo desktop */}
              <div className="hidden font-mono text-[13.5px] text-slate-600 sm:block">
                {p.phone ?? "—"}
              </div>

              {/* DNI — solo desktop */}
              <div className="hidden font-mono text-[13.5px] text-slate-600 sm:block">
                {p.national_id}
              </div>

              {/* Fecha de alta — solo desktop */}
              <div className="hidden items-center justify-between sm:flex">
                <span className="text-[13.5px] font-medium text-muted-foreground">
                  {dateFormatter.format(new Date(p.created_at))}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300" strokeWidth={2} />
              </div>

              {/* Chevron móvil */}
              <ChevronRight
                className="h-4 w-4 shrink-0 text-slate-300 sm:hidden"
                strokeWidth={2}
              />
            </button>
          ))}
        </div>
      )}

      <PatientSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
