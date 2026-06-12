"use client";

import type { ClinicalCode } from "@/lib/encounter/reference-codes";
import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Accessible code typeahead (ICD-10 / LOINC) — search-as-you-type, replacing the
 * bare <datalist> (W2). Filters the curated code list by code OR display, with
 * full keyboard control (↓/↑ to move, Enter to pick, Esc to close) and an ARIA
 * combobox/listbox. Free-text remains allowed: whatever is typed is kept (coding
 * is optional), and selecting a row sets the code. Presentation/UX only — the same
 * value flows to the same field as before.
 */
export function CodeCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ClinicalCode[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = value.trim().toLowerCase();
  const matches = (
    q
      ? options.filter(
          (o) => o.code.toLowerCase().includes(q) || o.display.toLowerCase().includes(q),
        )
      : options
  ).slice(0, 8);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-opt-${active}` : undefined}
        className="border-input bg-card text-foreground focus-visible:ring-ring/25 w-full min-w-0 rounded-md border px-2.5 py-2 text-[13px] transition-colors outline-none placeholder:text-gray-400 focus-visible:border-teal-500 focus-visible:ring-2"
        placeholder={placeholder}
        value={value}
        onChange={(ev) => {
          onChange(ev.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(matches.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]!.code);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length ? (
        <ul
          id={listId}
          role="listbox"
          // keep input focus so a click selects before onBlur closes the list
          onMouseDown={(e) => e.preventDefault()}
          className="border-border bg-card absolute z-20 mt-1 max-h-56 w-full min-w-64 overflow-auto rounded-lg border shadow-lg"
        >
          {matches.map((o, i) => (
            <li
              key={o.code}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o.code)}
              className={cn(
                "flex cursor-pointer items-baseline gap-2 px-2.5 py-1.5 text-[12px]",
                i === active ? "bg-teal-50 dark:bg-teal-950/40" : "hover:bg-muted/60",
              )}
            >
              <span className="text-foreground shrink-0 font-mono text-[11px]">{o.code}</span>
              <span className="text-muted-foreground truncate">{o.display}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
