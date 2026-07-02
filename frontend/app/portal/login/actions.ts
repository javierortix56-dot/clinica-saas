"use server";

import { createServerClient } from "@supabase/ssr";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// ─── Rate limiting ────────────────────────────────────────────────────────────
//
// Limitador en memoria por instancia (ventana fija). En Vercel cada instancia
// serverless tiene su propio Map, así que el límite efectivo es por instancia —
// suficiente para frenar scripts simples de enumeración de DNI y spam de OTP.
// Para un límite global real, migrar a Upstash Ratelimit o similar.
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitOk(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

function clientIp(): string {
  const fwd = headers().get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

// Mensaje único para TODOS los resultados de requestOtp: no revela si el DNI
// existe ni si tiene email (dato sensible en salud — evita enumeración).
const GENERIC_OTP_MESSAGE =
  "Si tu DNI está registrado y tiene un email asociado, te enviamos un código de 6 dígitos.";

// Busca el email del paciente por national_id usando el service role (sin RLS).
// La service key y el email NUNCA llegan al cliente.
async function findPatientEmail(nationalId: string): Promise<string | null> {
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("email")
    .eq("national_id", nationalId)
    .order("email", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.email) return null;
  return data.email as string;
}

/**
 * Paso 1 — solicita el OTP para un DNI.
 *
 * SIEMPRE responde igual (mensaje genérico), exista o no el DNI: la respuesta
 * distinta del diseño anterior permitía enumerar qué documentos estaban
 * registrados en la clínica y obtener el email asociado a un DNI ajeno.
 * El email real nunca sale del servidor; la verificación del código también es
 * server-side (verifyPortalOtp).
 */
export async function requestOtp(
  nationalId: string
): Promise<{ error?: string; message?: string }> {
  const trimmed = nationalId.trim();
  if (!trimmed) return { error: "Ingresá tu número de documento." };
  if (trimmed.length > 20) return { error: "Documento inválido." };

  // 5 solicitudes por IP y 3 por DNI cada 10 minutos.
  const windowMs = 10 * 60 * 1000;
  if (
    !rateLimitOk(`otp:ip:${clientIp()}`, 5, windowMs) ||
    !rateLimitOk(`otp:dni:${trimmed}`, 3, windowMs)
  ) {
    return {
      error: "Demasiados intentos. Esperá unos minutos y volvé a intentar.",
    };
  }

  const email = await findPatientEmail(trimmed);
  if (!email) {
    // Mismo mensaje que el caso de éxito — sin oráculo de existencia.
    return { message: GENERIC_OTP_MESSAGE };
  }

  const supabase = createClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (otpError) {
    // Error real de envío (p. ej. rate limit de Supabase). Mensaje genérico
    // para no diferenciar del caso "DNI inexistente".
    return { message: GENERIC_OTP_MESSAGE };
  }

  return { message: GENERIC_OTP_MESSAGE };
}

/**
 * Paso 2 — verifica el código server-side y crea la sesión (cookies).
 * El cliente nunca conoce el email: se re-resuelve desde el DNI acá.
 */
export async function verifyPortalOtp(
  nationalId: string,
  token: string
): Promise<{ error?: string }> {
  const trimmed = nationalId.trim();
  const code = token.trim();
  if (!trimmed || !/^\d{6}$/.test(code)) {
    return { error: "Código incorrecto o expirado." };
  }

  // 10 verificaciones por IP+DNI cada 10 minutos (anti fuerza bruta del OTP).
  if (!rateLimitOk(`verify:${clientIp()}:${trimmed}`, 10, 10 * 60 * 1000)) {
    return {
      error: "Demasiados intentos. Esperá unos minutos y volvé a intentar.",
    };
  }

  const email = await findPatientEmail(trimmed);
  if (!email) return { error: "Código incorrecto o expirado." };

  // Cliente cookie-aware: verifyOtp exitoso persiste la sesión en cookies.
  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });

  if (error) return { error: "Código incorrecto o expirado." };
  return {};
}
