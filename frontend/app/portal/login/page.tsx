"use client";

import { useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { requestOtp } from "./actions";

export default function PortalLoginPage() {
  const [screen, setScreen] = useState<"dni" | "otp">("dni");
  const [nationalId, setNationalId] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await requestOtp(nationalId);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setEmail(result.email!);
    setScreen("otp");
    toast.success("Te enviamos un código a tu email.");
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setLoading(false);
    if (error) {
      toast.error("Código incorrecto o expirado.");
      return;
    }
    window.location.href = "/portal/turnos";
  }

  if (screen === "otp") {
    return (
      <div className="mx-auto max-w-[400px] rounded-card border border-border bg-white p-7 shadow-card">
        <div>
          <h2 className="text-[20px] font-extrabold tracking-tight text-foreground">
            Ingresá tu código
          </h2>
          <p className="mt-2 text-[13.5px] font-medium text-muted-foreground">
            Enviamos un código de 6 dígitos a{" "}
            <span className="font-semibold text-slate-700">{email}</span>.
          </p>
        </div>
        <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            required
            autoFocus
            className="block w-full rounded-[11px] border border-border bg-white px-3 py-3 text-center font-mono text-2xl tracking-[.3em] text-foreground placeholder:text-slate-300 focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full rounded-[11px] bg-primary px-4 py-3 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(37,99,235,.3)] transition hover:brightness-[1.07] disabled:opacity-50"
          >
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setScreen("dni");
            setOtp("");
          }}
          className="mt-4 block w-full text-center text-[13px] font-medium text-muted-foreground hover:text-primary"
        >
          ← Volver
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[400px] rounded-card border border-border bg-white p-7 shadow-card">
      <div>
        <h2 className="text-[20px] font-extrabold tracking-tight text-foreground">
          Portal del Paciente
        </h2>
        <p className="mt-2 text-[13.5px] font-medium text-muted-foreground">
          Ingresá tu número de documento para acceder a tus turnos.
        </p>
      </div>
      <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="dni"
            className="mb-[7px] block text-[12.5px] font-semibold text-slate-700"
          >
            DNI
          </label>
          <input
            id="dni"
            type="text"
            inputMode="numeric"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            placeholder="12345678"
            required
            autoFocus
            className="block w-full rounded-[11px] border border-border bg-white px-[13px] py-[11px] font-mono text-[15px] text-foreground placeholder:text-slate-400 focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !nationalId.trim()}
          className="w-full rounded-[11px] bg-primary px-4 py-3 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(37,99,235,.3)] transition hover:brightness-[1.07] disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Continuar"}
        </button>
      </form>
    </div>
  );
}
