import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con SERVICE ROLE — saltea RLS y habilita la Admin API
 * (`auth.admin.*`). Uso EXCLUSIVO en Server Actions/route handlers: la service
 * key vive solo en el server y NUNCA llega al cliente. No persiste sesión.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
