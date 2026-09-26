import { Skeleton } from "@/components/ui/skeleton";

// Skeleton de la agenda con la forma de la vista Día (la de inicio): cabecera,
// barra de vistas, tira de días y lista de actividades con panel lateral.
export default function CalendarLoading() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-[82px] rounded-[10px]" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-[250px] rounded-[10px]" />
        <Skeleton className="h-10 w-40 rounded-[10px]" />
      </div>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[52px] rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex-1 space-y-3 rounded-card border border-border bg-white p-4 shadow-card-soft">
          <Skeleton className="h-5 w-56" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-9 w-14" />
              <Skeleton className="h-14 flex-1 rounded-xl" />
            </div>
          ))}
        </div>
        <div className="flex w-full flex-col gap-3 lg:w-[300px]">
          <Skeleton className="h-36 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      </div>
    </div>
  );
}
