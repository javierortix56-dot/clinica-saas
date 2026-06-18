import { getPatients } from "@/lib/supabase/server";
import { PatientsClient } from "./PatientsClient";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const patients = await getPatients();
  return <PatientsClient patients={patients} />;
}
