"use client";

import type { CalendarEvent, OnEventClick } from "./types";

import { cn } from "@/lib/utils";
import {
  daysBetween,
  describeEvent,
  isSameMonth,
  isToday,
  monthGridRange,
  WEEKDAY_SHORT,
} from "./helpers";

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

/**
 * Month grid. Each cell renders day number + up to 3 small event
 * pills (the kind as a word, then the title) + a "+N more" link if there
 * are extras. Click cell → caller switches to day view; click pill →
 * opens the detail sheet.
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
    <div className="flex h-full flex-col overflow-y-auto" role="grid" aria-label="Month view">
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
      <div className="grid min-h-120 flex-1 auto-rows-fr grid-cols-7">
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
                {visible.map((ev) => {
                  const desc = describeEvent(ev);
                  return (
                    <li key={ev.id}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (desc.clickable) onEventClick?.(ev);
                        }}
                        className={cn(
                          "flex min-w-0 items-baseline gap-1 rounded-[3px] border px-1 py-0.5 text-[10.5px]",
                          desc.cardClasses,
                          desc.clickable ? "cursor-pointer" : "italic",
                          desc.urgent && "ring-1 ring-rose-500/60",
                        )}
                      >
                        <span className="shrink-0 font-medium">{desc.kindLabel}</span>
                        <span className={cn("truncate", desc.struck && "line-through")}>
                          {desc.title}
                        </span>
                      </span>
                    </li>
                  );
                })}
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

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function bucketByDay(events: ReadonlyArray<ParsedEvent>): Map<string, ParsedEvent[]> {
  const out = new Map<string, ParsedEvent[]>();
  for (const ev of events) {
    // A session-held booking is one of the clinic day's places; the day's pill stands for it.
    if (ev.kind === "appointment" && ev.sessionId) continue;
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
