"use client";

import type { CalendarView } from "./helpers";
import { CalendarDaysIcon, ColumnsIcon, GridIcon, ListIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Segmented control for switching calendar views.
 *
 * The kickoff §2 frames the switcher as Calendar (month/week/day) ⇄
 * Grid (cards) ⇄ List. This component handles the four calendar
 * views (month / week / day / agenda); the outer scheduling shell
 * adds the Grid / List options when relevant.
 */

const VIEWS: ReadonlyArray<{ key: CalendarView; label: string; icon: typeof CalendarDaysIcon }> = [
  { key: "day", label: "Day", icon: GridIcon },
  { key: "week", label: "Week", icon: ColumnsIcon },
  { key: "month", label: "Month", icon: CalendarDaysIcon },
  { key: "agenda", label: "Agenda", icon: ListIcon },
];

export function CalendarViewSwitcher({
  value,
  onChange,
  allowedViews,
}: {
  value: CalendarView;
  onChange: (next: CalendarView) => void;
  /** Optional whitelist (e.g. hide month on narrow screens). Defaults to all four. */
  allowedViews?: ReadonlyArray<CalendarView>;
}) {
  const items = allowedViews ? VIEWS.filter((v) => allowedViews.includes(v.key)) : VIEWS;

  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      // 40px tabs inside the 2px rail meet the 44px touch floor.
      className="border-border bg-card inline-flex items-center gap-px rounded-md border p-0.5"
    >
      {items.map((v) => {
        const Icon = v.icon;
        const isActive = v.key === value;
        return (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(v.key)}
            className={cn(
              "ease-expo-out inline-flex min-h-10 items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
              isActive
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
