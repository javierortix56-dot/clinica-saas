import Link from "next/link";
import { Search, Plus } from "lucide-react";

import { MobileSidebar } from "./MobileSidebar";
import { GlobalSearch } from "./GlobalSearch";

export function Topbar(props: {
  displayName: string;
  roleLabel: string;
  isOwner: boolean;
  isDoctor: boolean;
  approvalsCount: number;
  signOutAction: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-[26px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Hamburguesa: solo mobile */}
        <MobileSidebar {...props} />

        <GlobalSearch />

        {/* Mobile: acceso directo a la búsqueda de pacientes */}
        <Link
          href="/patients"
          aria-label="Buscar paciente"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-slate-600 transition-colors hover:bg-slate-100 sm:hidden"
        >
          <Search className="h-5 w-5" strokeWidth={1.9} />
        </Link>
      </div>

      <Link
        href="/calendar?nuevo=1"
        className="flex shrink-0 items-center gap-[7px] rounded-[10px] bg-primary px-[13px] py-[9px] text-[13px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,.3)] transition hover:brightness-[1.07] sm:px-[15px]"
      >
        <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
        <span className="hidden sm:inline">Nuevo turno</span>
        <span className="sm:hidden">Turno</span>
      </Link>
    </header>
  );
}
