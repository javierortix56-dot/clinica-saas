"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { UserRound } from "lucide-react";

import type { ProfessionalForScheduling } from "@/lib/supabase/server";
import { ALL_PROFESSIONALS, CALENDAR_PROF_COOKIE } from "./view-preference";

/**
 * Selector de profesional de la agenda (admin/recepción). Filtra en el
 * servidor turnos, bloqueos, franjas y el resumen del día. La elección se
 * guarda en cookie para que el enlace del menú la conserve.
 */
export function ProfessionalSelect({
  professionals,
  selectedId,
}: {
  professionals: ProfessionalForScheduling[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    document.cookie = `${CALENDAR_PROF_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("prof", value);
    router.push(`/calendar?${params.toString()}`, { scroll: false });
  }

  const box =
    "flex items-center gap-2 rounded-[10px] border border-border bg-white px-3 shadow-card-soft";
  const icon = <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={2} />;

  // Un solo profesional: no hay nada que elegir, pero se muestra de quién es la agenda.
  if (professionals.length === 1) {
    return (
      <div className={`${box} h-[40px] text-xs font-bold text-slate-700`}>
        {icon}
        <span className="truncate">{professionals[0].name}</span>
      </div>
    );
  }

  return (
    <label className={`${box} focus-within:border-primary`}>
      {icon}
      <span className="sr-only">Profesional</span>
      <select
        value={selectedId ?? ALL_PROFESSIONALS}
        onChange={(e) => onChange(e.target.value)}
        className="h-[38px] min-w-0 max-w-[220px] cursor-pointer truncate bg-transparent pr-1 text-xs font-bold text-slate-700 outline-none"
      >
        <option value={ALL_PROFESSIONALS}>Todos los profesionales</option>
        {professionals.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
