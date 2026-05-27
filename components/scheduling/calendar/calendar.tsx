"use client";

import type { CalendarView } from "./helpers";
import type { CalendarEvent, OnEventClick } from "./types";
import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgendaView } from "./agenda-view";
import { DayView } from "./day-view";
import {
  addDays,
  addMonths,
  formatDay,
  formatMonthYear,
  formatWeekRange,
  startOfDay,
  startOfWeek,
} from "./helpers";
import { MonthView } from "./month-view";
import { CalendarViewSwitcher } from "./view-switcher";
import { WeekView } from "./week-view";

/**
 * MedSync calendar — the reusable presentation primitive for the
 * scheduling addendum. Pure client component (it owns view + cursor
 * state); server components fetch a window of events and pass them
 * in. Behaviour is unchanged from the PRD — this is presentation only.
 *
 * Defaults:
 *   - week view (the workhorse for clinicians)
 *   - week starts Monday (Uganda convention)
 *   - times in the user's locale; storage is UTC (events arrive as
 *     ISO strings and are parsed once)
 *
 * Mobile: the responsive container hides the month view via
 * `allowedViews`; default becomes day on small screens.
 */
export function MedSyncCalendar({
  events,
  defaultView = "week",
  defaultDate,
  onEventClick,
  onRangeChange,
  className,
  mobile = false,
}: {
  events: ReadonlyArray<CalendarEvent>;
  defaultView?: CalendarView;
  defaultDate?: Date;
  onEventClick?: OnEventClick;
  /** Fired when the user nav's prev/next so the server can refetch a different window. */
  onRangeChange?: (cursor: Date, view: CalendarView) => void;
  className?: string;
  /** When true, hide the month view and default to day. */
  mobile?: boolean;
}) {
  const [view, setView] = useState<CalendarView>(
    mobile && defaultView === "month" ? "day" : defaultView,
  );
  const [cursor, setCursor] = useState<Date>(() => defaultDate ?? new Date());

  const allowedViews = mobile
    ? (["week", "day", "agenda"] as const)
    : (["month", "week", "day", "agenda"] as const);

  const parsedEvents = useMemo(
    () =>
      events.map((e) => ({
        ...e,
        startsAt: new Date(e.startsAtIso),
        endsAt: new Date(e.endsAtIso),
      })),
    [events],
  );

  function shift(delta: number) {
    const next =
      view === "month"
        ? addMonths(cursor, delta)
        : view === "week"
          ? addDays(cursor, delta * 7)
          : view === "day"
            ? addDays(cursor, delta)
            : addDays(cursor, delta * 7);
    setCursor(next);
    onRangeChange?.(next, view);
  }

  const headerLabel =
    view === "month"
      ? formatMonthYear(cursor)
      : view === "week"
        ? formatWeekRange(startOfWeek(cursor))
        : view === "day"
          ? formatDay(cursor)
          : formatWeekRange(startOfWeek(cursor));

  function goToday() {
    const today = startOfDay(new Date());
    setCursor(today);
    onRangeChange?.(today, view);
  }

  return (
    <section
      className={cn(
        "border-border bg-card flex min-h-[600px] flex-col overflow-hidden rounded-xl border",
        className,
      )}
      aria-label="Calendar"
    >
      {/* ── Control bar ───────────────────────────────────────── */}
      <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            onClick={() => shift(-1)}
            aria-label="Previous"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="iconSm"
            onClick={() => shift(1)}
            aria-label="Next"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <h2 className="font-display text-foreground ml-1 text-[15px] font-medium tracking-[-0.005em]">
            {headerLabel}
          </h2>
        </div>

        <CalendarViewSwitcher
          value={view}
          onChange={(v) => setView(v)}
          allowedViews={allowedViews}
        />
      </header>

      {/* ── View region ───────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {view === "month" ? (
          <MonthView
            cursor={cursor}
            events={parsedEvents}
            onDayClick={(d) => {
              setCursor(d);
              setView("day");
            }}
            onEventClick={onEventClick}
          />
        ) : null}
        {view === "week" ? (
          <WeekView cursor={cursor} events={parsedEvents} onEventClick={onEventClick} />
        ) : null}
        {view === "day" ? (
          <DayView cursor={cursor} events={parsedEvents} onEventClick={onEventClick} />
        ) : null}
        {view === "agenda" ? (
          <AgendaView cursor={cursor} events={parsedEvents} onEventClick={onEventClick} />
        ) : null}
      </div>
    </section>
  );
}

/** Re-export for external callers. */
export type { CalendarEvent, OnEventClick } from "./types";
export type { CalendarView } from "./helpers";
