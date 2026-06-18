import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

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

    // Leer el rol del JWT para saber a dónde redirigir.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const payload = JSON.parse(
          Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
        ) as { user_role?: string };
        if (payload.user_role === "patient") {
          return NextResponse.redirect(new URL("/portal/turnos", request.url));
        }
      } catch {}
    }
  }

  // Staff o error → login del staff.
  return NextResponse.redirect(new URL("/approvals", request.url));
}
