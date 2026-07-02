import { Skeleton } from "@/components/ui/skeleton";

// Skeleton específico del calendario: dibuja la estructura real de la vista
// (header con navegación de semana + grilla semanal con columna de horas) para
// que la espera "tenga la forma" de lo que viene, en vez del skeleton genérico.
export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-5">
      {/* Título + navegación de semana */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-[10px]" />
          <Skeleton className="h-9 w-24 rounded-[10px]" />
          <Skeleton className="h-9 w-9 rounded-[10px]" />
        </div>
      </div>

      {/* Grilla semanal (desktop) / lista del día (mobile) */}
      <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
        {/* Header de días */}
        <div className="grid grid-cols-[3.25rem_repeat(6,1fr)] border-b border-border bg-[#fbfcfe]">
          <div className="h-12" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center gap-1 border-l border-[#eef2f7] py-2"
            >
              <Skeleton className="h-2.5 w-8" />
              <Skeleton className="h-2.5 w-10" />
            </div>
          ))}
        </div>
        {/* Filas de horas con algunos "turnos" fantasma */}
        {Array.from({ length: 10 }).map((_, row) => (
          <div key={row} className="grid grid-cols-[3.25rem_repeat(6,1fr)]">
            <div className="flex h-10 items-start justify-end border-b border-[#eef2f7] pr-1.5 pt-1">
              {row % 2 === 0 && <Skeleton className="h-2 w-7" />}
            </div>
            {Array.from({ length: 6 }).map((_, col) => (
              <div key={col} className="h-10 border-b border-l border-[#eef2f7] p-[3px]">
                {(row * 7 + col) % 9 === 3 && (
                  <Skeleton className="h-full rounded-[3px]" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
