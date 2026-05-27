"use client";

import type { CalendarEvent, OnEventClick } from "./types";

import { startOfDay } from "./helpers";
import { TimeGrid } from "./time-grid";

type ParsedEvent = CalendarEvent & { startsAt: Date; endsAt: Date };

export function DayView({
  cursor,
  events,
  onEventClick,
}: {
  cursor: Date;
  events: ReadonlyArray<ParsedEvent>;
  onEventClick?: OnEventClick;
}) {
  return <TimeGrid days={[startOfDay(cursor)]} events={events} onEventClick={onEventClick} />;
}
