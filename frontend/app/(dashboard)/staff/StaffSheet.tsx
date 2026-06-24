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
import {
  upsertStaff,
  deactivateStaff,
  reactivateStaff,
  deleteStaff,
  getGoogleCalendarConnectUrl,
  disconnectGoogleCalendar,
} from "./actions";

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

// Una franja de disponibilidad: un día con un rango horario.
// Un mismo día puede tener varias franjas (ej: 09:00–13:00 y 16:00–20:00).
interface Block {
  weekday: number;
  start: string;
  end: string;
}

function blocksFromAvailability(av: StaffMember["availability"]): Block[] {
  return av
    .map((a) => ({
      weekday: a.weekday,
      start: a.start_time.slice(0, 5),
      end: a.end_time.slice(0, 5),
    }))
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

// ─── Editor de franjas (múltiples bloques por día) ────────────────────────────

function AvailabilityEditor({
  blocks,
  setBlocks,
}: {
  blocks: Block[];
  setBlocks: (updater: (prev: Block[]) => Block[]) => void;
}) {
  function addBlock() {
    setBlocks((prev) => [...prev, { weekday: 1, start: "09:00", end: "13:00" }]);
  }

  function updateBlock(index: number, patch: Partial<Block>) {
    setBlocks((prev) =>
      prev.map((b, i) => (i === index ? { ...b, ...patch } : b))
    );
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Disponibilidad semanal
        </p>
        <Button type="button" size="sm" variant="outline" onClick={addBlock}>
          + Agregar franja
        </Button>
      </div>

      {blocks.length === 0 && (
        <p className="text-xs text-slate-400">
          Sin franjas. Agregá al menos una para que el profesional pueda recibir turnos.
        </p>
      )}

      <div className="space-y-2">
        {blocks.map((block, i) => {
          const invalid = block.end <= block.start;
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
            >
              <select
                value={block.weekday}
                onChange={(e) =>
                  updateBlock(i, { weekday: Number(e.target.value) })
                }
                className="rounded border border-slate-200 bg-white px-2 py-1 text-sm"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={block.start}
                onChange={(e) => updateBlock(i, { start: e.target.value })}
                className={`rounded border px-2 py-1 text-sm ${
                  invalid ? "border-red-300" : "border-slate-200"
                }`}
              />
              <span className="text-slate-400">–</span>
              <input
                type="time"
                value={block.end}
                onChange={(e) => updateBlock(i, { end: e.target.value })}
                className={`rounded border px-2 py-1 text-sm ${
                  invalid ? "border-red-300" : "border-slate-200"
                }`}
              />
              <button
                type="button"
                onClick={() => removeBlock(i)}
                className="ml-auto rounded px-1.5 py-0.5 text-sm text-red-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">
        Para un día partido, agregá dos franjas (ej: 09:00–13:00 y 16:00–20:00).
      </p>
    </div>
  );
}

// ─── Google Calendar section ──────────────────────────────────────────────────

function GoogleCalendarSection({
  professionalId,
  connected,
}: {
  professionalId: string;
  connected: boolean;
}) {
  const router = useRouter();
  const [isConnecting, startConnecting] = useTransition();
  const [isDisconnecting, startDisconnecting] = useTransition();

  function handleConnect() {
    startConnecting(async () => {
      const result = await getGoogleCalendarConnectUrl(professionalId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.url) {
        window.location.href = result.url;
      }
    });
  }

  function handleDisconnect() {
    startDisconnecting(async () => {
      const result = await disconnectGoogleCalendar(professionalId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Google Calendar desconectado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">
            Google Calendar
          </span>
          {connected ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Conectado
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              Sin conectar
            </span>
          )}
        </div>
        {connected ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="text-red-500 hover:border-red-200 hover:text-red-600"
          >
            {isDisconnecting ? "Desconectando…" : "Desconectar"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? "Redirigiendo…" : "Conectar"}
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-400">
        {connected
          ? "Los turnos confirmados se sincronizan automáticamente con el Google Calendar del profesional."
          : "Conectá para que los turnos confirmados aparezcan en el Google Calendar del profesional."}
      </p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

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
  const [isDeleting, startDeleting] = useTransition();
  const [currentRole, setCurrentRole] = useState<string>(
    member?.role ?? "reception"
  );
  const [blocks, setBlocks] = useState<Block[]>(() =>
    member ? blocksFromAvailability(member.availability) : []
  );
  // Credenciales recién creadas a mostrar una sola vez (no auto-cierra el sheet).
  const [createdCreds, setCreatedCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);

  // Reset al cambiar de miembro sin cerrar el sheet.
  const [lastMemberId, setLastMemberId] = useState(member?.id);
  if (member?.id !== lastMemberId) {
    setLastMemberId(member?.id);
    setCurrentRole(member?.role ?? "reception");
    setBlocks(member ? blocksFromAvailability(member.availability) : []);
    setCreatedCreds(null);
  }

  // Al cerrar el sheet, limpiamos las credenciales mostradas.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (!open) setCreatedCreds(null);
  }

  const roleForForm = mode === "edit" ? (member?.role ?? "reception") : "reception";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    if (currentRole === "doctor") {
      const invalid = blocks.find((b) => b.end <= b.start);
      if (invalid) {
        toast.error("Hay una franja con hora de fin anterior o igual a la de inicio.");
        return;
      }
    }

    const formData = new FormData(form);
    formData.set("block_count", String(blocks.length));
    blocks.forEach((b, i) => {
      formData.set(`block_weekday_${i}`, String(b.weekday));
      formData.set(`block_start_${i}`, b.start);
      formData.set(`block_end_${i}`, b.end);
    });

    setCreatedCreds(null);
    startTransition(async () => {
      const result = await upsertStaff(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      if (result.credentials) {
        // Mostramos las credenciales y dejamos el sheet abierto para copiarlas.
        setCreatedCreds(result.credentials);
        toast.success("Acceso creado. Copiá las credenciales antes de cerrar.");
      } else {
        toast.success(
          mode === "create" ? "Miembro creado correctamente." : "Cambios guardados."
        );
        onOpenChange(false);
      }
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

  function handleDelete() {
    if (!member) return;
    const ok = window.confirm(
      `¿Borrar a ${member.full_name}? El miembro desaparece del listado y del ` +
        `desplegable de turnos. Los turnos ya cargados se conservan. Esta acción ` +
        `no se puede deshacer desde la app.`
    );
    if (!ok) return;
    startDeleting(async () => {
      const result = await deleteStaff(member.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Miembro borrado.");
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

          {/* Credenciales recién creadas (mostrar una sola vez) */}
          {createdCreds && (
            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-medium text-emerald-900">
                ✅ Acceso creado
              </p>
              <p className="text-xs text-emerald-800">
                Guardá estas credenciales: la contraseña no se vuelve a mostrar.
              </p>
              <div className="rounded bg-white p-2 text-sm">
                <div>
                  <span className="text-slate-400">Email:</span>{" "}
                  {createdCreds.email}
                </div>
                <div>
                  <span className="text-slate-400">Contraseña:</span>{" "}
                  <span className="font-mono">{createdCreds.password}</span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(
                      `Email: ${createdCreds.email}\nContraseña: ${createdCreds.password}`
                    )
                    .then(() => toast.success("Credenciales copiadas."));
                }}
              >
                Copiar credenciales
              </Button>
            </div>
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

          {/* Contraseña de acceso */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Contraseña de acceso{" "}
              <span className="text-slate-400">(opcional)</span>
            </label>
            <input
              name="password"
              type="text"
              autoComplete="new-password"
              placeholder={
                mode === "create"
                  ? "Dejar vacío para autogenerar"
                  : "Dejar vacío para no cambiarla"
              }
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-400">
              Si cargás un email, se crea el usuario para iniciar sesión.{" "}
              {mode === "create"
                ? "Si dejás la contraseña vacía, se genera una automáticamente."
                : "Cargá una contraseña solo si querés crearla o cambiarla."}
            </p>
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

          {/* Disponibilidad (solo para doctores) */}
          {currentRole === "doctor" && (
            <AvailabilityEditor blocks={blocks} setBlocks={setBlocks} />
          )}

          {/* Google Calendar (solo para doctores en edición) */}
          {mode === "edit" && currentRole === "doctor" && member?.professional_id && (
            <GoogleCalendarSection
              professionalId={member.professional_id}
              connected={member.gcal_connected}
            />
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
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
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
            {mode === "edit" && member && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={
                  isPending || isDeactivating || isReactivating || isDeleting
                }
                className="mt-2 border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50"
              >
                {isDeleting ? "Borrando…" : "Borrar miembro"}
              </Button>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
