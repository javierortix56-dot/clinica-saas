"use server";

import { createClient } from "@/lib/supabase/server";

export type PatientSearchResult = {
  id: string;
  full_name: string;
  national_id: string | null;
};

// Búsqueda para el buscador global. RLS limita los resultados a la clínica del JWT.
export async function searchPatients(rawQuery: string): Promise<PatientSearchResult[]> {
  // Solo letras, números, espacios, punto, apóstrofo y guion: el valor viaja
  // dentro de un filtro `or=(...)` de PostgREST y no debe poder alterarlo.
  const q = rawQuery
    .normalize("NFC")
    .replace(/[^A-Za-z0-9À-ɏ\s.'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (q.length < 2) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("patients")
    .select("id, full_name, national_id")
    .or(`full_name.ilike."%${q}%",national_id.ilike."%${q}%"`)
    .order("full_name", { ascending: true })
    .limit(8);

  if (error) return [];
  return (data ?? []) as PatientSearchResult[];
}
