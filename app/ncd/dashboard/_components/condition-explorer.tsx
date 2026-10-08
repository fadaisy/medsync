"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ExplorerItem = { code: string; label: string; rail: ReactNode; panel: ReactNode };

/**
 * Outcomes by condition as list and detail: every enabled condition stays in the rail (ordered by
 * patients under care, its share and trend at a glance) and the selected one fills the panel. All
 * panels are rendered on the server; switching only shows another, so it is instant. Vertical tabs
 * (arrow keys, Home, End); the choice is kept in `?focus=` so a link opens the same condition.
 */
export function ConditionExplorer({ items, initial }: { items: ExplorerItem[]; initial?: string }) {
  const [sel, setSel] = useState(
    items.some((i) => i.code === initial) ? initial! : (items[0]?.code ?? ""),
  );
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const choose = (code: string, focus = false) => {
    setSel(code);
    const u = new URL(window.location.href);
    u.searchParams.set("focus", code);
    window.history.replaceState(null, "", u);
    if (focus) tabs.current[items.findIndex((i) => i.code === code)]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowDown"
        ? (i + 1) % items.length
        : e.key === "ArrowUp"
          ? (i - 1 + items.length) % items.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : null;
    if (to == null) return;
    e.preventDefault();
    choose(items[to]!.code, true);
  };

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label="Conditions"
        className="border-ink-150 flex max-h-72 flex-col gap-1 overflow-y-auto overscroll-contain border-b p-2 lg:max-h-none lg:border-r lg:border-b-0"
      >
        {items.map((it, i) => {
          const on = it.code === sel;
          return (
            <button
              key={it.code}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`cond-tab-${it.code}`}
              aria-selected={on}
              aria-controls={`cond-panel-${it.code}`}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(it.code)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "focus-visible:shadow-focus w-full rounded-md px-3 py-2.5 text-left outline-none",
                "transition-colors duration-[var(--duration-normal)] ease-[var(--ease-expo-out)]",
                on ? "bg-ink-100" : "hover:bg-ink-50",
              )}
            >
              {it.rail}
            </button>
          );
        })}
      </div>
      {items.map((it) => (
        <div
          key={it.code}
          role="tabpanel"
          id={`cond-panel-${it.code}`}
          aria-labelledby={`cond-tab-${it.code}`}
          hidden={it.code !== sel}
          className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4"
        >
          {it.panel}
        </div>
      ))}
    </div>
  );
}
