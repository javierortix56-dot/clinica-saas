import { Skeleton } from "@/components/ui/skeleton";

// Skeleton de la pantalla "Hoy": header + fila de indicadores + agenda del día,
// con la misma estructura que la vista real.
export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-40 rounded-[10px]" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-card" />
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-white shadow-card-soft">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="divide-y divide-[#eef2f7]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-[88px]" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
