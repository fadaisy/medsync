"use client";

import type { CalendarEvent, OnEventClick } from "./types";

import { cn } from "@/lib/utils";
import {
  daysBetween,
  isSameMonth,
  isToday,
  monthGridRange,
  sameDay,
  STATUS_TONES,
  WEEKDAY_SHORT,
} from "./helpers";

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

/**
 * Month grid. Each cell renders day number + up to 3 small event
 * pills + a "+N more" link if there are extras. Click cell → caller
 * switches to day view; click pill → opens the detail sheet.
 */
export function MonthView({
  cursor,
  events,
  onDayClick,
  onEventClick,
}: {
  cursor: Date;
  events: ReadonlyArray<ParsedEvent>;
  onDayClick: (d: Date) => void;
  onEventClick?: OnEventClick;
}) {
  const range = monthGridRange(cursor);
  const days = daysBetween(range);
  const byDay = bucketByDay(events);

  return (
    <div className="flex h-full min-h-130 flex-col" role="grid" aria-label="Month view">
      {/* Weekday header */}
      <div className="border-border grid grid-cols-7 border-b">
        {WEEKDAY_SHORT.map((label) => (
          <div
            key={label}
            className="text-muted-foreground px-2 py-1.5 text-center font-mono text-[10px] tracking-[0.12em] uppercase"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid flex-1 auto-rows-fr grid-cols-7">
        {days.map((d) => {
          const dayEvents = byDay.get(keyOf(d)) ?? [];
          const inMonth = isSameMonth(d, cursor);
          const today = isToday(d);
          const visible = dayEvents.slice(0, 3);
          const extra = dayEvents.length - visible.length;
          return (
            <button
              key={keyOf(d)}
              type="button"
              role="gridcell"
              aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
              onClick={() => onDayClick(d)}
              className={cn(
                "border-border/60 group hover:bg-muted/40 focus-visible:ring-brand-500/40 flex flex-col items-stretch gap-1 border-t border-l p-1.5 text-left transition-colors first:border-l-0 focus-visible:ring-2 focus-visible:outline-none",
                !inMonth && "bg-muted/20",
              )}
            >
              <span
                className={cn(
                  "text-caption inline-flex h-5 w-5 items-center justify-center self-start rounded-full font-mono tabular-nums",
                  today
                    ? "bg-brand-600 text-white"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/60",
                )}
              >
                {d.getDate()}
              </span>
              <ul className="flex flex-col gap-0.5">
                {visible.map((ev) => (
                  <li key={ev.id}>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(ev);
                      }}
                      className={cn(
                        "block cursor-pointer truncate rounded-[3px] px-1 py-0.5 text-[10.5px]",
                        ev.kind === "appointment"
                          ? tonePill(ev.status)
                          : "bg-muted text-muted-foreground/80 italic",
                        ev.kind === "appointment" && ev.priority === "urgent"
                          ? "ring-1 ring-rose-500/60"
                          : "",
                      )}
                    >
                      <span className="font-mono tabular-nums">
                        {ev.startsAt.toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>{" "}
                      {ev.kind === "appointment" ? ev.patientName : ev.availabilityKind}
                    </span>
                  </li>
                ))}
                {extra > 0 ? (
                  <li className="text-muted-foreground px-1 font-mono text-[10px] tabular-nums">
                    +{extra} more
                  </li>
                ) : null}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function tonePill(status: string): string {
  const tone = STATUS_TONES[status] ?? "pending";
  if (tone === "completed" || tone === "cancelled") return "bg-muted text-muted-foreground/80";
  if (tone === "confirmed")
    return "bg-brand-100/70 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200";
  if (tone === "arrived")
    return "bg-blue-100/70 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  if (tone === "no_show")
    return "bg-rose-100/70 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
  return "bg-amber-100/70 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function bucketByDay(events: ReadonlyArray<ParsedEvent>): Map<string, ParsedEvent[]> {
  const out = new Map<string, ParsedEvent[]>();
  for (const ev of events) {
    const k = keyOf(ev.startsAt);
    const list = out.get(k);
    if (list) list.push(ev);
    else out.set(k, [ev]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }
  return out;
}

// Silence: sameDay reserved for future highlights (selected day).
void sameDay;
