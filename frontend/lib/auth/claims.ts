import type { SupabaseClient } from "@supabase/supabase-js";

// Claims custom que inyecta el Custom Access Token Hook (migraciones 0007/0009/0016).
export interface SessionClaims {
  sub: string;
  role: string | null; // user_role: admin | doctor | reception | patient
  clinicId: string | null;
  isOwner: boolean;
  patientId: string | null;
}

/**
 * Claims del JWT de sesión VERIFICADOS (firma incluida).
 *
 * `getClaims()` valida la firma del access token: con claves asimétricas lo hace
 * localmente contra el JWKS del proyecto (sin round-trip); con claves simétricas
 * cae a una verificación server-side. En ambos casos un token forjado devuelve
 * error y esta función responde null.
 *
 * NUNCA decodificar el JWT a mano (split('.') + base64): `getSession()` lee la
 * cookie sin validar, y una cookie con un token forjado (`is_owner: true`)
 * pasaría los chequeos de autorización de las Server Actions.
 */
export async function getVerifiedClaims(
  supabase: SupabaseClient
): Promise<SessionClaims | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const c = data.claims as Record<string, unknown>;
  if (typeof c.sub !== "string" || !c.sub) return null;
  return {
    sub: c.sub,
    role: typeof c.user_role === "string" ? c.user_role : null,
    clinicId: typeof c.clinic_id === "string" ? c.clinic_id : null,
    isOwner: c.is_owner === true,
    patientId: typeof c.patient_id === "string" ? c.patient_id : null,
  };
}
