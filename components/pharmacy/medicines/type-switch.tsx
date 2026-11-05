"use client";

import type { TypeFilter } from "@/content/pharmacy-supplies";

import { TYPE_SWITCH } from "@/content/pharmacy-supplies";
import { cn } from "@/lib/utils";

/** The one type switch (SUPPLIES.md §C, §D, §E): the same control in every tab, with counts where the tab has them. */
export function TypeSwitch({
  value,
  onChange,
  counts,
  className,
}: {
  value: TypeFilter;
  onChange: (t: TypeFilter) => void;
  counts?: Record<TypeFilter, number>;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={TYPE_SWITCH.aria}
      className={cn("bg-ink-100 inline-flex flex-wrap items-center gap-1 rounded-[22px] p-1", className)}
    >
      {TYPE_SWITCH.order.map((t) => {
        const on = value === t;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t)}
            className={cn(
              "focus-visible:ring-primary/30 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2",
              on ? "bg-tide-lagoon text-tide-on-lagoon" : "text-ink-700 hover:bg-card",
            )}
          >
            {TYPE_SWITCH.label[t]}
            {counts ? (
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-[7px] text-[11px] font-bold tabular-nums",
                  on ? "bg-white/60 text-tide-on-lagoon" : "bg-card text-ink-700",
                )}
              >
                {counts[t]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
