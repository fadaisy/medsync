"use client";

import type { CalendarEvent, OnEventClick } from "./types";

import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";
import {
  dayKey,
  daysBetween,
  describeEvent,
  endOfWeek,
  eventDayKey,
  formatDay,
  formatTimeRange,
  isToday,
  startOfWeek,
} from "./helpers";

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

/**
 * Chronological agenda for the week containing `cursor`. Compact;
 * groups by day; designed to read top-to-bottom for a quick scan.
 * Lists appointments and clinic days — every session-held booking too,
 * since a list is where twenty names for one clinic morning belong.
 * Availability blocks stay off it, as on the day's own column they are
 * background.
 */
export function AgendaView({
  cursor,
  events,
  onEventClick,
}: {
  cursor: Date;
  events: ReadonlyArray<ParsedEvent>;
  onEventClick?: OnEventClick;
}) {
  const days = daysBetween({ start: startOfWeek(cursor), end: endOfWeek(cursor) });
  const byDay = bucketByDay(events.filter((e) => e.kind !== "availability"));

  return (
    <div className="h-full overflow-y-auto" role="list" aria-label="Agenda">
      <ul className="divide-border/60 divide-y">
        {days.map((d) => {
          const dayEvents = byDay.get(dayKey(d)) ?? [];
          return (
            <li key={dayKey(d)} className="flex flex-col gap-1 px-3 py-2 sm:px-4">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-mono text-[10.5px] tracking-[0.12em] uppercase",
                    isToday(d) ? "text-brand-700 dark:text-brand-300" : "text-muted-foreground",
                  )}
                >
                  {formatDay(d)}
                </span>
                {isToday(d) ? (
                  <span className="text-muted-foreground font-mono text-[9.5px] uppercase">
                    today
                  </span>
                ) : null}
                <span className="text-muted-foreground/80 ml-auto font-mono text-[10.5px] tabular-nums">
                  {dayEvents.length} {dayEvents.length === 1 ? "item" : "items"}
                </span>
              </div>

              {dayEvents.length === 0 ? (
                <p className="text-muted-foreground/80 text-[12px]">Nothing scheduled.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {dayEvents.map((ev) => {
                    const desc = describeEvent(ev);
                    return (
                      <li key={ev.id}>
                        <button
                          type="button"
                          onClick={() => onEventClick?.(ev)}
                          aria-label={[
                            desc.kindLabel,
                            desc.statusWord,
                            desc.title,
                            desc.subtitle,
                            formatTimeRange(ev.startsAt, ev.endsAt),
                          ]
                            .filter(Boolean)
                            .join(", ")}
                          className={cn(
                            "border-border hover:bg-muted/40 hover:border-foreground/15 ease-expo-out flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors duration-150",
                            desc.urgent && "ring-1 ring-rose-500/60",
                          )}
                        >
                          <span className="text-foreground w-[7.5rem] shrink-0 font-mono text-[11.5px] tabular-nums">
                            {formatTimeRange(ev.startsAt, ev.endsAt)}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Pill
                                tone={desc.pillTone}
                                className="shrink-0 rounded-full px-1.5 py-0 text-[10px]"
                              >
                                {desc.kindLabel}
                              </Pill>
                              {desc.statusWord ? (
                                <span className="text-muted-foreground truncate text-[10.5px]">
                                  {desc.statusWord}
                                </span>
                              ) : null}
                            </span>
                            <span
                              className={cn(
                                "text-foreground text-body-s truncate font-medium",
                                desc.struck && "text-muted-foreground line-through",
                              )}
                            >
                              {desc.title}
                            </span>
                            {desc.subtitle ? (
                              <span className="text-muted-foreground truncate text-[11.5px]">
                                {desc.subtitle}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function bucketByDay(events: ReadonlyArray<ParsedEvent>): Map<string, ParsedEvent[]> {
  const out = new Map<string, ParsedEvent[]>();
  for (const ev of events) {
    const k = eventDayKey(ev.startsAt);
    const list = out.get(k);
    if (list) list.push(ev);
    else out.set(k, [ev]);
  }
  for (const list of out.values()) list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}
