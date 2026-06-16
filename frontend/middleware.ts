// TODO: middleware de Next.js.
// Responsabilidades:
//   1. Refrescar la sesión de Supabase (access token) en cada request.
//   2. Guard de rutas protegidas: redirigir a /login si no hay sesión.
//   3. Guard de rol: redirigir si el rol no tiene acceso a la ruta
//      (ej. professional intentando acceder a /approvals).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(_request: NextRequest) {
  // TODO: implementar con createServerClient de @supabase/ssr
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|login).*)",
  ],
};
