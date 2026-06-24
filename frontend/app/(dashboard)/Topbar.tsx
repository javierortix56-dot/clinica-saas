import Link from "next/link";
import { Search, Plus } from "lucide-react";

import { MobileSidebar } from "./MobileSidebar";

export function Topbar(props: {
  displayName: string;
  roleLabel: string;
  isOwner: boolean;
  approvalsCount: number;
  signOutAction: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-[26px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Hamburguesa: solo mobile */}
        <MobileSidebar {...props} />

        {/* Búsqueda global (decorativa por ahora) — oculta en mobile */}
        <div className="hidden w-[320px] max-w-[36vw] items-center gap-[10px] rounded-[10px] border border-border bg-slate-100 px-3 py-2 sm:flex">
          <Search className="h-4 w-4 text-slate-400" strokeWidth={1.9} />
          <span className="text-[13px] font-medium text-slate-400">
            Buscar paciente, turno o nota…
          </span>
        </div>
      </div>

      <Link
        href="/calendar"
        className="flex shrink-0 items-center gap-[7px] rounded-[10px] bg-primary px-[13px] py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07] sm:px-[15px]"
      >
        <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
        <span className="hidden sm:inline">Nuevo turno</span>
        <span className="sm:hidden">Turno</span>
      </Link>
    </header>
  );
}
