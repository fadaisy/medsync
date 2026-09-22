"use client";

import { useEffect, useRef } from "react";
import { SearchIcon, XIcon } from "lucide-react";

/**
 * S1's search field (48px). `/` anywhere on the page focuses it (PRD §7.2
 * desktop); the results themselves are the caller's — this is the input.
 */
export function Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      // Only from the page itself: any focused control keeps its own keys.
      const el = document.activeElement;
      if (el && el !== document.body && el.tagName !== "MAIN") return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="relative">
      <label htmlFor="symptom-search" className="sr-only">
        Search symptoms
      </label>
      <SearchIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <input
        ref={ref}
        id="symptom-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        placeholder="Search — e.g. fits, pressure, sugar"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:shadow-focus text-body-m h-12 w-full rounded-lg border pr-11 pl-10 outline-none"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-md"
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
