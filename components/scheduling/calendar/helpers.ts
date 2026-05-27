/**
 * Calendar date math + status helpers. Native Date + Intl only —
 * deliberately no date-fns / luxon so the bundle stays light and the
 * timezone semantics are explicit (EAT for display; UTC stored).
 *
 * "Day starts at 00:00 local" semantics: we use Date methods that
 * respect the user's locale + tz for *grid placement* (which day a
 * 22:30 EAT slot belongs to). Storage is UTC; rendering is local.
 */

export type CalendarView = "month" | "week" | "day" | "agenda";

/** Inclusive start, exclusive end. */
export interface DateRange {
  start: Date;
  end: Date;
}

/** Status semantic colour tone — feeds the calendar event block. */
export type StatusTone =
  | "pending"
  | "confirmed"
  | "arrived"
  | "completed"
  | "cancelled"
  | "no_show";

export const STATUS_TONES: Record<string, StatusTone> = {
  requested: "pending",
  pending_approval: "pending",
  confirmed: "confirmed",
  arrived: "arrived",
  in_progress: "arrived",
  completed: "completed",
  cancelled: "cancelled",
  declined: "cancelled",
  no_show: "no_show",
  rescheduled: "cancelled",
};

export const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  pending_approval: "Awaiting approval",
  confirmed: "Confirmed",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  no_show: "Missed",
  rescheduled: "Rescheduled",
};

/** Map a status tone to Tailwind classes per DESIGN-medsync.md (semantic only). */
export const STATUS_BLOCK_CLASSES: Record<StatusTone, string> = {
  pending:
    "bg-amber-50 text-amber-900 border-l-2 border-l-amber-500 dark:bg-amber-950/30 dark:text-amber-100 dark:border-l-amber-400",
  confirmed:
    "bg-teal-50 text-teal-900 border-l-2 border-l-teal-600 dark:bg-teal-950/30 dark:text-teal-100 dark:border-l-teal-400",
  arrived:
    "bg-blue-50 text-blue-900 border-l-2 border-l-blue-600 dark:bg-blue-950/30 dark:text-blue-100 dark:border-l-blue-400",
  completed: "bg-muted text-muted-foreground border-l-2 border-l-border",
  cancelled: "bg-muted/60 text-muted-foreground line-through border-l-2 border-l-border opacity-70",
  no_show:
    "bg-rose-50 text-rose-900 border-l-2 border-l-rose-600 dark:bg-rose-950/30 dark:text-rose-100 dark:border-l-rose-400",
};

/** Availability block kinds → background classes (recede behind appointments). */
export const AVAILABILITY_KIND_CLASSES: Record<string, string> = {
  bookable: "bg-teal-50/50 dark:bg-teal-950/15",
  teaching:
    "bg-[repeating-linear-gradient(45deg,transparent_0,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_8px)] dark:bg-[repeating-linear-gradient(45deg,transparent_0,transparent_6px,rgba(255,255,255,0.04)_6px,rgba(255,255,255,0.04)_8px)]",
  ward_round:
    "bg-[repeating-linear-gradient(45deg,transparent_0,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_8px)] dark:bg-[repeating-linear-gradient(45deg,transparent_0,transparent_6px,rgba(255,255,255,0.04)_6px,rgba(255,255,255,0.04)_8px)]",
  admin: "bg-muted/40",
  leave: "bg-muted/60 opacity-60",
  unavailable: "bg-muted/70 opacity-60",
};

export const AVAILABILITY_KIND_LABEL: Record<string, string> = {
  bookable: "Bookable",
  teaching: "Teaching",
  ward_round: "Ward round",
  admin: "Admin",
  leave: "Leave",
  unavailable: "Unavailable",
};

/* ─── Date math ─────────────────────────────────────────────────── */

export function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** Week starts on Monday — matches Ugandan + European conventions. */
export function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = (day + 6) % 7; // distance back to Monday
  const next = startOfDay(d);
  next.setDate(next.getDate() - diff);
  return next;
}

export function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const next = new Date(start);
  next.setDate(next.getDate() + 7);
  return next;
}

export function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

/** Inclusive grid covering a month: starts on Monday of the first week, ends Sunday of the last week. */
export function monthGridRange(d: Date): DateRange {
  return { start: startOfWeek(startOfMonth(d)), end: endOfWeek(endOfMonth(d)) };
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** Days in [start, end). */
export function daysBetween(range: DateRange): Date[] {
  const out: Date[] = [];
  let cursor = startOfDay(range.start);
  const end = startOfDay(range.end);
  while (cursor < end) {
    out.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

/* ─── Formatters ────────────────────────────────────────────────── */

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startLabel = weekStart.toLocaleDateString(undefined, {
    month: sameMonth ? "short" : "short",
    day: "numeric",
  });
  const endLabel = sameMonth
    ? end.toLocaleDateString(undefined, { day: "numeric" })
    : end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel} – ${endLabel}, ${weekStart.getFullYear()}`;
}

export function formatDay(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatHourLabel(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

/** Minutes-since-midnight for a Date (local time). */
export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
