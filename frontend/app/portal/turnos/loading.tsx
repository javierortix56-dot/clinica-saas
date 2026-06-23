// Skeleton instantáneo al entrar a "Mis turnos" del portal del paciente.
export default function PortalTurnosLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-32 rounded bg-slate-200" />
      <div className="space-y-3">
        <div className="h-20 rounded-lg border border-slate-200 bg-slate-50" />
        <div className="h-20 rounded-lg border border-slate-200 bg-slate-50" />
        <div className="h-20 rounded-lg border border-slate-200 bg-slate-50" />
      </div>
    </div>
  );
}
