"use client";

import type { CalendarEvent, OnEventClick } from "./types";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { EventCard } from "./event-card";
import { formatHourLabel, formatTime, isToday, minutesSinceMidnight, sameDay } from "./helpers";

/**
 * Shared time-grid primitive for week + day views.
 *
 *   - Hour rows from `hourStart` to `hourEnd` (defaults 7..20).
 *   - One or more day columns, each with absolutely-positioned event
 *     cards (top + height computed from minutes-since-grid-start).
 *   - Availability blocks render as background; appointments and clinic
 *     days sit on top as cards.
 *   - Current-time line spans the whole grid, with the time in a pill in
 *     the gutter; the grid opens scrolled to it.
 *
 * The grid is non-interactive for empty slots in GATE A — clicking
 * empty space to start a booking is a clinician-side enhancement
 * planned for a later gate.
 */

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

/** The hour gutter, wide enough for "12:30 PM" in the now-pill. */
const GUTTER_PX = 56;

interface TimeGridProps {
  /** Day columns to render — each becomes one column. */
  days: Date[];
  events: ReadonlyArray<ParsedEvent>;
  onEventClick?: OnEventClick;
  /** Day view: the day whose header carries the selection ring. */
  selectedDay?: Date;
  /** Printed in the top-left cell. Rendering is in the browser's zone; the label names the hospital's. */
  timeZoneLabel: string;
  hourStart?: number;
  hourEnd?: number;
  /** px height per hour. 64 gives a 30-minute slot room for its pill and title. */
  pxPerHour?: number;
}

export function TimeGrid({
  days,
  events,
  onEventClick,
  selectedDay,
  timeZoneLabel,
  hourStart = 7,
  hourEnd = 20,
  pxPerHour = 64,
}: TimeGridProps) {
  const totalHours = Math.max(1, hourEnd - hourStart);
  const totalHeight = totalHours * pxPerHour;
  const now = useNow();
  const columns = `${GUTTER_PX}px repeat(${days.length}, minmax(0,1fr))`;

  const dayKeys = days.map(keyOf);
  const eventsByDay = new Map<string, ParsedEvent[]>();
  for (const ev of events) {
    // A session-held booking sits exactly under its clinic-day card; the card stands for it.
    if (ev.kind === "appointment" && ev.sessionId) continue;
    const k = keyOf(ev.startsAt);
    if (!dayKeys.includes(k)) continue;
    const list = eventsByDay.get(k);
    if (list) list.push(ev);
    else eventsByDay.set(k, [ev]);
  }

  const nowOffset = minutesSinceMidnight(now) - hourStart * 60;
  const nowY = (nowOffset / 60) * pxPerHour;
  const showNow = days.some(isToday) && nowOffset >= 0 && nowOffset <= totalHours * 60;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Open on the current hour rather than 7 AM; runs once per mount.
    const el = scrollRef.current;
    if (el && showNow) el.scrollTop = Math.max(0, nowY - 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="region"
      aria-label={days.length > 1 ? "Week timeline" : "Day timeline"}
      className="flex h-full min-w-0 flex-col overflow-hidden"
    >
      {/* Day header row */}
      <div className="border-border grid border-b" style={{ gridTemplateColumns: columns }}>
        <div className="text-muted-foreground flex items-end justify-end pr-2 pb-1.5 font-mono text-[9.5px] tracking-[0.14em] uppercase">
          {timeZoneLabel}
        </div>
        {days.map((d) => {
          const today = isToday(d);
          const selected = selectedDay ? sameDay(d, selectedDay) : false;
          return (
            <div
              key={keyOf(d)}
              className={cn(
                "border-border/60 flex min-w-0 flex-col items-center gap-0.5 border-l py-2 first:border-l-0",
                today && "bg-brand-50/40 dark:bg-brand-950/20",
                selected && "ring-brand-500 ring-1 ring-inset",
              )}
            >
              <span className="text-muted-foreground font-mono text-[9.5px] tracking-[0.14em] uppercase">
                {d.toLocaleDateString(undefined, { weekday: days.length > 1 ? "short" : "long" })}
              </span>
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full font-mono text-[13px] tabular-nums",
                  today ? "bg-brand-600 text-white" : "text-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{ gridTemplateColumns: columns, height: `${totalHeight}px` }}
        >
          {/* Time column */}
          <div className="relative">
            {Array.from({ length: totalHours }).map((_, i) => (
              <div
                key={i}
                className="text-muted-foreground absolute right-2 font-mono text-[10px] tabular-nums"
                style={{ top: `${i * pxPerHour - 6}px` }}
              >
                {formatHourLabel(hourStart + i)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const dayEvents = eventsByDay.get(keyOf(d)) ?? [];
            return (
              <div
                key={keyOf(d)}
                className={cn(
                  "border-border/60 relative min-w-0 border-l first:border-l-0",
                  isToday(d) && "bg-brand-50/20 dark:bg-brand-950/10",
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

                {/* Event cards */}
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
                  const height = Math.max(24, (minutesDuration / 60) * pxPerHour);
                  return (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      heightPx={height}
                      onEventClick={onEventClick}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Current-time line — the whole width, the time in the gutter. */}
          {showNow ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-20"
              style={{ top: `${nowY}px` }}
              aria-hidden
            >
              <div className="bg-brand-600 h-px" />
              <span
                className="absolute top-0 flex -translate-y-1/2 justify-end pr-1"
                style={{ left: 0, width: GUTTER_PX }}
              >
                <span className="bg-brand-600 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium text-white tabular-nums">
                  {formatTime(now)}
                </span>
              </span>
            </div>
          ) : null}
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

function useNow(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
