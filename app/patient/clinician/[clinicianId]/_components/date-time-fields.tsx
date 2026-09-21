"use client";

import { useMemo, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
} from "lucide-react";

import { formatTime } from "@/lib/patient/booking-format";
import { cn } from "@/lib/utils";
import { DEFAULT_TIME_ZONE, localDateKey } from "@/supabase/functions/_shared/slots";

/**
 * The reference's "Schedule send": two fields side by side — the day, with a
 * calendar icon, that opens a month grid; the time, with a clock icon, that
 * is a list of the day's open times — and nothing else. The grid enables
 * only days with something open; the chosen day is the one filled square.
 *
 * The time is a native `<select>` (a phone opens its own picker; a keyboard
 * types into it); the calendar is a popover anchored to its field. Same
 * component, same name, on the phone.
 */
export function DateTimeFields({
  slotsByDate,
  day,
  slot,
  onDay,
  onSlot,
}: {
  slotsByDate: Record<string, ReadonlyArray<{ startsAtIso: string; endsAtIso: string }>>;
  day: string | null;
  slot: string | null;
  onDay: (day: string) => void;
  onSlot: (startsAtIso: string) => void;
}) {
  const days = useMemo(() => Object.keys(slotsByDate).sort(), [slotsByDate]);
  const slots = day ? (slotsByDate[day] ?? []) : [];
  const today = localDateKey(new Date(), DEFAULT_TIME_ZONE);
  const timeId = "time-field";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <DayField days={days} day={day} today={today} onDay={onDay} />

      <label className="relative">
        <span className="sr-only">Time</span>
        <ClockIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
        />
        <select
          id={timeId}
          value={slot ?? ""}
          disabled={slots.length === 0}
          onChange={(e) => e.target.value && onSlot(e.target.value)}
          className={cn(
            "bg-card text-body-m text-foreground border-border focus-visible:border-brand-500 h-12 w-full appearance-none rounded-xl border pr-10 pl-10 outline-none focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)]",
            "disabled:text-muted-foreground disabled:cursor-not-allowed",
            !slot && "text-muted-foreground",
          )}
        >
          <option value="" disabled>
            {slots.length === 0 ? "No times open" : "Choose a time"}
          </option>
          {slots.map((s) => (
            <option key={s.startsAtIso} value={s.startsAtIso}>
              {formatTime(s.startsAtIso)} – {formatTime(s.endsAtIso)}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2"
        />
      </label>
    </div>
  );
}

/* ─── The day field and its month grid ──────────────────────────── */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function DayField({
  days,
  day,
  today,
  onDay,
}: {
  days: ReadonlyArray<string>;
  day: string | null;
  today: string;
  onDay: (day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // The month on view: the chosen day's, else the first open day's.
  const [month, setMonth] = useState<string>(() => (day ?? days[0] ?? today).slice(0, 7));
  const openSet = useMemo(() => new Set(days), [days]);
  const label =
    day === null ? "Choose a day" : day === today ? "Today" : DAY_SHORT.format(atNoon(day));

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        className={cn(
          "bg-card text-body-m text-foreground border-border focus-visible:border-brand-500 flex h-12 w-full items-center gap-2.5 rounded-xl border px-3.5 text-left outline-none focus-visible:shadow-[0_0_0_2px_rgba(20,184,166,0.15)]",
          day === null && "text-muted-foreground",
        )}
        aria-label={`Day: ${label}. Opens a calendar`}
      >
        <CalendarIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <ChevronDownIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={8} align="start" className="z-50">
          <PopoverPrimitive.Popup
            className={cn(
              "bg-popover text-popover-foreground ring-foreground/10 w-[19.5rem] rounded-2xl p-3 shadow-lg ring-1 outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 duration-150",
            )}
            style={{ transformOrigin: "var(--transform-origin)" }}
          >
            <MonthGrid
              month={month}
              day={day}
              today={today}
              openDays={openSet}
              onMonth={setMonth}
              onPick={(d) => {
                onDay(d);
                setOpen(false);
              }}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function MonthGrid({
  month,
  day,
  today,
  openDays,
  onMonth,
  onPick,
}: {
  month: string;
  day: string | null;
  today: string;
  openDays: Set<string>;
  onMonth: (month: string) => void;
  onPick: (day: string) => void;
}) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // Monday-first: the offset of the 1st inside the week row.
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const step = (delta: number) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1));
    onMonth(d.toISOString().slice(0, 7));
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Calendar">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="hover:bg-muted focus-visible:ring-ring grid size-9 place-items-center rounded-lg outline-none focus-visible:ring-2"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
        </button>
        <span className="text-body-m text-foreground font-medium" aria-live="polite">
          {MONTH_YEAR.format(first)}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="hover:bg-muted focus-visible:ring-ring grid size-9 place-items-center rounded-lg outline-none focus-visible:ring-2"
        >
          <ChevronRightIcon className="size-4" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-caption text-muted-foreground py-1 text-center">
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`pad-${i}`} aria-hidden />
          ) : (
            <button
              key={d}
              type="button"
              disabled={!openDays.has(d)}
              aria-pressed={d === day}
              aria-label={`${DAY_SHORT.format(atNoon(d))}${d === today ? ", today" : ""}${openDays.has(d) ? "" : ", nothing open"}`}
              onClick={() => onPick(d)}
              className={cn(
                "mx-auto grid size-10 place-items-center rounded-xl font-mono text-[14px] tabular-nums outline-none",
                "focus-visible:ring-ring focus-visible:ring-2",
                d === day
                  ? "bg-foreground text-background font-medium"
                  : openDays.has(d)
                    ? "text-foreground hover:bg-muted"
                    : "text-muted-foreground/50 cursor-not-allowed",
                d === today && d !== day && "ring-border ring-1",
              )}
            >
              {Number(d.slice(8, 10))}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function atNoon(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}
