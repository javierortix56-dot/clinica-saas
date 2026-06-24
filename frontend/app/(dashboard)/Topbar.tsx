import Link from "next/link";
import { Search, Plus } from "lucide-react";

export function Topbar() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-[26px]">
      {/* Búsqueda global (decorativa por ahora) */}
      <div className="flex w-[320px] max-w-[36vw] items-center gap-[10px] rounded-[10px] border border-border bg-slate-100 px-3 py-2">
        <Search className="h-4 w-4 text-slate-400" strokeWidth={1.9} />
        <span className="text-[13px] font-medium text-slate-400">
          Buscar paciente, turno o nota…
        </span>
      </div>

      <Link
        href="/calendar"
        className="flex items-center gap-[7px] rounded-[10px] bg-primary px-[15px] py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07]"
      >
        <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
        Nuevo turno
      </Link>
    </header>
  );
}
