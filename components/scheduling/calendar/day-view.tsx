"use client";

import type { CalendarEvent, OnEventClick } from "./types";

import { startOfDay } from "./helpers";
import { TimeGrid } from "./time-grid";

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

export function DayView({
  cursor,
  events,
  onEventClick,
  timeZoneLabel,
}: {
  cursor: Date;
  events: ReadonlyArray<ParsedEvent>;
  onEventClick?: OnEventClick;
  timeZoneLabel: string;
}) {
  const day = startOfDay(cursor);
  return (
    <TimeGrid
      days={[day]}
      selectedDay={day}
      events={events}
      onEventClick={onEventClick}
      timeZoneLabel={timeZoneLabel}
    />
  );
}
