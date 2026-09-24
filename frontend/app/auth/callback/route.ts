import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { HOME_PATH } from "@/lib/routes";

// Handler PKCE para magic links de Supabase Auth.
// Supabase redirige aquí con ?code=... después de que el usuario hace clic
// en el link del email. Intercambiamos el code por una sesión y redirigimos
// al destino correcto según el rol del usuario.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    await supabase.auth.exchangeCodeForSession(code);

    // Leer el rol del JWT (firma verificada) para saber a dónde redirigir.
    const { data: claimsData } = await supabase.auth.getClaims();
    const role = (claimsData?.claims as { user_role?: string } | undefined)
      ?.user_role;
    if (role === "patient") {
      return NextResponse.redirect(new URL("/portal/turnos", request.url));
    }
  }

  // Staff → inicio del panel (sin sesión, el middleware lo manda a /login).
  return NextResponse.redirect(new URL(HOME_PATH, request.url));
}
