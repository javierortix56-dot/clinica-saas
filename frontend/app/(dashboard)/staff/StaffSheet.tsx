"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { StaffMember } from "@/lib/supabase/server";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { upsertStaff, deactivateStaff, reactivateStaff } from "./actions";

const WEEKDAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "doctor", label: "Profesional" },
  { value: "reception", label: "Recepción" },
] as const;

function getAvailabilityForDay(
  availability: StaffMember["availability"],
  weekday: number
) {
  return availability.find((a) => a.weekday === weekday);
}

// ─── Availability section (solo para rol doctor) ───────────────────────────────

function AvailabilityEditor({
  availability,
}: {
  availability: StaffMember["availability"];
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(
      WEEKDAYS.map((d) => [d.value, !!getAvailabilityForDay(availability, d.value)])
    )
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Disponibilidad semanal
      </p>
      {WEEKDAYS.map((day) => {
        const existing = getAvailabilityForDay(availability, day.value);
        return (
          <div key={day.value} className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="days"
                value={day.value}
                checked={checked[day.value] ?? false}
                onChange={(e) =>
                  setChecked((prev) => ({
                    ...prev,
                    [day.value]: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="w-20 text-sm text-slate-700">{day.label}</span>
            </label>
            {checked[day.value] && (
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  name={`start_${day.value}`}
                  defaultValue={existing?.start_time?.slice(0, 5) ?? "09:00"}
                  className="rounded border border-slate-200 px-2 py-1 text-sm"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="time"
                  name={`end_${day.value}`}
                  defaultValue={existing?.end_time?.slice(0, 5) ?? "18:00"}
                  className="rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function StaffSheet({
  member,
  mode,
  open,
  onOpenChange,
}: {
  member: StaffMember | null;
  mode: "edit" | "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeactivating, startDeactivating] = useTransition();
  const [isReactivating, startReactivating] = useTransition();
  const [currentRole, setCurrentRole] = useState<string>(
    member?.role ?? "reception"
  );

  // Sincronizar el rol al cambiar el member seleccionado
  // (cuando se cambia de fila sin cerrar el sheet)
  const roleForForm = mode === "edit" ? (member?.role ?? "reception") : "reception";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);

    startTransition(async () => {
      const result = await upsertStaff(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        mode === "create" ? "Miembro creado correctamente." : "Cambios guardados."
      );
      router.refresh();
      onOpenChange(false);
    });
  }

  function handleDeactivate() {
    if (!member) return;
    startDeactivating(async () => {
      const result = await deactivateStaff(member.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Miembro desactivado.");
      router.refresh();
      onOpenChange(false);
    });
  }

  const title = mode === "create" ? "Nuevo miembro" : "Editar miembro";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-slate-200 p-6">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col gap-5 p-6"
        >
          {mode === "edit" && member && (
            <input type="hidden" name="id" value={member.id} />
          )}

          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Nombre completo
            </label>
            <input
              name="full_name"
              required
              defaultValue={member?.full_name ?? ""}
              placeholder="Dr. Juan Pérez"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Email <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              name="email"
              type="email"
              defaultValue={member?.email ?? ""}
              placeholder="juan@clinica.com"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          {/* Rol */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Rol</label>
            <select
              name="role"
              defaultValue={roleForForm}
              onChange={(e) => setCurrentRole(e.target.value)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* is_active (solo en edición) */}
          {mode === "edit" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="is_active"
                id="is_active"
                value="true"
                defaultChecked={member?.is_active ?? true}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="is_active" className="text-sm text-slate-700">
                Miembro activo
              </label>
            </div>
          )}

          {/* Matrícula (solo para doctores) */}
          {currentRole === "doctor" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                Matrícula <span className="text-slate-400">(opcional)</span>
              </label>
              <input
                name="license_number"
                defaultValue={member?.license_number ?? ""}
                placeholder="MP 12345"
                className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          )}

          {/* Disponibilidad (solo para doctores en edición) */}
          {mode === "edit" && currentRole === "doctor" && member && (
            <AvailabilityEditor availability={member.availability} />
          )}

          {/* Acciones */}
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <Button type="submit" disabled={isPending || isDeactivating}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
            {mode === "edit" && member?.is_active && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeactivate}
                disabled={isPending || isDeactivating || isReactivating}
                className="text-slate-500"
              >
                {isDeactivating ? "Desactivando…" : "Desactivar miembro"}
              </Button>
            )}
            {mode === "edit" && !member?.is_active && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!member) return;
                  startReactivating(async () => {
                    const result = await reactivateStaff(member.id);
                    if (result.error) { toast.error(result.error); return; }
                    toast.success("Miembro reactivado.");
                    router.refresh();
                    onOpenChange(false);
                  });
                }}
                disabled={isPending || isDeactivating || isReactivating}
                className="text-emerald-600 hover:border-emerald-200"
              >
                {isReactivating ? "Reactivando…" : "Reactivar miembro"}
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
