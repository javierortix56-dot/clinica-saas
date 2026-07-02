// Skeleton del detalle de paciente: cabecera con nombre/datos + tabs + tarjetas
// de notas/turnos, replicando el layout real para una espera sin "salto".
export default function PatientDetailLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      {/* Cabecera del paciente */}
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-slate-100" />
        <div className="h-7 w-56 rounded bg-slate-200" />
        <div className="flex gap-3">
          <div className="h-4 w-28 rounded bg-slate-100" />
          <div className="h-4 w-32 rounded bg-slate-100" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-9 w-24 rounded-[10px] bg-slate-200" />
        <div className="h-9 w-32 rounded-[10px] bg-slate-100" />
      </div>

      {/* Tarjetas (turnos / notas clínicas) */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="space-y-3 rounded-card border border-border bg-white p-5 shadow-card-soft"
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-28 rounded-full bg-slate-100" />
              <div className="h-4 w-36 rounded bg-slate-100" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-11/12 rounded bg-slate-50" />
              <div className="h-4 w-3/4 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
