"use client";

import { useState } from "react";

import type { StaffMember } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StaffSheet } from "./StaffSheet";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  doctor: "Profesional",
  reception: "Recepción",
};

function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

type SheetState =
  | { open: false }
  | { open: true; mode: "edit"; member: StaffMember }
  | { open: true; mode: "create"; member: null };

export function StaffTable({ members }: { members: StaffMember[] }) {
  const [sheet, setSheet] = useState<SheetState>({ open: false });
  const [search, setSearch] = useState("");

  function openEdit(member: StaffMember) {
    setSheet({ open: true, mode: "edit", member });
  }

  function openCreate() {
    setSheet({ open: true, mode: "create", member: null });
  }

  function closeSheet() {
    setSheet({ open: false });
  }

  const filteredMembers = search.trim()
    ? members.filter((m) => {
        const q = search.toLowerCase();
        return (
          m.full_name.toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q)
        );
      })
    : members;

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
        />
        <Button size="sm" onClick={openCreate}>
          + Nuevo miembro
        </Button>
      </div>

      {members.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No hay miembros registrados.
        </p>
      ) : filteredMembers.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Sin resultados para "{search}".
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Disponibilidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((m) => (
                <TableRow
                  key={m.id}
                  className={`cursor-pointer ${!m.is_active ? "opacity-50" : ""}`}
                  onClick={() => openEdit(m)}
                >
                  <TableCell className="font-medium">
                    {m.full_name}
                    {m.email && (
                      <span className="block text-xs text-muted-foreground">
                        {m.email}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {m.is_active ? (
                      <Badge variant="outline">Activo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400">
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.license_number ?? "—"}
                  </TableCell>
                  <TableCell>
                    {m.availability.length === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {m.availability.map((a, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"
                          >
                            <span className="font-medium">
                              {WEEKDAY_LABELS[a.weekday] ?? `D${a.weekday}`}
                            </span>
                            {formatTimeRange(a.start_time, a.end_time)}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <StaffSheet
        member={sheet.open ? sheet.member : null}
        mode={sheet.open ? sheet.mode : "edit"}
        open={sheet.open}
        onOpenChange={(o) => { if (!o) closeSheet(); }}
      />
    </>
  );
}
