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

  const { pathname } = request.nextUrl;

  // ─── Portal guards — deben ir ANTES de los guards del dashboard ──────────────
  //
  // /portal/login: siempre accesible. Si hay sesión patient → /portal/turnos.
  if (pathname.startsWith("/portal/login")) {
    if (user) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const jwtPayload = JSON.parse(
            Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
          ) as { user_role?: string };
          if (jwtPayload.user_role === "patient") {
            const url = request.nextUrl.clone();
            url.pathname = "/portal/turnos";
            return NextResponse.redirect(url);
          }
        } catch {}
      }
    }
    return supabaseResponse;
  }

  // /portal/*: requiere sesión (cualquier tipo). Sin sesión → /portal/login.
  if (pathname.startsWith("/portal/")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ─── Dashboard guards ─────────────────────────────────────────────────────────

  // Guard: sin sesión y fuera de /login → redirige a /login.
  if (!user && !pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Con sesión y en /login → redirige al panel (evita re-login).
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/approvals";
    return NextResponse.redirect(url);
  }

  // Guard de rol: /settings es exclusivo de admin.
  // user_role es un claim top-level del JWT (inyectado por el Custom Access Token
  // Hook, migración 0007) — NO vive en app_metadata. Se decodifica desde el JWT
  // de la sesión; getUser() devuelve app_metadata de raw_app_meta_data (BD), que
  // no incluye los claims custom del hook.
  if (user && pathname.startsWith("/settings")) {
    let userRole: string | null = null;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      try {
        const payload = JSON.parse(
          Buffer.from(session.access_token.split(".")[1], "base64").toString("utf8")
        ) as { user_role?: string };
        userRole = payload.user_role ?? null;
      } catch {}
    }
    if (userRole !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/approvals";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
