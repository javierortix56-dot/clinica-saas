export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white py-4">
        <div className="mx-auto max-w-md px-4">
          <p className="text-center text-sm font-semibold text-slate-700">
            {process.env.NEXT_PUBLIC_CLINIC_NAME ?? "Portal del Paciente"}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-8">{children}</main>
    </div>
  );
}
