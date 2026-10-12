"use client";

import type { KeyboardEvent } from "react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

/** A tablist of filter tabs with counts in their names; arrow keys move the selection. */
export function TabList<T extends string>({
  label,
  controls,
  value,
  options,
  onChange,
}: {
  label: string;
  controls: string;
  value: T;
  options: { value: T; label: string; count: number }[];
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="bg-muted flex max-w-full gap-0.5 overflow-x-auto rounded-md p-0.5"
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={controls}
            aria-label={`${o.label}, ${o.count}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "text-label focus-visible:shadow-focus inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[5px] px-2.5 whitespace-nowrap outline-none sm:min-h-8",
              on ? "bg-card text-foreground shadow-xs" : "text-ink-600 hover:text-foreground",
            )}
          >
            {o.label}
            <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
              {o.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
