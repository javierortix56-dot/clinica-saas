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

  // IMPORTANTE: no ejecutar lógica entre createServerClient y getClaims; esta
  // llamada revalida el token (firma incluida) y dispara el refresh de cookies.
  // NUNCA decodificar el JWT a mano acá: una cookie forjada pasaría los guards.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as
    | { sub?: string; user_role?: string }
    | undefined;
  const isAuthenticated = typeof claims?.sub === "string" && !!claims.sub;
  const userRole = typeof claims?.user_role === "string" ? claims.user_role : null;

  const { pathname } = request.nextUrl;

  // ─── Portal guards — deben ir ANTES de los guards del dashboard ──────────────
  //
  // /portal/login: siempre accesible. Si hay sesión patient → /portal/turnos.
  if (pathname.startsWith("/portal/login")) {
    if (isAuthenticated && userRole === "patient") {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/turnos";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // /portal/*: requiere sesión (cualquier tipo). Sin sesión → /portal/login.
  if (pathname.startsWith("/portal/")) {
    if (!isAuthenticated) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ─── Dashboard guards ─────────────────────────────────────────────────────────

  // Guard: sin sesión y fuera de /login → redirige a /login.
  if (!isAuthenticated && !pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Con sesión y en /login → redirige al inicio (evita re-login).
  if (isAuthenticated && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  // Guard de rol: /settings lo pueden abrir admin (config de la clínica) y doctor
  // (solo su sección de campos de la historia clínica; la página oculta el resto).
  // Recepción/paciente quedan fuera. user_role es un claim top-level del JWT
  // (inyectado por el Custom Access Token Hook, migración 0007) — getClaims() lo
  // devuelve ya verificado; getUser() no incluye los claims custom del hook.
  if (
    isAuthenticated &&
    pathname.startsWith("/settings") &&
    userRole !== "admin" &&
    userRole !== "doctor"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
