import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión de Supabase en cada request y resuelve el guard de auth.
// Patrón estándar de @supabase/ssr para Next.js App Router: el cliente lee las
// cookies del request y escribe las cookies refrescadas en la response.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: no ejecutar lógica entre createServerClient y getUser; getUser
  // revalida el token y dispara el refresh de cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guard: sin sesión y fuera de /login → redirige a /login.
  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Con sesión y en /login → redirige al panel (evita re-login).
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/approvals";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
