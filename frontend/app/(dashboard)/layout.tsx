import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient, getSessionAuth } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const ROLE_BADGE: Record<string, { label: string; className: string }> = {
  admin:     { label: "Admin",      className: "bg-slate-700 text-white" },
  doctor:    { label: "Profesional", className: "bg-blue-600 text-white" },
  reception: { label: "Recepción",  className: "bg-green-600 text-white" },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  // Guard de sesión: getUser() revalida el token contra Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Ambas lecturas dependen solo de `user`; corren en paralelo para no encadenar
  // round-trips en cada navegación.
  const [{ role }, { data: sm }] = await Promise.all([
    getSessionAuth(),
    supabase
      .from("staff_members")
      .select("full_name")
      .eq("auth_user_id", user.id)
      .single(),
  ]);
  const displayName = sm?.full_name ?? user.email ?? "Usuario";

  const badge = role ? ROLE_BADGE[role] : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <span className="font-semibold">Clínica</span>

          {/* Todos los roles ven todos los links; /settings solo admin */}
          <Link
            href="/approvals"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Aprobaciones
          </Link>
          <Link
            href="/calendar"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Calendario
          </Link>
          <Link
            href="/patients"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Pacientes
          </Link>
          <Link
            href="/staff"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Equipo
          </Link>
          {role === "admin" && (
            <Link
              href="/settings"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Ajustes
            </Link>
          )}

          {/* Identidad del usuario logueado + cerrar sesión */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:inline">{displayName}</span>
            {badge && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            )}
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-slate-400 hover:text-slate-700 transition-colors"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
