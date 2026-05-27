"use client";

import type { CalendarEvent, OnEventClick } from "./types";

import { cn } from "@/lib/utils";
import {
  daysBetween,
  endOfWeek,
  formatDay,
  formatTime,
  isToday,
  startOfWeek,
  STATUS_LABEL,
  STATUS_TONES,
} from "./helpers";

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

/**
 * Chronological agenda for the week containing `cursor`. Compact;
 * groups by day; designed to read top-to-bottom for a quick scan.
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
  const byDay = bucketByDay(events);

  return (
    <div className="h-full overflow-y-auto" role="list" aria-label="Agenda">
      <ul className="divide-border/60 divide-y">
        {days.map((d) => {
          const dayEvents = (byDay.get(keyOf(d)) ?? []).filter((e) => e.kind === "appointment");
          return (
            <li key={keyOf(d)} className="flex flex-col gap-1 px-3 py-2 sm:px-4">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-mono text-[10.5px] tracking-[0.12em] uppercase",
                    isToday(d) ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground",
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
                  {dayEvents.length} {dayEvents.length === 1 ? "appt" : "appts"}
                </span>
              </div>

              {dayEvents.length === 0 ? (
                <p className="text-muted-foreground/80 text-[12px]">Nothing scheduled.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {dayEvents.map((ev) => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => onEventClick?.(ev)}
                        className="border-border hover:bg-muted/40 hover:border-foreground/15 flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors"
                      >
                        <span className="text-foreground shrink-0 font-mono text-[12px] tabular-nums">
                          {formatTime(ev.startsAt)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-foreground truncate text-[13px] font-medium">
                            {ev.patientName}
                          </span>
                          <span className="text-muted-foreground truncate text-[11.5px]">
                            {ev.reason} · {ev.type === "virtual" ? "Virtual" : "In-person"}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "font-mono text-[10px] tracking-[0.06em] uppercase tabular-nums",
                            toneText(ev.status),
                          )}
                        >
                          {STATUS_LABEL[ev.status] ?? ev.status}
                        </span>
                        {ev.priority === "urgent" ? (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                            URGENT
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function toneText(status: string): string {
  const t = STATUS_TONES[status] ?? "pending";
  if (t === "confirmed") return "text-teal-700 dark:text-teal-300";
  if (t === "arrived") return "text-blue-700 dark:text-blue-300";
  if (t === "no_show") return "text-rose-700 dark:text-rose-300";
  if (t === "cancelled" || t === "completed") return "text-muted-foreground";
  return "text-amber-700 dark:text-amber-300";
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
  for (const list of out.values()) list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}
