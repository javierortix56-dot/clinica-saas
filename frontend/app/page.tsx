import { redirect } from "next/navigation";

// El magic link de Supabase redirige a /?code=... (site URL sin path).
// Reenviamos el code al handler PKCE antes de redirigir al login normal.
export default function RootPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const code = typeof searchParams.code === "string" ? searchParams.code : null;
  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }
  redirect("/login");
}
