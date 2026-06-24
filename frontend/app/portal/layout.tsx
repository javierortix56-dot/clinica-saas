import Link from "next/link";
import { Plus } from "lucide-react";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-[66px] items-center justify-between border-b border-border bg-white px-6 sm:px-8">
        <div className="flex items-center gap-[11px]">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-primary">
            <Plus className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />
          </div>
          <span className="text-[17px] font-extrabold tracking-tight">
            {process.env.NEXT_PUBLIC_CLINIC_NAME ?? "Clínica"}
          </span>
        </div>
        <Link
          href="/login"
          className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary"
        >
          Ver app profesional
        </Link>
      </header>
      <main className="mx-auto max-w-[1000px] px-6 py-9 sm:px-8">{children}</main>
    </div>
  );
}
