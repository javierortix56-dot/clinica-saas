import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

// Decodifica el claim `user_role` del access token. El Custom Access Token Hook
// inyecta `user_role` (y `clinic_id`) en el JWT. El valor del enum en la BD es
// admin | doctor | reception (doctor == "profesional").
function decodeRole(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    const json = JSON.parse(
      Buffer.from(payload, "base64").toString("utf8")
    ) as { user_role?: string };
    return json.user_role ?? null;
  } catch {
    return null;
  }
}

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

  // Guard de rol: el profesional (doctor) no accede a la bandeja de aprobaciones.
  // Lo enviamos a /patients (su vista). No redirigimos a /login para evitar el
  // bucle con el middleware, que reenvía a usuarios con sesión fuera de /login.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const role = session ? decodeRole(session.access_token) : null;
  if (role === "doctor" || role === "professional") {
    redirect("/patients");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <span className="font-semibold">Clínica</span>
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
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
