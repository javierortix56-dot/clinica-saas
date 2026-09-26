import { redirect } from "next/navigation";

import { createClient, getSessionAuth, isDoctorRole } from "@/lib/supabase/server";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

async function signOut() {
  "use server";
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administración",
  doctor: "Profesional",
  reception: "Recepción",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  // Guard de sesión con los claims del JWT verificados localmente (firma ES256
  // contra el JWKS): sin round-trip a Supabase Auth en cada navegación. El
  // middleware ya refrescó la sesión; los datos igual pasan por RLS.
  const { userId, email, role, isOwner } = await getSessionAuth();
  if (!userId) {
    redirect("/login");
  }

  // En paralelo: nombre para el menú y conteo del badge (solo solicitudes
  // vigentes; las vencidas no requieren una decisión urgente).
  const [{ data: sm }, { count: approvalsCount }] =
    await Promise.all([
      supabase
        .from("staff_members")
        .select("full_name")
        .eq("auth_user_id", userId)
        .single(),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "proposed")
        .gte("start_at", new Date().toISOString()),
    ]);

  const displayName = sm?.full_name ?? email ?? "Usuario";
  const roleLabel = role ? ROLE_LABEL[role] ?? "Usuario" : "Usuario";

  const navProps = {
    displayName,
    roleLabel,
    isOwner,
    isDoctor: isDoctorRole(role),
    approvalsCount: approvalsCount ?? 0,
    signOutAction: signOut,
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar {...navProps} />

      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar {...navProps} />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-5">
          <div className="animate-fade-up">{children}</div>
        </div>
      </div>
    </div>
  );
}
