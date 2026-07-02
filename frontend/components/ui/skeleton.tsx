import { cn } from "@/lib/utils";

// Bloque de skeleton con shimmer (gradiente que se desplaza) en vez del
// animate-pulse plano. Usar en los loading.tsx: <Skeleton className="h-4 w-24" />
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded bg-gradient-to-r from-slate-100 via-slate-200/80 to-slate-100 bg-[length:200%_100%]",
        className
      )}
    />
  );
}
