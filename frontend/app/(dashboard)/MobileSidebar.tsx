"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent } from "./SidebarContent";

/**
 * Navegación mobile: botón hamburguesa (visible solo < md) que abre el sidebar
 * oscuro como drawer lateral. Se cierra al tocar cualquier link.
 */
export function MobileSidebar(props: {
  displayName: string;
  roleLabel: string;
  isOwner: boolean;
  approvalsCount: number;
  signOutAction: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-slate-600 transition-colors hover:bg-slate-100 md:hidden"
      >
        <Menu className="h-[22px] w-[22px]" strokeWidth={1.9} />
      </button>

      <SheetContent
        side="left"
        className="w-[262px] max-w-[80vw] border-0 bg-sidebar p-0 text-white [&>button]:text-slate-400 [&>button]:hover:text-white"
      >
        <SheetTitle className="sr-only">Navegación</SheetTitle>
        <SidebarContent {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
