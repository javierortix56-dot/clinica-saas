"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { initialsOf } from "@/lib/utils";
import {
  Calendar,
  Users,
  CheckCircle2,
  UserCog,
  Settings,
  LogOut,
  Plus,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Calendar;
  badge?: number;
};

/**
 * Contenido del sidebar (logo + navegación + tarjeta de usuario).
 * Reutilizado por el sidebar fijo de escritorio y por el drawer mobile.
 * `onNavigate` permite cerrar el drawer al tocar un link en mobile.
 */
export function SidebarContent({
  displayName,
  roleLabel,
  isOwner,
  approvalsCount,
  signOutAction,
  onNavigate,
}: {
  displayName: string;
  roleLabel: string;
  isOwner: boolean;
  approvalsCount: number;
  signOutAction: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const principal: NavItem[] = [
    { href: "/calendar", label: "Calendario", icon: Calendar },
    { href: "/patients", label: "Pacientes", icon: Users },
    {
      href: "/approvals",
      label: "Aprobaciones",
      icon: CheckCircle2,
      badge: approvalsCount > 0 ? approvalsCount : undefined,
    },
  ];

  const gestion: NavItem[] = isOwner
    ? [
        { href: "/staff", label: "Equipo", icon: UserCog },
        { href: "/settings", label: "Ajustes", icon: Settings },
      ]
    : [];

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/");
  }

  function NavLink({ item }: { item: NavItem }) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={`flex items-center gap-[11px] rounded-[10px] px-[11px] py-[9px] text-[13.5px] font-semibold transition-colors ${
          active
            ? "bg-primary/20 text-white"
            : "text-slate-400 hover:bg-sidebar-hover hover:text-slate-200"
        }`}
      >
        <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />
        <span className="flex-1">{item.label}</span>
        {item.badge ? (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <div className="flex h-full flex-col bg-sidebar px-[14px] py-5">
      {/* Logo + wordmark */}
      <div className="flex items-center gap-[11px] px-2 pb-[22px] pt-1">
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-primary shadow-[0_6px_16px_rgba(37,99,235,.3)]">
          <Plus className="h-5 w-5 text-white" strokeWidth={2.4} />
        </div>
        <div>
          <div className="text-[16px] font-extrabold leading-none tracking-tight text-white">
            Clínica
          </div>
          <div className="mt-[3px] text-[11px] font-medium leading-none text-slate-500">
            Gestión médica
          </div>
        </div>
      </div>

      <div className="px-[10px] pb-2 pt-[6px] text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-600">
        Principal
      </div>
      <nav className="flex flex-col gap-[3px]">
        {principal.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {gestion.length > 0 && (
        <>
          <div className="px-[10px] pb-2 pt-5 text-[10.5px] font-semibold uppercase tracking-[.09em] text-slate-600">
            Gestión
          </div>
          <nav className="flex flex-col gap-[3px]">
            {gestion.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>
        </>
      )}

      <div className="flex-1" />

      {/* User card */}
      <div className="flex items-center gap-[10px] rounded-[13px] bg-sidebar-hover p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">
          {initialsOf(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold leading-none text-white">
            {displayName}
          </div>
          <div className="mt-[3px] text-[11px] font-medium leading-none text-slate-400">
            {roleLabel}
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            title="Cerrar sesión"
            className="flex rounded-lg p-[5px] text-slate-500 transition-colors hover:bg-[#1f2d49] hover:text-slate-200"
          >
            <LogOut className="h-[17px] w-[17px]" strokeWidth={1.8} />
          </button>
        </form>
      </div>
    </div>
  );
}
