"use client";

import type { CalendarEvent, OnEventClick } from "./types";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  AVAILABILITY_KIND_CLASSES,
  AVAILABILITY_KIND_LABEL,
  formatHourLabel,
  formatTime,
  isToday,
  minutesSinceMidnight,
  STATUS_BLOCK_CLASSES,
  STATUS_TONES,
} from "./helpers";

/**
 * Shared time-grid primitive for week + day views.
 *
 *   - Hour rows from `hourStart` to `hourEnd` (defaults 7..20).
 *   - One or more day columns, each with absolutely-positioned event
 *     blocks (top + height computed from minutes-since-grid-start).
 *   - Availability blocks render as background; appointments stack
 *     on top.
 *   - Current-time indicator (thin teal line) draws on today's column.
 *
 * The grid is non-interactive for empty slots in GATE A — clicking
 * empty space to start a booking is a clinician-side enhancement
 * planned for a later gate.
 */

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

interface TimeGridProps {
  /** Day columns to render — each becomes one column. */
  days: Date[];
  events: ReadonlyArray<ParsedEvent>;
  onEventClick?: OnEventClick;
  hourStart?: number;
  hourEnd?: number;
  /** px height per hour. 48 reads as comfortable for 30-min slots. */
  pxPerHour?: number;
}

export function TimeGrid({
  days,
  events,
  onEventClick,
  hourStart = 7,
  hourEnd = 20,
  pxPerHour = 48,
}: TimeGridProps) {
  const totalHours = Math.max(1, hourEnd - hourStart);
  const totalHeight = totalHours * pxPerHour;
  const nowMinutes = useNowMinutes();

  const dayKeys = days.map(keyOf);
  const eventsByDay = new Map<string, ParsedEvent[]>();
  for (const ev of events) {
    const k = keyOf(ev.startsAt);
    if (!dayKeys.includes(k)) continue;
    const list = eventsByDay.get(k);
    if (list) list.push(ev);
    else eventsByDay.set(k, [ev]);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Day header row */}
      <div
        className="border-border grid border-b"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0,1fr))` }}
      >
        <div aria-hidden />
        {days.map((d) => (
          <div
            key={keyOf(d)}
            className="border-border/60 flex flex-col items-center gap-0.5 border-l py-1.5 first:border-l-0"
          >
            <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
              {d.toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[12px] tabular-nums",
                isToday(d) ? "bg-brand-600 text-white" : "text-foreground",
              )}
            >
              {d.getDate()}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div className="flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(0,1fr))`,
            height: `${totalHeight}px`,
          }}
        >
          {/* Time column */}
          <div className="relative">
            {Array.from({ length: totalHours }).map((_, i) => (
              <div
                key={i}
                className="text-muted-foreground absolute right-1 font-mono text-[10px] tabular-nums"
                style={{ top: `${i * pxPerHour - 6}px` }}
              >
                {formatHourLabel(hourStart + i)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const dayEvents = eventsByDay.get(keyOf(d)) ?? [];
            const isCurrent = isToday(d);
            const nowOffset = isCurrent ? nowMinutes - hourStart * 60 : null;
            const nowVisible = nowOffset !== null && nowOffset >= 0 && nowOffset <= totalHours * 60;
            return (
              <div
                key={keyOf(d)}
                className={cn(
                  "border-border/60 relative border-l first:border-l-0",
                  isCurrent && "bg-brand-50/20 dark:bg-brand-950/10",
                )}
              >
                {/* Hour grid lines */}
                {Array.from({ length: totalHours }).map((_, i) => (
                  <div
                    key={i}
                    className="border-border/40 absolute right-0 left-0 border-t"
                    style={{ top: `${i * pxPerHour}px` }}
                  />
                ))}

                {/* Event blocks */}
                {dayEvents.map((ev) => {
                  const top = positionForMinute(
                    minutesSinceMidnight(ev.startsAt),
                    hourStart,
                    pxPerHour,
                  );
                  const minutesDuration = Math.max(
                    15,
                    (ev.endsAt.getTime() - ev.startsAt.getTime()) / 60_000,
                  );
                  const height = (minutesDuration / 60) * pxPerHour;
                  if (ev.kind === "availability") {
                    return (
                      <div
                        key={ev.id}
                        className={cn(
                          "pointer-events-none absolute right-0.5 left-0.5 rounded-[3px]",
                          AVAILABILITY_KIND_CLASSES[ev.availabilityKind] ?? "bg-muted/40",
                        )}
                        style={{ top: `${top}px`, height: `${Math.max(16, height)}px` }}
                        title={AVAILABILITY_KIND_LABEL[ev.availabilityKind] ?? ev.availabilityKind}
                      />
                    );
                  }
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onEventClick?.(ev)}
                      className={cn(
                        "focus-visible:ring-brand-500/40 absolute right-0.5 left-0.5 z-10 flex flex-col gap-0.5 overflow-hidden rounded-[3px] px-1.5 py-1 text-left text-[10.5px] shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:outline-none",
                        STATUS_BLOCK_CLASSES[STATUS_TONES[ev.status] ?? "pending"],
                        ev.priority === "urgent" && "ring-1 ring-rose-500/70",
                      )}
                      style={{ top: `${top}px`, height: `${Math.max(20, height)}px` }}
                    >
                      <span className="font-mono text-[10px] tabular-nums">
                        {formatTime(ev.startsAt)}
                      </span>
                      <span className="text-caption truncate leading-tight font-medium">
                        {ev.patientName}
                      </span>
                    </button>
                  );
                })}

                {/* Current-time indicator */}
                {nowVisible ? (
                  <div
                    className="pointer-events-none absolute right-0 left-0 z-20"
                    style={{ top: `${(nowOffset! / 60) * pxPerHour}px` }}
                    aria-hidden
                  >
                    <div className="relative">
                      <div className="bg-brand-600 absolute -left-1 size-2 -translate-y-1/2 rounded-full" />
                      <div className="bg-brand-600 h-px" />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function positionForMinute(minute: number, hourStart: number, pxPerHour: number): number {
  const offset = minute - hourStart * 60;
  return Math.max(0, (offset / 60) * pxPerHour);
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function useNowMinutes(): number {
  const [now, setNow] = useState<number>(() => minutesSinceMidnight(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(minutesSinceMidnight(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
