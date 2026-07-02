import type { LucideIcon } from "lucide-react";

// Estado vacío ilustrado: ícono en un círculo suave + título + microcopy +
// CTA opcional. Reemplaza los "sin datos" de texto plano en las listas.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-border bg-white px-6 py-12 text-center shadow-card-soft">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" strokeWidth={1.6} />
      </div>
      <div className="space-y-1">
        <p className="text-[14.5px] font-bold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-[380px] text-[13px] font-medium text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
