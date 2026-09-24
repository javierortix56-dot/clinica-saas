"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";

import { avatarColorOf, initialsOf } from "@/lib/utils";
import { searchPatients, type PatientSearchResult } from "./search-actions";

// Buscador de pacientes de la barra superior. Atajos: "/" o Ctrl/⌘+K para enfocar.
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [isPending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) {
      setResults([]);
      setActive(-1);
      return;
    }
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await searchPatients(q);
        // Descarta respuestas de búsquedas anteriores que llegan tarde.
        if (latest.current !== q) return;
        setResults(found);
        setActive(found.length > 0 ? 0 : -1);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function goTo(href: string) {
    close();
    setQuery("");
    inputRef.current?.blur();
    router.push(href);
  }

  const allHref = `/patients?q=${encodeURIComponent(query.trim())}`;
  const showPanel = open && query.trim().length >= 2;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && results[active]) goTo(`/patients/${results[active].id}`);
      else if (query.trim()) goTo(allHref);
    } else if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
    }
  }

  return (
    <div
      className="relative hidden w-[340px] max-w-[40vw] sm:block"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <div className="flex items-center gap-[10px] rounded-[10px] border border-border bg-slate-100 px-3 py-2 focus-within:border-primary focus-within:bg-white">
        <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.9} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Buscar paciente por nombre o DNI"
          placeholder="Buscar paciente por nombre o DNI…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-slate-400"
        />
        <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 font-mono text-[10.5px] text-slate-400 lg:inline">
          /
        </kbd>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-[12px] border border-border bg-white shadow-[0_12px_32px_rgba(15,23,42,.14)]">
          <ul id={listId} role="listbox" aria-label="Pacientes encontrados" className="max-h-[320px] overflow-y-auto py-1">
            {results.map((p, i) => (
              <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <Link
                  href={`/patients/${p.id}`}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(i)}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(`/patients/${p.id}`);
                  }}
                  className={`flex items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-primary/[.07]" : ""}`}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: avatarColorOf(p.full_name) }}
                  >
                    {initialsOf(p.full_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{p.full_name}</span>
                    {p.national_id && (
                      <span className="block font-mono text-[11px] text-slate-400">{p.national_id}</span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
          {results.length === 0 && (
            <p className="px-3 py-3 text-[12.5px] font-medium text-slate-400">
              {isPending ? "Buscando…" : "Sin coincidencias."}
            </p>
          )}
          <Link
            href={allHref}
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              goTo(allHref);
            }}
            className="block border-t border-border bg-[#fbfcfe] px-3 py-2 text-[12px] font-semibold text-primary hover:underline"
          >
            Ver todos en Pacientes
          </Link>
        </div>
      )}
    </div>
  );
}
