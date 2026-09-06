import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Fuentes self-hosted por Next (next/font): elimina los round-trips a
// fonts.googleapis.com/gstatic en el critical path y evita el layout shift
// (CLS) del <link rel="stylesheet"> render-blocking anterior. Se exponen como
// CSS variables que tailwind.config.ts referencia en fontFamily.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Consultorio · Gestión médica",
  description: "Gestión de turnos, pacientes e historias clínicas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
