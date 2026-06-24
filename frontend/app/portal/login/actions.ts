"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";

// Busca el email del paciente por national_id usando el service role (sin RLS),
// y envía el OTP via Supabase Auth. La service key nunca llega al cliente.
export async function requestOtp(
  nationalId: string
): Promise<{ error?: string; email?: string }> {
  const trimmed = nationalId.trim();
  if (!trimmed) return { error: "Ingresá tu número de documento." };

  // Service role para saltear RLS — la búsqueda no tiene clinic_id en el contexto anon.
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("email")
    .eq("national_id", trimmed)
    .order("email", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { error: "No encontramos ese DNI. Revisá el número o contactá a la clínica." };
  }

  if (!data.email) {
    return {
      error:
        "Tu DNI está registrado pero no tenés un email asociado. Contactá a la clínica para activar tu acceso.",
    };
  }

  const email = data.email as string;

  const supabase = createClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (otpError) return { error: `No se pudo enviar el código: ${otpError.message}` };

  return { email };
}
