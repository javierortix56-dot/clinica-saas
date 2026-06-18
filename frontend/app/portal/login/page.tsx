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
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Ingresá tu código</h2>
          <p className="mt-1 text-sm text-slate-500">
            Enviamos un código de 6 dígitos a{" "}
            <span className="font-medium text-slate-700">{email}</span>.
          </p>
        </div>
        <form onSubmit={handleVerifyOtp} className="space-y-4">
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
            className="block w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-center text-2xl tracking-widest text-slate-900 placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || otp.length !== 6}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "Verificando…" : "Ingresar"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setScreen("dni"); setOtp(""); }}
          className="block w-full text-center text-sm text-slate-500 hover:text-slate-700"
        >
          ← Volver
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Portal del Paciente</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ingresá tu número de documento para acceder a tus turnos.
        </p>
      </div>
      <form onSubmit={handleRequestOtp} className="space-y-4">
        <div>
          <label htmlFor="dni" className="block text-sm font-medium text-slate-700">
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
            className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !nationalId.trim()}
          className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Buscando…" : "Continuar"}
        </button>
      </form>
    </div>
  );
}
