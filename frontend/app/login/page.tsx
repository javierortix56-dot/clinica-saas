"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginSchema } from "@clinica/shared";
import { Plus, Check, Mail, Lock } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

const BULLETS = [
  "Calendario por profesional con estados claros",
  "Historias clínicas con resumen por IA",
  "Portal de autogestión para pacientes",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Validación de forma con el esquema compartido (FE ↔ BE).
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (signInError) {
      setError("Email o contraseña incorrectos.");
      return;
    }

    // En éxito, la sesión queda en cookies (@supabase/ssr). Redirige a la
    // bandeja de aprobaciones (vista de mayor valor del MVP).
    router.replace("/approvals");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Panel izquierdo — marca */}
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-[#0e1726] to-[#1e293b] p-12 text-white md:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Plus className="h-[22px] w-[22px] text-white" strokeWidth={2.4} />
          </div>
          <span className="text-[19px] font-extrabold">Clínica</span>
        </div>

        <div>
          <h2 className="max-w-[420px] text-[32px] font-extrabold leading-[1.2] tracking-tight">
            La gestión de tu consultorio, simple y ordenada.
          </h2>
          <p className="mt-5 max-w-[420px] text-[15px] font-medium leading-[1.6] text-slate-400">
            Turnos, pacientes e historias clínicas en un solo lugar. Diseñado
            para profesionales, recepción y administración.
          </p>
          <div className="mt-[30px] flex flex-col gap-[13px]">
            {BULLETS.map((b) => (
              <div
                key={b}
                className="flex items-center gap-[11px] text-[14px] font-medium text-slate-300"
              >
                <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-white/10">
                  <Check
                    className="h-[13px] w-[13px] text-emerald-400"
                    strokeWidth={2.6}
                  />
                </span>
                {b}
              </div>
            ))}
          </div>
        </div>

        <div className="text-[12.5px] font-medium text-slate-500">
          © 2026 Clínica · Gestión médica
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex flex-1 items-center justify-center bg-white p-12">
        <div className="w-full max-w-[360px]">
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">
            Iniciar sesión
          </h1>
          <p className="mb-7 mt-[10px] text-[14px] font-medium text-slate-500">
            Ingresá con tu cuenta profesional.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <label className="mb-[7px] block text-[12.5px] font-semibold text-slate-700">
              Email
            </label>
            <div className="mb-4 flex items-center gap-[9px] rounded-[11px] border border-border px-[13px] py-[11px] focus-within:border-primary">
              <Mail className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
              <input
                type="email"
                autoComplete="email"
                placeholder="doctor@clinica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="flex-1 bg-transparent text-[14px] font-medium text-foreground outline-none"
              />
            </div>

            <label className="mb-[7px] block text-[12.5px] font-semibold text-slate-700">
              Contraseña
            </label>
            <div className="mb-[22px] flex items-center gap-[9px] rounded-[11px] border border-border px-[13px] py-[11px] focus-within:border-primary">
              <Lock className="h-4 w-4 text-slate-400" strokeWidth={1.8} />
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="flex-1 bg-transparent text-[14px] font-medium text-foreground outline-none"
              />
            </div>

            {error && (
              <p
                className="mb-4 text-[13px] font-medium text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[11px] bg-primary py-3 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(37,99,235,.3)] transition hover:brightness-[1.07] disabled:opacity-60"
            >
              {loading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <div className="mt-[18px] text-center text-[13px] font-medium text-slate-500">
            ¿Sos paciente?{" "}
            <Link
              href="/portal/login"
              className="font-bold text-primary hover:underline"
            >
              Ir al portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
