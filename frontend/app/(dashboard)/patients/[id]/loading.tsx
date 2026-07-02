import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del detalle de paciente: cabecera con nombre/datos + tabs + tarjetas
// de notas/turnos, replicando el layout real para una espera sin "salto".
export default function PatientDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Cabecera del paciente */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-56" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-[10px]" />
        <Skeleton className="h-9 w-32 rounded-[10px]" />
      </div>

      {/* Tarjetas (turnos / notas clínicas) */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-card border border-border bg-white p-5 shadow-card-soft"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
