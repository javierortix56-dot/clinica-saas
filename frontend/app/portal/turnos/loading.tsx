import { Skeleton } from "@/components/ui/skeleton";

// Skeleton instantáneo al entrar a "Mis turnos" del portal del paciente.
export default function PortalTurnosLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  );
}
