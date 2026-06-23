// Skeleton que Next.js muestra al instante al navegar entre páginas del dashboard,
// mientras el Server Component resuelve sus datos. Da feedback inmediato y hace
// que la navegación se sienta reactiva aunque la página sea dinámica.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="h-4 w-72 rounded bg-slate-100" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 rounded-lg border border-slate-200 bg-slate-50" />
        <div className="h-24 rounded-lg border border-slate-200 bg-slate-50" />
        <div className="h-24 rounded-lg border border-slate-200 bg-slate-50" />
      </div>

      <div className="space-y-2">
        <div className="h-10 rounded bg-slate-100" />
        <div className="h-10 rounded bg-slate-50" />
        <div className="h-10 rounded bg-slate-100" />
        <div className="h-10 rounded bg-slate-50" />
      </div>
    </div>
  );
}
