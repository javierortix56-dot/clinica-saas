import { redirect } from "next/navigation";

import { createClient, getSessionAuth } from "@/lib/supabase/server";
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

  // Guard de sesión: getUser() revalida el token contra Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Lecturas dependientes solo de `user`; corren en paralelo para no encadenar
  // round-trips en cada navegación. El conteo de aprobaciones alimenta el badge
  // del sidebar (solo cuenta, sin traer filas).
  const [{ role, isOwner }, { data: sm }, { count: approvalsCount }] =
    await Promise.all([
      getSessionAuth(),
      supabase
        .from("staff_members")
        .select("full_name")
        .eq("auth_user_id", user.id)
        .single(),
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("status", "proposed"),
    ]);

  const displayName = sm?.full_name ?? user.email ?? "Usuario";
  const roleLabel = role ? ROLE_LABEL[role] ?? "Usuario" : "Usuario";

  const navProps = {
    displayName,
    roleLabel,
    isOwner,
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
