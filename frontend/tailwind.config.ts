import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["'Hanken Grotesk'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          hover: "hsl(var(--sidebar-hover))",
        },
        // Estados de turno (handoff de diseño)
        status: {
          "confirmado-bg": "#ecfdf5",
          "confirmado-border": "#a7f3d0",
          "confirmado-fg": "#047857",
          "confirmado-dot": "#10b981",
          "pendiente-bg": "#fffbeb",
          "pendiente-border": "#fde68a",
          "pendiente-fg": "#b45309",
          "pendiente-dot": "#f59e0b",
          "atendido-bg": "#eff6ff",
          "atendido-border": "#bfdbfe",
          "atendido-fg": "#1d4ed8",
          "atendido-dot": "#3b82f6",
          "cancelado-bg": "#fff1f2",
          "cancelado-border": "#fecdd3",
          "cancelado-fg": "#be123c",
          "cancelado-dot": "#f43f5e",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        card: "16px",
        modal: "20px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,.04)",
        "card-soft": "0 1px 2px rgba(15,23,42,.03)",
        modal: "0 24px 60px rgba(15,23,42,.3)",
        toast: "0 10px 28px rgba(15,23,42,.16)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(7px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fadeUp 0.3s ease both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
