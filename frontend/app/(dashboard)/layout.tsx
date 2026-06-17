import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient, getSessionAuth, isDoctorRole } from "@/lib/supabase/server";

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

  // El control de acceso por ROL vive en cada página, no acá: /approvals y
  // /patients rebotan al doctor a /calendar; /calendar rebota a no-doctores a
  // /approvals. Centralizar el redirect acá causaría un loop infinito, porque
  // este layout también envuelve a /calendar (la única vista del doctor).
  const { role } = await getSessionAuth();
  const doctor = isDoctorRole(role);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <span className="font-semibold">Clínica</span>
          {doctor ? (
            <Link
              href="/calendar"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Calendario
            </Link>
          ) : (
            <>
              <Link
                href="/approvals"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Aprobaciones
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
            </>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
